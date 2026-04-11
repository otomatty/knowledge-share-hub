-- Drop legacy public.* schema artifacts that were created by the original
-- version of 00001_initial_schema.sql before it was rewritten to use the
-- knowledge_share_hub schema (commit d146d9e, 2026-04-10).
--
-- Those legacy tables and functions still exist on the remote production DB
-- because Supabase CLI tracks migrations by filename, so rewriting 00001 in
-- place did not re-apply it. This migration finishes the schema move by
-- cleaning up the leftover public.* objects.
--
-- Prerequisites for this migration to succeed on a remote that is still in
-- the legacy state:
--   1. `supabase migration repair --status reverted 00001` so that the next
--      `supabase db push` re-runs the (now rewritten) 00001 and creates the
--      knowledge_share_hub.* schema before this cleanup runs.
--   2. 00002_seed_test_data.sql must NOT be pushed to production. Move it
--      out of the migrations directory during the push, or mark it applied
--      with `supabase migration repair --status applied 00002`.

-- 1. Drop the legacy auth.users trigger and its handler function.
--    The rewritten 00001 installs a new trigger named
--    `on_auth_user_created_knowledge_share_hub` that writes into
--    knowledge_share_hub.profiles, so the old one is no longer needed.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;

-- 2. Drop legacy public.* tables from the original 00001. Use CASCADE to
--    also remove dependent foreign keys, indexes, RLS policies and the
--    public.profiles -> auth.users FK cascade delete behavior.
drop table if exists public.notifications cascade;
drop table if exists public.reactions cascade;
drop table if exists public.comments cascade;
drop table if exists public.book_chapters cascade;
drop table if exists public.books cascade;
drop table if exists public.memo_entries cascade;
drop table if exists public.memo_tags cascade;
drop table if exists public.memos cascade;
drop table if exists public.article_tags cascade;
drop table if exists public.articles cascade;
drop table if exists public.tip_tags cascade;
drop table if exists public.tips cascade;
drop table if exists public.tags cascade;
drop table if exists public.profiles cascade;

-- 3. Drop legacy public.* enum types.
drop type if exists public.reaction_type cascade;
drop type if exists public.content_type cascade;
drop type if exists public.content_status cascade;
drop type if exists public.user_role cascade;

-- 4. Remove the fixed-UUID test users that the legacy 00002_seed_test_data.sql
--    inserted into auth.users the first time it ran. Their rows in
--    knowledge_share_hub.profiles (if any) cascade-delete via the FK.
delete from auth.users
where id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'
);
