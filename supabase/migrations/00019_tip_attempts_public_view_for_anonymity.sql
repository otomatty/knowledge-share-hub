-- Issue #8 follow-up (PR #19 eleventh review pass, P1 codex):
--
-- The UI-level masking added in TipDetail (99d26df) hides the trier's
-- identity for anonymous results, but the raw `tip_attempts` table is
-- still readable by any authenticated user via PostgREST. Joining to
-- `profiles` on `user_id` gives you the real name behind any
-- anonymous result — the masking is strictly cosmetic.
--
-- Fix: expose a view `tip_attempts_public` that masks `user_id` when
-- (a) the viewer is not the owner and (b) the linked result tip was
-- posted anonymously. Route client reads through the view, and revoke
-- SELECT on the underlying table from non-privileged roles so the
-- mask can't be side-stepped.
--
-- Writes still go to the table directly — INSERT/UPDATE grants on
-- `tip_attempts` are untouched (Postgres INSERT/UPDATE don't require
-- SELECT, and client `.upsert()` doesn't chain a RETURNING).

-- 1. View. `security_invoker = false` (default) means queries through
--    the view run as the view owner (postgres), bypassing RLS on the
--    base table — so we replicate the RLS SELECT predicate here
--    (authenticated-only). `auth.uid()` still resolves to the
--    *invoking* user's JWT claim regardless of view ownership.
create view knowledge_share_hub.tip_attempts_public as
select
  a.id,
  a.source_tip_id,
  a.result_tip_id,
  case
    when a.user_id = auth.uid() then a.user_id
    when rt.is_anonymous = true then null
    else a.user_id
  end as user_id,
  a.pledged_at,
  a.completed_at,
  a.follow_up_notified_at
from knowledge_share_hub.tip_attempts a
left join knowledge_share_hub.tips rt on rt.id = a.result_tip_id
where auth.role() = 'authenticated';

-- 2. Expose the view; lock down the table.
grant select on knowledge_share_hub.tip_attempts_public to authenticated;
revoke select on knowledge_share_hub.tip_attempts from authenticated, anon, public;
