-- Issue #8 follow-up (PR #19 tenth review pass, P2 codex):
--
-- The dispatcher in `dispatch_try_it_followups()` skips any row where
-- `completed_at IS NOT NULL` (a belt-and-suspenders filter added in
-- 00016 to protect legacy state-C rows). But the BEFORE trigger only
-- stamps `completed_at` when the user links a result, and nothing was
-- rejecting a client that directly wrote `completed_at` without also
-- setting `result_tip_id`:
--
--   INSERT INTO tip_attempts (source_tip_id, user_id, completed_at)
--   VALUES (<source>, auth.uid(), now());
--
-- After that row is inserted, the dispatcher will never nudge this
-- user — they've silently marked the pledge "completed" without ever
-- posting a result. That defeats the point of the 3-day reminder.
--
-- Fix: `completed_at` must not be set while `result_tip_id` is null.
-- This applies to both INSERT (client pre-stamping) and UPDATE
-- (client stamping after the fact without linking). Existing flows
-- are unaffected because the trigger itself auto-stamps
-- `completed_at` in the same transaction as the result link.

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

  -- completed_at requires result_tip_id. Blocks the "mark complete
  -- without posting a result" bypass that would otherwise silence
  -- the follow-up dispatcher forever.
  if new.completed_at is not null and new.result_tip_id is null then
    raise exception
      'tip_attempts.completed_at cannot be set without result_tip_id (attempt=%)',
      coalesce(old.id, new.id)
      using errcode = 'check_violation';
  end if;

  -- result_tip_id immutability + block user-initiated nulling (FK is
  -- ON DELETE CASCADE, so the legitimate null path is a row delete).
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

  -- Defense-in-depth: no re-link after a loop-close marker has been
  -- placed (unreachable under FK=CASCADE, kept for safety).
  if tg_op = 'UPDATE'
     and old.result_tip_id is null
     and new.result_tip_id is not null
     and old.completed_at is not null then
    raise exception
      'tip_attempts: result already recorded; cannot re-link (attempt=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  -- Pending pledge (no result yet): further validation/stamping skipped.
  if new.result_tip_id is null then
    return new;
  end if;
  -- Idempotent re-submit: result unchanged.
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

  -- Stamp completion on first link.
  if new.completed_at is null then
    new.completed_at := now();
  end if;

  return new;
end;
$$;
