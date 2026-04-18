-- Issue #8: "Try it → Result" action loop.
--
-- When a user reacts 🔁 ("try_it") to someone else's tip, we record a
-- `tip_attempt` ("pledge"). After a few days we nudge them — "did you
-- actually try it?" — and when they post a result tip, we link it back
-- so the lineage becomes visible on the source tip's detail page.
--
-- Pieces in this migration:
--   1. `tip_attempts` table + indexes + RLS policies
--   2. Trigger on `reactions` insert: when reaction_type='try_it' and
--      content_type='tip', insert a tip_attempt row (on conflict do nothing).
--      Self-pledges (author pledging to their own tip) are skipped.
--   3. Extended `notifications.type` check to allow try_it_followup /
--      try_it_result.
--   4. `dispatch_try_it_followups()` function — inserts follow-up notifications
--      for pledges older than 3 days that have no result yet and no prior
--      follow-up. Marks `follow_up_notified_at` so we don't re-send.
--   5. pg_cron job scheduling the dispatch daily at 02:00 UTC (~11 JST).

-- 1. Enable pg_cron (safe to re-run)
create extension if not exists pg_cron with schema extensions;

-- 2. tip_attempts
create table knowledge_share_hub.tip_attempts (
  id uuid primary key default gen_random_uuid(),
  source_tip_id uuid not null references knowledge_share_hub.tips(id) on delete cascade,
  result_tip_id uuid references knowledge_share_hub.tips(id) on delete set null,
  user_id uuid not null references knowledge_share_hub.profiles(id) on delete cascade,
  pledged_at timestamptz not null default now(),
  completed_at timestamptz,
  follow_up_notified_at timestamptz,
  unique (source_tip_id, user_id)
);

create index idx_ksh_tip_attempts_source on knowledge_share_hub.tip_attempts(source_tip_id);
create index idx_ksh_tip_attempts_user on knowledge_share_hub.tip_attempts(user_id);
create index idx_ksh_tip_attempts_result on knowledge_share_hub.tip_attempts(result_tip_id);
-- Partial index matching the dispatch query (pending pledges awaiting follow-up).
create index idx_ksh_tip_attempts_followup
  on knowledge_share_hub.tip_attempts(pledged_at)
  where result_tip_id is null and follow_up_notified_at is null;

alter table knowledge_share_hub.tip_attempts enable row level security;

-- Viewing: any authenticated user can see who tried which tip (mirrors the
-- public nature of reactions and tips). Without this the detail page can't
-- surface "people who tried this".
create policy "Tip attempts viewable by authenticated users"
  on knowledge_share_hub.tip_attempts for select
  using (auth.role() = 'authenticated');

-- Updating: a user may update only their own attempt (used to link
-- result_tip_id + completed_at when they post a result tip).
create policy "Users can update own tip attempts"
  on knowledge_share_hub.tip_attempts for update
  using (auth.uid() = user_id);

-- Inserting: users can create/upsert their own attempt directly. Useful
-- for the "post result without pre-pledging" path (TipNew with ?source=...
-- when the user never hit the 🔁 button). The trigger below covers the
-- reaction-driven path.
create policy "Users can create own tip attempts"
  on knowledge_share_hub.tip_attempts for insert
  with check (auth.uid() = user_id);

-- 3. Trigger: reaction insert → tip_attempts insert (skip self)
create or replace function knowledge_share_hub.handle_try_it_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author_id uuid;
begin
  if new.reaction_type::text = 'try_it' and new.content_type = 'tip' then
    select author_id into v_author_id
    from knowledge_share_hub.tips
    where id = new.content_id;

    -- Don't record a pledge when the reactor is the tip's author.
    if v_author_id is not null and v_author_id <> new.user_id then
      insert into knowledge_share_hub.tip_attempts (source_tip_id, user_id)
      values (new.content_id, new.user_id)
      on conflict (source_tip_id, user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_ksh_handle_try_it_reaction
  after insert on knowledge_share_hub.reactions
  for each row execute function knowledge_share_hub.handle_try_it_reaction();

-- Backfill: any existing try_it reactions should get a pledge row too.
-- Needed because fixture 00006 inserted a try_it reaction before this
-- trigger existed. Idempotent via the unique constraint.
insert into knowledge_share_hub.tip_attempts (source_tip_id, user_id, pledged_at)
select r.content_id, r.user_id, r.created_at
from knowledge_share_hub.reactions r
join knowledge_share_hub.tips t on t.id = r.content_id
where r.reaction_type::text = 'try_it'
  and r.content_type = 'tip'
  and t.author_id <> r.user_id
on conflict (source_tip_id, user_id) do nothing;

-- 4. Extend notifications.type CHECK constraint.
-- The inline `check (type in (...))` in 00001 gets auto-named
-- `notifications_type_check` by Postgres (single-column check).
alter table knowledge_share_hub.notifications
  drop constraint if exists notifications_type_check;
alter table knowledge_share_hub.notifications
  add constraint notifications_type_check
  check (type in ('reaction', 'comment', 'reply', 'try_it_followup', 'try_it_result'));

-- 5. Dispatch function — finds due pledges, posts notifications, marks them.
-- Runs as security definer so it can insert into notifications regardless
-- of caller's RLS context (pg_cron runs as postgres, but being explicit keeps
-- the function callable from tests/dev by any role).
create or replace function knowledge_share_hub.dispatch_try_it_followups()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select
      a.id,
      a.source_tip_id,
      a.user_id,
      t.content
    from knowledge_share_hub.tip_attempts a
    join knowledge_share_hub.tips t on t.id = a.source_tip_id
    where a.pledged_at < now() - interval '3 days'
      and a.result_tip_id is null
      and a.follow_up_notified_at is null
  ),
  ins as (
    insert into knowledge_share_hub.notifications
      (user_id, type, content_type, content_id, actor_id, is_read, message)
    select
      d.user_id,
      'try_it_followup',
      'tip',
      d.source_tip_id,
      d.user_id,
      false,
      'あの気づき、試してみた？「'
        || left(d.content, 30)
        || case when length(d.content) > 30 then '…' else '' end
        || '」の結果を投稿してみよう'
    from due d
    returning 1
  ),
  upd as (
    update knowledge_share_hub.tip_attempts a
    set follow_up_notified_at = now()
    from due d
    where a.id = d.id
    returning 1
  )
  select count(*) into v_count from ins;

  return coalesce(v_count, 0);
end;
$$;

-- Let the service role / authenticated users execute (anon intentionally
-- excluded; pg_cron runs as the job owner).
revoke all on function knowledge_share_hub.dispatch_try_it_followups() from public;
grant execute on function knowledge_share_hub.dispatch_try_it_followups() to service_role;

-- 6. Schedule daily dispatch. `cron.schedule` lives in the `cron` schema
-- after the extension is installed. 02:00 UTC ≈ 11:00 JST — a quiet hour
-- in the middle of the Japanese morning where nudges read well.
select cron.schedule(
  'ksh-try-it-followups',
  '0 2 * * *',
  $$select knowledge_share_hub.dispatch_try_it_followups();$$
);
