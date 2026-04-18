-- Issue #8 follow-up (PR #19 seventh review pass). Two P1 holes that
-- survived the earlier rounds:
--
-- 1. **`source_tip_id` mutable post-insert.** The update policy only
--    checked `auth.uid() = user_id` (plus the self-check from 00010).
--    An owner could re-point `source_tip_id` to a different tip
--    authored by someone else; the early-return path (when
--    result_tip_id was unchanged) skipped the ownership checks, so
--    lineage silently migrated — without re-sending the result
--    notification to the new source author. Freeze `source_tip_id`
--    immutable at the trigger layer, same model as `user_id`.
--
-- 2. **Re-link bypass via null reset.** 00014 allowed user-initiated
--    nulling of `result_tip_id` (needed for the FK `ON DELETE SET
--    NULL` cascade) and cleared `completed_at` alongside. That let a
--    client clear the result link and then upsert a fresh
--    `result_tip_id`, bypassing the "no swap" guard and producing a
--    duplicate `try_it_result` notification. Close this by using
--    `completed_at` as a persistent "ever linked" marker:
--      - Stop clearing it on cascade (keep the stamp).
--      - Reject any UPDATE that clears completed_at itself.
--      - Reject any UPDATE that sets a non-null result_tip_id when
--        completed_at is already set (i.e., the loop was already
--        closed once).
--    The resulting terminal state (`result_tip_id IS NULL AND
--    completed_at IS NOT NULL`) represents "result tip was deleted
--    after the loop closed"; the UI treats it as completed.
--
-- The trigger is re-issued in full for readability.

create or replace function knowledge_share_hub.handle_tip_attempt_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_author_id uuid;
  v_result_author_id uuid;
  v_actor_name text;
  v_result_is_anonymous boolean;
begin
  -- Identity columns never change after the row exists.
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    raise exception
      'tip_attempts.user_id is immutable (attempt=%, old=%, new=%)',
      old.id, old.user_id, new.user_id
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE'
     and old.source_tip_id is distinct from new.source_tip_id then
    raise exception
      'tip_attempts.source_tip_id is immutable (attempt=%, old=%, new=%)',
      old.id, old.source_tip_id, new.source_tip_id
      using errcode = 'check_violation';
  end if;

  -- `completed_at` is a one-way latch: once set, it stays set. The
  -- terminal state `(result_tip_id IS NULL, completed_at IS NOT NULL)`
  -- is reachable only via the FK cascade when the linked result tip
  -- is deleted; any attempt to UPDATE completed_at back to null (the
  -- step that would enable the re-link bypass) is rejected.
  if tg_op = 'UPDATE'
     and old.completed_at is not null
     and new.completed_at is null then
    raise exception
      'tip_attempts.completed_at cannot be cleared once set (attempt=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  -- result_tip_id immutability: reject real swaps (both non-null,
  -- distinct). NULL transitions are allowed for FK cascade
  -- (`ON DELETE SET NULL`); the next check closes the re-link path.
  if tg_op = 'UPDATE'
     and old.result_tip_id is not null
     and new.result_tip_id is not null
     and old.result_tip_id is distinct from new.result_tip_id then
    raise exception
      'tip_attempts.result_tip_id cannot be reassigned once set (attempt=%, old=%, new=%)',
      old.id, old.result_tip_id, new.result_tip_id
      using errcode = 'check_violation';
  end if;

  -- Re-link block: once the loop has been closed once (completed_at
  -- is set), refuse to link a new result_tip_id. Combined with the
  -- completed_at immutability above, this is the "write-once for the
  -- attempt's lifetime" invariant the reviewer asked for.
  if tg_op = 'UPDATE'
     and old.result_tip_id is null
     and new.result_tip_id is not null
     and old.completed_at is not null then
    raise exception
      'tip_attempts: result already recorded; cannot re-link after the loop has closed (attempt=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  -- No-op fast-paths from here on.
  if new.result_tip_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.result_tip_id is not distinct from new.result_tip_id then
    return new;
  end if;

  -- Ownership: the linked result tip must be authored by the pledging
  -- user.
  select author_id into v_result_author_id
  from knowledge_share_hub.tips
  where id = new.result_tip_id;

  if v_result_author_id is null then
    raise exception
      'tip_attempts.result_tip_id references a missing tip (%)',
      new.result_tip_id
      using errcode = 'foreign_key_violation';
  end if;

  if v_result_author_id <> new.user_id then
    raise exception
      'tip_attempts.result_tip_id must be authored by user_id (user=%, result_tip_author=%)',
      new.user_id, v_result_author_id
      using errcode = 'check_violation';
  end if;

  if new.completed_at is null then
    new.completed_at := now();
  end if;

  -- Notify the source author that their tip produced a result.
  select author_id into v_source_author_id
  from knowledge_share_hub.tips
  where id = new.source_tip_id;

  select is_anonymous into v_result_is_anonymous
  from knowledge_share_hub.tips
  where id = new.result_tip_id;

  if v_source_author_id is null or v_result_is_anonymous is null then
    return new;
  end if;

  if v_source_author_id = new.user_id then
    return new;
  end if;

  if v_result_is_anonymous then
    v_actor_name := '名無しエンジニア';
  else
    select display_name into v_actor_name
    from knowledge_share_hub.profiles
    where id = new.user_id;
  end if;

  insert into knowledge_share_hub.notifications
    (user_id, type, content_type, content_id, actor_id, is_read, message)
  values (
    v_source_author_id,
    'try_it_result',
    'tip',
    new.result_tip_id,
    new.user_id,
    false,
    coalesce(v_actor_name, '誰か')
      || 'さんがあなたの気づきを試した結果を投稿しました'
  );

  return new;
end;
$$;
