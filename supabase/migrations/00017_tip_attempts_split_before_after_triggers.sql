-- Issue #8 follow-up (PR #19 ninth review pass): double-notification
-- bug on the upsert-conflict path.
--
-- `handle_tip_attempt_result` is a **BEFORE INSERT OR UPDATE** trigger
-- that both validates NEW and emits the `try_it_result` notification.
-- The client's result-linking mutation (`useLinkTipAttemptResult`)
-- calls Postgrest's `.upsert(..., { onConflict: 'source_tip_id,user_id' })`,
-- which compiles down to `INSERT ... ON CONFLICT DO UPDATE`.
--
-- Postgres behavior on that statement (docs):
--   > Row-level BEFORE INSERT triggers are always fired for each row
--   > proposed for insertion, regardless of whether the insertion
--   > ultimately results in an update.
--
-- So in the common pledge-then-post flow:
--   1. BEFORE INSERT fires → trigger runs the notification INSERT
--      (side effect committed).
--   2. ON CONFLICT kicks in → the row-insert is abandoned, but the
--      notification row stays.
--   3. BEFORE UPDATE fires for the conflict-redirected update → the
--      same notification INSERT runs again.
--   ⇒ Source tip's author receives **two** identical try_it_result
--     notifications per result post.
--
-- Fix: split the trigger along the BEFORE / AFTER seam.
--   * BEFORE INSERT OR UPDATE: keep all validation + completed_at
--     stamping (needs to mutate NEW, must be BEFORE).
--   * AFTER INSERT OR UPDATE: new trigger that only fires the
--     notification. AFTER triggers are only invoked for the action
--     that actually took place (per docs) — on an upsert conflict,
--     AFTER UPDATE fires but AFTER INSERT does not, so exactly one
--     notification is emitted. A plain INSERT with no conflict fires
--     only AFTER INSERT. Either way: single notification.

-- 1. BEFORE trigger: validation + stamping only. Notification insert
--    is removed; everything else is identical to the 00016 version.
create or replace function knowledge_share_hub.handle_tip_attempt_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result_author_id uuid;
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

  -- completed_at is a one-way latch.
  if tg_op = 'UPDATE'
     and old.completed_at is not null
     and new.completed_at is null then
    raise exception
      'tip_attempts.completed_at cannot be cleared once set (attempt=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  -- result_tip_id immutability + block user-initiated nulling (the FK
  -- is now ON DELETE CASCADE, so the legitimate "null" path is a row
  -- delete, not an update).
  if tg_op = 'UPDATE' and old.result_tip_id is not null then
    if new.result_tip_id is null then
      raise exception
        'tip_attempts.result_tip_id cannot be cleared (attempt=%); delete the result tip or the attempt row instead',
        old.id
        using errcode = 'check_violation';
    elsif old.result_tip_id is distinct from new.result_tip_id then
      raise exception
        'tip_attempts.result_tip_id cannot be reassigned once set (attempt=%, old=%, new=%)',
        old.id, old.result_tip_id, new.result_tip_id
        using errcode = 'check_violation';
    end if;
  end if;

  -- Defense-in-depth (unreachable with FK=CASCADE): no re-link after
  -- a loop-close marker has been placed.
  if tg_op = 'UPDATE'
     and old.result_tip_id is null
     and new.result_tip_id is not null
     and old.completed_at is not null then
    raise exception
      'tip_attempts: result already recorded; cannot re-link (attempt=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  -- Pending pledge (no result yet) or idempotent re-submit: nothing to
  -- validate further, no stamping needed.
  if new.result_tip_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.result_tip_id is not distinct from new.result_tip_id then
    return new;
  end if;

  -- Ownership: linked result tip must be authored by the pledging user.
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

  -- Stamp the completion timestamp on first link.
  if new.completed_at is null then
    new.completed_at := now();
  end if;

  return new;
end;
$$;

-- 2. AFTER trigger: notification side effect. Only fires for the
--    action that actually took place (INSERT on a fresh pledge-and-
--    link, UPDATE on the upsert-conflict path), so the source author
--    gets exactly one notification per linked result.
create or replace function knowledge_share_hub.notify_tip_attempt_result_linked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_author_id uuid;
  v_result_is_anonymous boolean;
  v_actor_name text;
begin
  -- Only fire when result_tip_id is being set to a non-null value
  -- (INSERT with a non-null value, or UPDATE that changes it).
  if new.result_tip_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and old.result_tip_id is not distinct from new.result_tip_id then
    return null;
  end if;

  select author_id into v_source_author_id
  from knowledge_share_hub.tips
  where id = new.source_tip_id;

  select is_anonymous into v_result_is_anonymous
  from knowledge_share_hub.tips
  where id = new.result_tip_id;

  if v_source_author_id is null or v_result_is_anonymous is null then
    return null;
  end if;

  -- Don't notify when the pledging user is also the source author.
  if v_source_author_id = new.user_id then
    return null;
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

  return null;
end;
$$;

create trigger trg_ksh_notify_tip_attempt_result_linked
  after insert or update on knowledge_share_hub.tip_attempts
  for each row execute function knowledge_share_hub.notify_tip_attempt_result_linked();
