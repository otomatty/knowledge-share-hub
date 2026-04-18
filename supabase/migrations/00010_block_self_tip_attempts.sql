-- Issue #8 follow-up (PR #19 review): block self-attempts at the DB layer.
--
-- The original insert/update RLS policies on tip_attempts only checked
-- `auth.uid() = user_id`, so a user could post a "result" on their own
-- tip via `/tips/new?source=<own_tip>` (or a direct upsert) even though
-- `handle_try_it_reaction()` explicitly skips the reaction-driven path
-- for self-pledges. Those rows would then flow through the follow-up
-- dispatcher and pollute the lineage UI.
--
-- Defense-in-depth: tighten the RLS policies, AND enforce the same
-- invariant in the BEFORE trigger so the guard survives service-role
-- writes and future RLS changes.

-- 1. RLS: reject user-initiated inserts/updates where the caller
--    authored the source tip. The EXISTS subquery cannot self-reference
--    tip_attempts, so there's no recursion risk.
drop policy if exists "Users can create own tip attempts"
  on knowledge_share_hub.tip_attempts;
create policy "Users can create own tip attempts"
  on knowledge_share_hub.tip_attempts for insert
  with check (
    auth.uid() = user_id
    and not exists (
      select 1
      from knowledge_share_hub.tips t
      where t.id = source_tip_id
        and t.author_id = auth.uid()
    )
  );

drop policy if exists "Users can update own tip attempts"
  on knowledge_share_hub.tip_attempts;
create policy "Users can update own tip attempts"
  on knowledge_share_hub.tip_attempts for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and not exists (
      select 1
      from knowledge_share_hub.tips t
      where t.id = source_tip_id
        and t.author_id = auth.uid()
    )
  );

-- 2. Trigger: raise if source_tip.author_id = user_id. Belt-and-suspenders
--    for any writer that runs with RLS disabled (service_role, other
--    security-definer functions). `handle_try_it_reaction` already
--    short-circuits before reaching this insert, so it stays green.
create or replace function knowledge_share_hub.guard_tip_attempt_no_self()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_author_id uuid;
begin
  select author_id into v_source_author_id
  from knowledge_share_hub.tips
  where id = new.source_tip_id;

  if v_source_author_id is not null
     and v_source_author_id = new.user_id then
    raise exception
      'tip_attempts: user % cannot create an attempt on their own tip %',
      new.user_id, new.source_tip_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Use a BEFORE trigger that runs earlier than handle_tip_attempt_result
-- (naming orders triggers alphabetically; "guard_" sorts before "handle_").
create trigger trg_ksh_guard_tip_attempt_no_self
  before insert or update on knowledge_share_hub.tip_attempts
  for each row execute function knowledge_share_hub.guard_tip_attempt_no_self();
