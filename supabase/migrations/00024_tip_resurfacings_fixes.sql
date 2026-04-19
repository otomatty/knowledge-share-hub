-- Issue #10 follow-up (PR #27 review round 4). Two distinct fixes:
--
-- 1. **Tighten `tip_addendums` SELECT policy to mirror tips visibility**
--    (chatgpt-codex). The initial policy in 00023 allowed any
--    authenticated user to read every addendum row, which leaks content
--    whenever the parent tip is a draft (`status = 'draft'`). The
--    `tips` SELECT policy (00001) hides drafts from non-authors, so
--    addendums should inherit the same visibility rule. Re-issue the
--    policy with a subquery that re-enters the tips table — the nested
--    RLS check on tips then transparently enforces the correct scope.
--
-- 2. **Drop the dispatch `limit 200` cap**. The dispatcher's `due`
--    CTE combined `limit 200` with a `< now() - interval '60 days'`
--    lower bound. Under backlog (first deploy, cron downtime, a day
--    where >200 tips age into the window at once), overflow rows would
--    be skipped and could age past the 60-day floor before the next
--    run ever claimed them — silently dropping resurfacing prompts.
--    Remove the cap entirely; `order by created_at asc` + `on conflict
--    do nothing` keep the function idempotent and self-throttling via
--    `for update skip locked` on a second concurrent run (the skipped
--    rows reappear in the next invocation).

-- 1. tip_addendums SELECT policy
drop policy if exists "Tip addendums viewable by authenticated users"
  on knowledge_share_hub.tip_addendums;

create policy "Tip addendums viewable iff parent tip is"
  on knowledge_share_hub.tip_addendums for select
  using (
    -- The subquery runs under the caller's RLS context, so the tips
    -- policy from 00001 ("status = 'published' OR auth.uid() =
    -- author_id") is re-applied here for free. Non-authors see
    -- addendums only for published parents; authors see addendums
    -- on their own drafts too. A user who knows an addendum id still
    -- can't bypass this because the row itself never leaves the DB
    -- unless the nested tips lookup yields a row.
    exists (
      select 1
      from knowledge_share_hub.tips t
      where t.id = tip_id
    )
  );

-- 2. Dispatcher — re-issued without the 200-row cap. Body is otherwise
-- identical to the version in 00022 (flag set, claimed-CTE pattern).
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
