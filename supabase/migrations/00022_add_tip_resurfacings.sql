-- Issue #10: "気づきの熟成" — resurface past tips so users revisit them after
-- time has passed. Two separate mechanics live under this heading:
--
-- 1. **Self re-reads**: 1 week after a user posts a tip, send them a
--    notification prompting them to re-read it with their current eyes.
--    Persisted in `tip_resurfacings` so each (user, tip, interval) fires
--    exactly once; mirrors the try_it_followups pattern from 00008.
--
-- 2. **Feed resurfacing** (other users' old tips re-appearing as "今読み直
--    したい1件"): computed live by a query-time hook, so no table or cron
--    is needed here — this migration only covers the scheduled self-read.
--
-- Selection rules for self re-reads:
--   - tip.status = 'published'
--   - tip.created_at in [now() - 60 days, now() - 7 days]  (recent only)
--   - no existing resurfacing row for (user_id, tip_id, 7)
--
-- pg_cron runs the dispatcher daily at 02:30 UTC (30 min after the try_it
-- dispatcher so they don't compete for the same connection slots).

-- pg_cron is already installed by 00008 but the extension declaration is
-- idempotent and kept here so this migration is self-documenting.
create extension if not exists pg_cron with schema extensions;

-- 1. tip_resurfacings
create table knowledge_share_hub.tip_resurfacings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references knowledge_share_hub.profiles(id) on delete cascade,
  tip_id uuid not null references knowledge_share_hub.tips(id) on delete cascade,
  interval_days int not null check (interval_days > 0),
  surfaced_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  unique (user_id, tip_id, interval_days)
);

create index idx_ksh_tip_resurfacings_user
  on knowledge_share_hub.tip_resurfacings(user_id);
create index idx_ksh_tip_resurfacings_pending
  on knowledge_share_hub.tip_resurfacings(user_id, surfaced_at desc)
  where acknowledged_at is null;

alter table knowledge_share_hub.tip_resurfacings enable row level security;

-- Viewing: users see only their own resurfacing rows (unlike tip_attempts
-- which are public, a resurfacing prompt is private nudge metadata).
create policy "Users can view own tip resurfacings"
  on knowledge_share_hub.tip_resurfacings for select
  using (auth.uid() = user_id);

-- Updating: users can mark their own as acknowledged. A BEFORE trigger
-- below blocks them from mutating any field other than acknowledged_at.
create policy "Users can update own tip resurfacings"
  on knowledge_share_hub.tip_resurfacings for update
  using (auth.uid() = user_id);

-- No insert / delete policy — rows are created only by the dispatcher
-- (security definer) and deleted via cascade from profiles/tips.

-- 2. Trigger: lock down every field except acknowledged_at so clients
-- can't fake away their own resurfacing history or rewrite surfaced_at.
create or replace function knowledge_share_hub.handle_tip_resurfacing_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.user_id is distinct from new.user_id
       or old.tip_id is distinct from new.tip_id
       or old.interval_days is distinct from new.interval_days
       or old.surfaced_at is distinct from new.surfaced_at then
      raise exception
        'tip_resurfacings: only acknowledged_at is user-mutable (id=%)',
        old.id
        using errcode = 'check_violation';
    end if;
    -- acknowledged_at is a one-way latch once set.
    if old.acknowledged_at is not null
       and (new.acknowledged_at is null
            or new.acknowledged_at is distinct from old.acknowledged_at) then
      raise exception
        'tip_resurfacings.acknowledged_at cannot be cleared or reassigned (id=%)',
        old.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_ksh_handle_tip_resurfacing_update
  before update on knowledge_share_hub.tip_resurfacings
  for each row execute function knowledge_share_hub.handle_tip_resurfacing_update();

-- 3. Extend notifications.type CHECK to allow the new resurface_self type.
alter table knowledge_share_hub.notifications
  drop constraint if exists notifications_type_check;
alter table knowledge_share_hub.notifications
  add constraint notifications_type_check
  check (type in (
    'reaction', 'comment', 'reply',
    'try_it_followup', 'try_it_result',
    'resurface_self'
  ));

-- 4. Dispatcher — pick tips that crossed the 7-day mark, record the
-- resurfacing row, and post a self-notification. The claimed-row CTE
-- pattern (`for update skip locked`) mirrors the try_it dispatcher so
-- concurrent runs never double-send.
create or replace function knowledge_share_hub.dispatch_tip_resurfacings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select t.id as tip_id, t.author_id as user_id, t.content
    from knowledge_share_hub.tips t
    where t.status = 'published'
      and t.created_at < now() - interval '7 days'
      and t.created_at > now() - interval '60 days'
      and not exists (
        select 1
        from knowledge_share_hub.tip_resurfacings r
        where r.user_id = t.author_id
          and r.tip_id = t.id
          and r.interval_days = 7
      )
    order by t.created_at asc
    limit 200
  ),
  claimed as (
    insert into knowledge_share_hub.tip_resurfacings
      (user_id, tip_id, interval_days)
    select d.user_id, d.tip_id, 7
    from due d
    on conflict (user_id, tip_id, interval_days) do nothing
    returning user_id, tip_id
  ),
  ins_notif as (
    insert into knowledge_share_hub.notifications
      (user_id, type, content_type, content_id, actor_id, is_read, message)
    select
      c.user_id,
      'resurface_self',
      'tip',
      c.tip_id,
      -- actor is the system, so leave null (matches the anonymised path
      -- in 00020 and avoids a misleading "self-actor" attribution).
      null,
      false,
      '1週間前のあなたの気づき、今のあなたはどう感じる？「'
        || left(d.content, 30)
        || case when length(d.content) > 30 then '…' else '' end
        || '」'
    from claimed c
    join due d
      on d.tip_id = c.tip_id and d.user_id = c.user_id
    returning 1
  )
  select count(*) into v_count from ins_notif;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function knowledge_share_hub.dispatch_tip_resurfacings() from public;
grant execute on function knowledge_share_hub.dispatch_tip_resurfacings() to service_role;

-- 5. Schedule — 02:30 UTC so it sits in a quiet window 30 min after the
-- try_it dispatcher finishes.
select cron.schedule(
  'ksh-tip-resurfacings',
  '30 2 * * *',
  $$select knowledge_share_hub.dispatch_tip_resurfacings();$$
);
