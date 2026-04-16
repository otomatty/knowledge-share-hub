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

-- Step 2: Migrate existing reaction data
--   helped  → learned
--   clear   → new_view
--   learned → new_view
--   nice    → same_thought
update knowledge_share_hub.reactions
set reaction_type = 'learned'::text::knowledge_share_hub.reaction_type
where reaction_type = 'helped';
-- (no-op, but ensures consistency before column swap)

-- Step 3: Remove unique constraint, swap column type, re-add constraint
-- Drop the old unique constraint
alter table knowledge_share_hub.reactions
  drop constraint if exists reactions_user_id_content_type_content_id_reaction_type_key;

-- Add a temporary text column, migrate data with mapping, then swap
alter table knowledge_share_hub.reactions
  add column reaction_type_tmp text;

update knowledge_share_hub.reactions
set reaction_type_tmp = case reaction_type::text
  when 'helped'  then 'learned'
  when 'clear'   then 'new_view'
  when 'learned' then 'new_view'
  when 'nice'    then 'same_thought'
end;

-- After mapping, there may be duplicate (user_id, content_type, content_id, reaction_type_tmp) rows
-- e.g. a user who had both 'clear' and 'learned' on the same content → both become 'new_view'.
-- Keep only the earliest reaction per group.
delete from knowledge_share_hub.reactions a
using knowledge_share_hub.reactions b
where a.reaction_type_tmp = b.reaction_type_tmp
  and a.user_id = b.user_id
  and a.content_type = b.content_type
  and a.content_id = b.content_id
  and a.created_at > b.created_at;

-- Drop old column and rename new one
alter table knowledge_share_hub.reactions drop column reaction_type;
alter table knowledge_share_hub.reactions
  rename column reaction_type_tmp to reaction_type;

-- Cast to the new enum
alter table knowledge_share_hub.reactions
  alter column reaction_type type knowledge_share_hub.reaction_type_new
  using reaction_type::knowledge_share_hub.reaction_type_new;

alter table knowledge_share_hub.reactions
  alter column reaction_type set not null;

-- Re-add unique constraint
alter table knowledge_share_hub.reactions
  add constraint reactions_user_id_content_type_content_id_reaction_type_key
  unique (user_id, content_type, content_id, reaction_type);

-- Step 4: Drop old enum, rename new one
drop type knowledge_share_hub.reaction_type;
alter type knowledge_share_hub.reaction_type_new rename to reaction_type;

-- Step 5: Update notification messages that reference old reaction labels
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
