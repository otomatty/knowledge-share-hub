-- Issue #8 follow-up (PR #19 thirteenth review pass). Two remaining
-- leaks the last migration missed:
--
-- 1. **P2: INSERT path bypasses scheduler-field immutability.** The
--    00020 guards for `pledged_at` / `follow_up_notified_at` only fired
--    for UPDATE. A client could INSERT a pending attempt with
--    `follow_up_notified_at = now()` already set, and the dispatcher —
--    which filters on `follow_up_notified_at IS NULL` — would never
--    nudge the row. `pledged_at` had the same hole: a caller could
--    pass a future timestamp to move themselves out of the 3-day
--    window indefinitely.
--
--    Fix: on INSERT, reject a non-null `follow_up_notified_at` and
--    force `pledged_at := now()` so clients can't shift the window.
--    The dispatcher never INSERTs (it only UPDATEs), so this doesn't
--    need a carve-out for the system-managed path.
--
-- 2. **P2: result-link validation accepts any status.** The ownership
--    check only looked at `tips.author_id`, not `tips.status`. A user
--    could link one of their own drafts as `result_tip_id`, which
--    closes their own pledge loop (so the dispatcher stops nudging)
--    while the source author can't actually see the draft under the
--    tips RLS policy (`published OR author_id = auth.uid()`). The
--    try_it_result notification fires pointing at an invisible tip.
--
--    Fix: reject linking a result tip whose `status <> 'published'`.
--    Drafts can be promoted to published later; until then they're
--    not a valid "試した結果".

create or replace function knowledge_share_hub.handle_tip_attempt_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result_author_id uuid;
  v_result_status knowledge_share_hub.content_status;
begin
  -- INSERT-time scheduler field normalization. Clients shouldn't be
  -- able to set either of these directly.
  if tg_op = 'INSERT' then
    if new.follow_up_notified_at is not null then
      raise exception
        'tip_attempts.follow_up_notified_at is system-managed and cannot be set on INSERT'
        using errcode = 'check_violation';
    end if;
    -- Force pledged_at to "now" so a client can't pre-date or post-date
    -- the 3-day follow-up window. The column has `default now()` but
    -- that's only applied when the client omits the value.
    new.pledged_at := now();
  end if;

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

  -- Scheduler fields (UPDATE side).
  if tg_op = 'UPDATE'
     and old.pledged_at is distinct from new.pledged_at then
    raise exception
      'tip_attempts.pledged_at is immutable (attempt=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE'
     and old.follow_up_notified_at is distinct from new.follow_up_notified_at
     and coalesce(
       current_setting('knowledge_share_hub.dispatching', true),
       'off'
     ) <> 'on' then
    raise exception
      'tip_attempts.follow_up_notified_at is system-managed (attempt=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  -- completed_at one-way latch.
  if tg_op = 'UPDATE'
     and old.completed_at is not null
     and new.completed_at is null then
    raise exception
      'tip_attempts.completed_at cannot be cleared once set (attempt=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  -- completed_at requires result_tip_id.
  if new.completed_at is not null and new.result_tip_id is null then
    raise exception
      'tip_attempts.completed_at cannot be set without result_tip_id (attempt=%)',
      coalesce(old.id, new.id)
      using errcode = 'check_violation';
  end if;

  -- result_tip_id immutability + block user-initiated nulling.
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

  -- No re-link after loop-close marker (defense-in-depth).
  if tg_op = 'UPDATE'
     and old.result_tip_id is null
     and new.result_tip_id is not null
     and old.completed_at is not null then
    raise exception
      'tip_attempts: result already recorded; cannot re-link (attempt=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  -- Pending pledge / idempotent re-submit: skip the ownership +
  -- stamping block below.
  if new.result_tip_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.result_tip_id is not distinct from new.result_tip_id then
    return new;
  end if;

  -- Ownership + published-status check on the linked result tip.
  select author_id, status
    into v_result_author_id, v_result_status
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

  if v_result_status <> 'published' then
    raise exception
      'tip_attempts.result_tip_id must reference a published tip (status=%)',
      v_result_status
      using errcode = 'check_violation';
  end if;

  if new.completed_at is null then
    new.completed_at := now();
  end if;

  return new;
end;
$$;
