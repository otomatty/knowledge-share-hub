-- Issue #8 follow-up (PR #19 review): move the "try_it_result" side
-- effects into a DB trigger so the lineage + notification are atomic
-- with the attempt's `result_tip_id` write. Previously TipNew issued two
-- sequential client-side requests (upsert attempt, insert notification);
-- if the second failed the tip existed without a traceable link or the
-- author missed the "you produced a result" nudge.
--
-- The trigger fires BEFORE INSERT/UPDATE on tip_attempts whenever a
-- result_tip_id transitions from null → value (or is present on insert).
-- It auto-stamps `completed_at` and posts a `try_it_result` notification
-- to the source tip's author in the same transaction, so a failure of
-- either rolls back the attempt update. Client code can now call a
-- single upsert and stop orchestrating notifications directly.

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
  -- Only run side effects when result_tip_id is being set.
  --   INSERT: run iff NEW.result_tip_id is not null
  --   UPDATE: run iff NEW.result_tip_id is not null AND differs from OLD
  if new.result_tip_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.result_tip_id is not distinct from new.result_tip_id then
    return new;
  end if;

  -- Auto-stamp completed_at when the caller didn't set it explicitly.
  if new.completed_at is null then
    new.completed_at := now();
  end if;

  -- Resolve source author + actor name. If either tip is missing
  -- (shouldn't happen given the FKs, but be defensive) we skip the
  -- notification rather than fail the write.
  select author_id into v_source_author_id
  from knowledge_share_hub.tips
  where id = new.source_tip_id;

  select is_anonymous into v_result_is_anonymous
  from knowledge_share_hub.tips
  where id = new.result_tip_id;

  if v_source_author_id is null or v_result_is_anonymous is null then
    return new;
  end if;

  -- Don't notify when the user is acting on their own tip. The
  -- handle_try_it_reaction trigger also guards against self-pledges,
  -- but this keeps the result-notification path defensive on its own.
  if v_source_author_id = new.user_id then
    return new;
  end if;

  -- Mirror the UI's anonymity rule: an anonymous result tip surfaces
  -- "名無しエンジニア" in the notification rather than the real name.
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

create trigger trg_ksh_handle_tip_attempt_result
  before insert or update on knowledge_share_hub.tip_attempts
  for each row execute function knowledge_share_hub.handle_tip_attempt_result();
