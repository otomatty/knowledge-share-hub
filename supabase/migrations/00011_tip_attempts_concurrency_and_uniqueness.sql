-- Issue #8 follow-up (PR #19 third review pass):
--
-- 1. `result_tip_id` was not unique. `useSourceAttemptForResult()` in
--    src/hooks/use-tip-attempts.ts queries with `.maybeSingle()`, which
--    throws if more than one attempt points at the same result tip. The
--    unique constraint on `(source_tip_id, user_id)` only prevents the
--    same user from pledging the same source twice — nothing stopped a
--    single result tip from being linked to two different attempts.
--    Fix: partial unique index (nullable column, NULLs allowed freely).
--
-- 2. `dispatch_try_it_followups()` had a concurrency hole. The CTE read
--    `due` under one MVCC snapshot, inserted notifications, then updated
--    `follow_up_notified_at`. Two overlapping invocations (e.g. a manual
--    smoke-test while the nightly cron runs, or a retry) could both
--    observe the same `due` rows and each dispatch a notification before
--    the other's UPDATE committed. Rewrite as "claim first, notify
--    from claimed set" using `FOR UPDATE SKIP LOCKED` so concurrent
--    callers never see the same pending row.

create unique index idx_ksh_tip_attempts_result_unique
  on knowledge_share_hub.tip_attempts(result_tip_id)
  where result_tip_id is not null;

create or replace function knowledge_share_hub.dispatch_try_it_followups()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Claim the pending pledges first with a locking read, marking them
  -- `follow_up_notified_at = now()` in the same statement so a
  -- concurrent call can't observe the same row as pending. Rows locked
  -- by another transaction are skipped rather than blocked.
  with due as (
    select a.id
    from knowledge_share_hub.tip_attempts a
    where a.pledged_at < now() - interval '3 days'
      and a.result_tip_id is null
      and a.follow_up_notified_at is null
    for update skip locked
  ),
  claimed as (
    update knowledge_share_hub.tip_attempts a
    set follow_up_notified_at = now()
    from due
    where a.id = due.id
    returning a.id, a.source_tip_id, a.user_id
  ),
  ins as (
    insert into knowledge_share_hub.notifications
      (user_id, type, content_type, content_id, actor_id, is_read, message)
    select
      c.user_id,
      'try_it_followup',
      'tip',
      c.source_tip_id,
      c.user_id,
      false,
      'あの気づき、試してみた？「'
        || left(t.content, 30)
        || case when length(t.content) > 30 then '…' else '' end
        || '」の結果を投稿してみよう'
    from claimed c
    join knowledge_share_hub.tips t on t.id = c.source_tip_id
    returning 1
  )
  select count(*) into v_count from ins;

  return coalesce(v_count, 0);
end;
$$;
