-- Introduce "context tags" (文脈タグ) alongside the existing technical tags.
-- A context tag captures the *kind of insight* ("今日の学び", "ハマった" …)
-- rather than a technology. Issue #6.
--
-- Approach: add a category column to the existing tags table (option 1 in
-- the issue). Keeps tip_tags as-is and avoids a parallel schema.
--
-- Preset context tags are inserted with fixed UUIDs so the UI can reference
-- them by id if it ever needs to, and so re-running the migration is idempotent.

alter table knowledge_share_hub.tags
  add column category text not null default 'tech'
  check (category in ('tech', 'context'));

create index idx_ksh_tags_category on knowledge_share_hub.tags(category);

-- Preset context tags. Names intentionally *include* the leading `#` so the
-- UI can render them verbatim — they are selectable labels, not freeform
-- user tags. ON CONFLICT keeps the migration idempotent in case a prior
-- dev environment already inserted a tag with the same name.
insert into knowledge_share_hub.tags (id, name, category, created_at) values
  ('80000000-0000-4000-8000-000000000001', '#今日の学び',     'context', now()),
  ('80000000-0000-4000-8000-000000000002', '#ハマった',       'context', now()),
  ('80000000-0000-4000-8000-000000000003', '#逆に気づいた',   'context', now()),
  ('80000000-0000-4000-8000-000000000004', '#違和感',         'context', now()),
  ('80000000-0000-4000-8000-000000000005', '#試してみたい',   'context', now()),
  ('80000000-0000-4000-8000-000000000006', '#振り返り',       'context', now())
on conflict (name) do update set category = excluded.category;
