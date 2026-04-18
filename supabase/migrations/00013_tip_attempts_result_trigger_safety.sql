-- Issue #8 follow-up (PR #19 fifth review pass). Two P1 holes in the
-- `handle_tip_attempt_result` trigger shipped in 00009 / tightened
-- in 00012:
--
-- 1. **Result tips became undeletable.** The FK on
--    `tip_attempts.result_tip_id` is `ON DELETE SET NULL`, so deleting
--    a linked result tip fires an UPDATE on tip_attempts transitioning
--    `old=<id>` → `new=null`. The 00012 guard rejected that with
--    `check_violation`, effectively making every linked result tip
--    permanent — and blocking maintainers from clearing a mis-link.
--    Fix: let the `-> NULL` path through. The guard only needs to
--    forbid real swaps (`old and new both non-null, differ`).
--
-- 2. **Any user could claim anyone's tip as their result.** The
--    trigger looked up `is_anonymous` on the result tip but never
--    checked ownership. Combined with the RLS that only constrains
--    `auth.uid() = user_id`, an authenticated user could upsert an
--    attempt with `result_tip_id = <someone else's tip>` and ping
--    the source author with a misleading try_it_result. Fix: verify
--    `tips.author_id = new.user_id` for the referenced result tip
--    at the DB layer, rejecting otherwise.

create or replace function knowledge_share_hub.handle_tip_attempt_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_author_id uuid;
  v_result_author_id uuid;
  v_actor_name text;
  v_result_is_anonymous boolean;
begin
  -- Reject only real swaps. `-> NULL` is allowed so that
  -- `on delete set null` can cascade when a result tip is deleted.
  if tg_op = 'UPDATE'
     and old.result_tip_id is not null
     and new.result_tip_id is not null
     and old.result_tip_id is distinct from new.result_tip_id then
    raise exception
      'tip_attempts.result_tip_id cannot be reassigned once set (attempt=%, old=%, new=%)',
      old.id, old.result_tip_id, new.result_tip_id
      using errcode = 'check_violation';
  end if;

  -- Nothing to do when the row has no result yet.
  if new.result_tip_id is null then
    return new;
  end if;
  -- Skip on updates that don't touch the result_tip_id (e.g.
  -- follow_up_notified_at stamping from the dispatcher).
  if tg_op = 'UPDATE'
     and old.result_tip_id is not distinct from new.result_tip_id then
    return new;
  end if;

  -- Ownership check: the linked result tip must be authored by the
  -- user submitting the attempt. Blocks silently-crafted upserts
  -- that attribute someone else's tip as the user's "result".
  select author_id into v_result_author_id
  from knowledge_share_hub.tips
  where id = new.result_tip_id;

  if v_result_author_id is null then
    raise exception
      'tip_attempts.result_tip_id references a missing tip (%)',
      new.result_tip_id
      using errcode = 'foreign_key_violation';
  end if;

  if v_result_author_id <> new.user_id then
    raise exception
      'tip_attempts.result_tip_id must be authored by user_id (user=%, result_tip_author=%)',
      new.user_id, v_result_author_id
      using errcode = 'check_violation';
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
