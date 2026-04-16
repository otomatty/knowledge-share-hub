-- Redesign reaction_type enum for "気づき" (tips) focus
-- Old: helped, clear, learned, nice
-- New: same_thought, new_view, try_it, learned

-- Step 1: Create new enum
create type knowledge_share_hub.reaction_type_new as enum (
  'same_thought',
  'new_view',
  'try_it',
  'learned'
);

-- Step 2: Drop unique constraint before data migration
alter table knowledge_share_hub.reactions
  drop constraint if exists reactions_user_id_content_type_content_id_reaction_type_key;

-- Step 3: Add temporary text column, map old values to new in a single pass
--   helped  → learned
--   clear   → new_view
--   learned → new_view
--   nice    → same_thought
alter table knowledge_share_hub.reactions
  add column reaction_type_tmp text;

update knowledge_share_hub.reactions
set reaction_type_tmp = case reaction_type::text
  when 'helped'  then 'learned'
  when 'clear'   then 'new_view'
  when 'learned' then 'new_view'
  when 'nice'    then 'same_thought'
end;

-- Step 4: Deduplicate — after mapping, a user who had both 'clear' and 'learned'
-- on the same content now has two 'new_view' rows. Keep the earliest by created_at, then id.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, content_type, content_id, reaction_type_tmp
      order by created_at, id
    ) as rn
  from knowledge_share_hub.reactions
)
delete from knowledge_share_hub.reactions
using ranked
where knowledge_share_hub.reactions.id = ranked.id
  and ranked.rn > 1;

-- Step 5: Swap columns — drop old enum column, rename tmp, cast to new enum
alter table knowledge_share_hub.reactions drop column reaction_type;
alter table knowledge_share_hub.reactions
  rename column reaction_type_tmp to reaction_type;

alter table knowledge_share_hub.reactions
  alter column reaction_type type knowledge_share_hub.reaction_type_new
  using reaction_type::knowledge_share_hub.reaction_type_new;

alter table knowledge_share_hub.reactions
  alter column reaction_type set not null;

-- Re-add unique constraint
alter table knowledge_share_hub.reactions
  add constraint reactions_user_id_content_type_content_id_reaction_type_key
  unique (user_id, content_type, content_id, reaction_type);

-- Step 6: Drop old enum, rename new one
drop type knowledge_share_hub.reaction_type;
alter type knowledge_share_hub.reaction_type_new rename to reaction_type;

-- Step 7: Update notification messages that reference old reaction labels
update knowledge_share_hub.notifications
set message = replace(message, '🙏 助かった', '📘 学びになった')
where message like '%🙏 助かった%';

update knowledge_share_hub.notifications
set message = replace(message, '📖 わかりやすい', '💡 新しい視点だった')
where message like '%📖 わかりやすい%';

update knowledge_share_hub.notifications
set message = replace(message, '💡 勉強になった', '💡 新しい視点だった')
where message like '%💡 勉強になった%';

update knowledge_share_hub.notifications
set message = replace(message, '👏 ナイス', '🤔 自分も思った')
where message like '%👏 ナイス%';

-- Step 8: Add try_it seed data for testing
insert into knowledge_share_hub.reactions (id, user_id, content_type, content_id, reaction_type, created_at) values
  ('90000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', 'tip', '20000000-0000-4000-8000-000000000003', 'try_it', now())
on conflict do nothing;

insert into knowledge_share_hub.notifications (id, user_id, type, content_type, content_id, actor_id, is_read, message, created_at) values
  ('80000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'reaction', 'tip', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', false, '鈴木花子さんがあなたの気づきにリアクション「🔁 試してみる」しました', now())
on conflict do nothing;
