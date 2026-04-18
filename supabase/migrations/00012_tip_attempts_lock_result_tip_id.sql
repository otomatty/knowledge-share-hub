-- Issue #8 follow-up (PR #19 fourth review pass):
--
-- `handle_tip_attempt_result` correctly gates on
-- `old.result_tip_id is not distinct from new.result_tip_id` to avoid
-- re-firing when nothing changed, but it still allows updates that
-- *swap* an already-set result_tip_id (R1 → R2). Two bad effects:
--   1. The try_it_result notification is sent a second time for the
--      same pledge.
--   2. R1 drops out of the lineage entirely — nobody can navigate
--      from R1 back to the source tip anymore, and the "試した結果"
--      list on the source no longer includes R1.
--
-- A pledge is a 1:1 relationship between a user and a source tip; it
-- should also be 1:1 with the result they posted for that pledge.
-- Reject any UPDATE that changes a non-null result_tip_id. New results
-- would need a new pledge (the existing 🔁 flow naturally handles
-- repeat attempts because the unique (source_tip_id, user_id) key
-- prevents stacking anyway, but a user who genuinely wants to
-- overwrite can have their row cleared by a maintainer).

create or replace function knowledge_share_hub.handle_tip_attempt_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_author_id uuid;
  v_actor_name text;
  v_result_is_anonymous boolean;
begin
  -- Lock in the result_tip_id once it's been set. Only runs on UPDATE;
  -- inserts always pass through (old is NULL for INSERT).
  if tg_op = 'UPDATE'
     and old.result_tip_id is not null
     and old.result_tip_id is distinct from new.result_tip_id then
    raise exception
      'tip_attempts.result_tip_id cannot be changed once set (attempt=%, old=%, new=%)',
      old.id, old.result_tip_id, new.result_tip_id
      using errcode = 'check_violation';
  end if;

  -- Only run side effects when result_tip_id is being set for the
  -- first time. Everything below is unchanged from 00009 except for
  -- this early-return which is now redundant with the guard above
  -- but kept for clarity.
  if new.result_tip_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.result_tip_id is not distinct from new.result_tip_id then
    return new;
  end if;

  if new.completed_at is null then
    new.completed_at := now();
  end if;

  select author_id into v_source_author_id
  from knowledge_share_hub.tips
  where id = new.source_tip_id;

  select is_anonymous into v_result_is_anonymous
  from knowledge_share_hub.tips
  where id = new.result_tip_id;

  if v_source_author_id is null or v_result_is_anonymous is null then
    return new;
  end if;

  if v_source_author_id = new.user_id then
    return new;
  end if;

  if v_result_is_anonymous then
    v_actor_name := '名無しエンジニア';
  else
    select display_name into v_actor_name
    from knowledge_share_hub.profiles
    where id = new.user_id;
  end if;

  insert into knowledge_share_hub.notifications
    (user_id, type, content_type, content_id, actor_id, is_read, message)
  values (
    v_source_author_id,
    'try_it_result',
    'tip',
    new.result_tip_id,
    new.user_id,
    false,
    coalesce(v_actor_name, '誰か')
      || 'さんがあなたの気づきを試した結果を投稿しました'
  );

  return new;
end;
$$;
