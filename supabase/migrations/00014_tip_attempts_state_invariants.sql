-- Issue #8 follow-up (PR #19 sixth review pass). Two state-invariant
-- holes in `handle_tip_attempt_result` as shipped by 00013:
--
-- 1. **`completed_at` not cleared when result cascades to NULL.**
--    Deleting a linked result tip fires `ON DELETE SET NULL` on
--    `tip_attempts.result_tip_id`, which leaves the attempt with
--    `result_tip_id IS NULL` **but** `completed_at IS NOT NULL` — a
--    contradictory state (myAttempt looks "completed" even though
--    the hook's `result_tip_id === null` check now treats it as
--    pending). Clear `completed_at` on that exact transition so the
--    row returns to a clean "pending pledge" state; the follow-up
--    dispatcher's `follow_up_notified_at` guard still prevents a
--    duplicate nudge.
--
-- 2. **`user_id` change bypass.** The ownership check on
--    `result_tip_id` only runs when `result_tip_id` itself changes.
--    An UPDATE that keeps `result_tip_id` but swaps `user_id` (only
--    reachable for service-role callers; authenticated callers are
--    already blocked by the RLS `with check auth.uid() = user_id`)
--    would preserve an incoherent row where the attempting user
--    doesn't author the result tip. Lock `user_id` immutable at
--    the trigger layer as defense-in-depth.

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
  -- user_id is identity; once the row exists it cannot move to another
  -- user. This also blocks the bypass where user_id is swapped while
  -- result_tip_id stays constant (skipping the ownership check below).
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    raise exception
      'tip_attempts.user_id is immutable (attempt=%, old=%, new=%)',
      old.id, old.user_id, new.user_id
      using errcode = 'check_violation';
  end if;

  -- Reject real result swaps (R1 → R2). NULL transitions are allowed so
  -- that `on delete set null` can cascade when a result tip is deleted.
  if tg_op = 'UPDATE'
     and old.result_tip_id is not null
     and new.result_tip_id is not null
     and old.result_tip_id is distinct from new.result_tip_id then
    raise exception
      'tip_attempts.result_tip_id cannot be reassigned once set (attempt=%, old=%, new=%)',
      old.id, old.result_tip_id, new.result_tip_id
      using errcode = 'check_violation';
  end if;

  -- Row has no result (either freshly pledged, or the linked result
  -- was just deleted and FK cascade nulled us out). When the latter,
  -- also clear completed_at so the state stays coherent.
  if new.result_tip_id is null then
    if tg_op = 'UPDATE' and old.result_tip_id is not null then
      new.completed_at := null;
    end if;
    return new;
  end if;

  -- Skip on updates that don't touch result_tip_id (e.g.
  -- follow_up_notified_at stamping from the dispatcher). Safe now
  -- that user_id is pinned immutable above.
  if tg_op = 'UPDATE'
     and old.result_tip_id is not distinct from new.result_tip_id then
    return new;
  end if;

  -- Ownership: the linked result tip must be authored by the pledging
  -- user. Blocks silently-crafted upserts attributing someone else's
  -- tip as the user's "result".
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
