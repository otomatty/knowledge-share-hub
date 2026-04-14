-- Remove the article / memo / book features so the product can focus on
-- "tips" (user insights / "気づき"). This migration:
--   1. Drops the article, memo, and book tables (and their join tables).
--   2. Cleans up orphaned comments / reactions / notifications that
--      referenced those content types.
--   3. Tightens the CHECK constraints to only allow the "tip" content type
--      (plus "comment" for reactions).
--   4. Rebuilds the content_type enum to only contain 'tip'.
--   5. Allows comments on tips, and adds a 'tip' label to the comments
--      check constraint (previously only memo/article were allowed).

-- 1. Drop tables. CASCADE handles join tables (article_tags, memo_tags,
-- memo_entries, book_chapters) and any RLS policies attached to them.
drop table if exists knowledge_share_hub.book_chapters cascade;
drop table if exists knowledge_share_hub.books cascade;
drop table if exists knowledge_share_hub.memo_entries cascade;
drop table if exists knowledge_share_hub.memo_tags cascade;
drop table if exists knowledge_share_hub.memos cascade;
drop table if exists knowledge_share_hub.article_tags cascade;
drop table if exists knowledge_share_hub.articles cascade;

-- 2. Clean up rows that refer to dropped content types via the polymorphic
-- (content_type, content_id) pattern.
--
-- First, delete reactions attached to comments on dropped content.
-- reactions.content_id is polymorphic and has no FK to comments, so the
-- cascade on the comments delete below does not reach them. Do this before
-- dropping the comments themselves so the subquery still resolves.
delete from knowledge_share_hub.reactions
  where content_type = 'comment'
    and content_id in (
      select id
        from knowledge_share_hub.comments
       where content_type in ('article', 'memo')
    );

delete from knowledge_share_hub.comments
  where content_type in ('article', 'memo');
delete from knowledge_share_hub.reactions
  where content_type in ('article', 'memo');
delete from knowledge_share_hub.notifications
  where content_type in ('article', 'memo');

-- 3. Tighten CHECK constraints. Recreate them in-place.
alter table knowledge_share_hub.comments
  drop constraint if exists comments_content_type_check;
alter table knowledge_share_hub.comments
  add constraint comments_content_type_check
  check (content_type in ('tip'));

alter table knowledge_share_hub.reactions
  drop constraint if exists reactions_content_type_check;
alter table knowledge_share_hub.reactions
  add constraint reactions_content_type_check
  check (content_type in ('tip', 'comment'));

alter table knowledge_share_hub.notifications
  drop constraint if exists notifications_content_type_check;
alter table knowledge_share_hub.notifications
  add constraint notifications_content_type_check
  check (content_type in ('tip'));

-- 4. Recreate the content_type enum to only contain 'tip'. The enum is
-- declared in 00001 but isn't used by any column today; recreating keeps
-- the enum in sync with the application's TS types.
drop type if exists knowledge_share_hub.content_type;
create type knowledge_share_hub.content_type as enum ('tip');
