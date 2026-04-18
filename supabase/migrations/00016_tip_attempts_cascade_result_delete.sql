-- Issue #8 follow-up (PR #19 eighth review pass). Two related holes:
--
-- 1. **P1 (codex): user-initiated `result_tip_id` nulling.**
--    00015 left a user-level UPDATE path open (`UPDATE tip_attempts
--    SET result_tip_id = NULL`) because the trigger couldn't reliably
--    distinguish a user-issued UPDATE from the FK `ON DELETE SET NULL`
--    cascade — both arrive at the BEFORE UPDATE trigger as
--    `(old non-null, new null)`. The completed_at latch blocked the
--    *re-link* after, but the user could still silently detach an
--    existing result from source lineage, breaking the "試した結果"
--    section on the source and orphaning the backlink.
-- 2. **P2 (codex): follow-up dispatcher ignored completed_at.**
--    The query only filtered on `result_tip_id is null`; a legacy
--    state-C row (result_tip_id null + completed_at non-null) that
--    was never nudged could still get a 3-day follow-up after its
--    result was deleted, even though the loop had already closed.
--
-- Fix: change the FK action from `SET NULL` to `CASCADE`. Deleting a
-- result tip now deletes the attempt row outright, so the ambiguous
-- "null transition" state is unreachable altogether — the trigger
-- can simply reject any UPDATE that nulls result_tip_id, knowing the
-- only path that *would* have produced a null (the FK cascade) now
-- deletes the row instead. This also makes the completed_at
-- immutability and re-link guards from 00015 strictly redundant for
-- the cascade path, but they remain as defense-in-depth.
--
-- The dispatcher gains a `completed_at IS NULL` filter too, so any
-- pre-00016 state-C rows in prod are never re-nudged.

-- 1. Swap the FK action.
alter table knowledge_share_hub.tip_attempts
  drop constraint tip_attempts_result_tip_id_fkey;
alter table knowledge_share_hub.tip_attempts
  add constraint tip_attempts_result_tip_id_fkey
  foreign key (result_tip_id)
  references knowledge_share_hub.tips(id)
  on delete cascade;

-- 2. Trigger: now that null transitions can't come from a cascade,
--    reject them all. Everything below `new.result_tip_id is null`
--    path is pure "pending pledge, nothing to do".
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
  -- Identity columns never change after the row exists.
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    raise exception
      'tip_attempts.user_id is immutable (attempt=%, old=%, new=%)',
      old.id, old.user_id, new.user_id
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE'
     and old.source_tip_id is distinct from new.source_tip_id then
    raise exception
      'tip_attempts.source_tip_id is immutable (attempt=%, old=%, new=%)',
      old.id, old.source_tip_id, new.source_tip_id
      using errcode = 'check_violation';
  end if;

  -- completed_at is a one-way latch (kept from 00015).
  if tg_op = 'UPDATE'
     and old.completed_at is not null
     and new.completed_at is null then
    raise exception
      'tip_attempts.completed_at cannot be cleared once set (attempt=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  -- result_tip_id immutability: reject any swap or null-out after set.
  -- With ON DELETE CASCADE, a user-initiated nulling is the only path
  -- that produces (old non-null, new null), and we block it here.
  -- (The cascade would DELETE the row instead, never UPDATE.)
  if tg_op = 'UPDATE' and old.result_tip_id is not null then
    if new.result_tip_id is null then
      raise exception
        'tip_attempts.result_tip_id cannot be cleared (attempt=%); delete the result tip or the attempt row instead',
        old.id
        using errcode = 'check_violation';
    elsif old.result_tip_id is distinct from new.result_tip_id then
      raise exception
        'tip_attempts.result_tip_id cannot be reassigned once set (attempt=%, old=%, new=%)',
        old.id, old.result_tip_id, new.result_tip_id
        using errcode = 'check_violation';
    end if;
  end if;

  -- Strictly redundant now (FK cascade can't produce this state), but
  -- kept as defense-in-depth: can't re-link after completed_at was set.
  if tg_op = 'UPDATE'
     and old.result_tip_id is null
     and new.result_tip_id is not null
     and old.completed_at is not null then
    raise exception
      'tip_attempts: result already recorded; cannot re-link (attempt=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  -- Pending pledge paths: no result yet, or identical result (idempotent).
  if new.result_tip_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.result_tip_id is not distinct from new.result_tip_id then
    return new;
  end if;

  -- Ownership: linked result tip must be authored by the pledging user.
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

-- 3. Dispatcher: defensive `completed_at IS NULL` filter so legacy
--    state-C rows (pre-00016) stay excluded from follow-up nudges.
create or replace function knowledge_share_hub.dispatch_try_it_followups()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select a.id
    from knowledge_share_hub.tip_attempts a
    where a.pledged_at < now() - interval '3 days'
      and a.result_tip_id is null
      and a.completed_at is null
      and a.follow_up_notified_at is null
    for update skip locked
  ),
  claimed as (
    update knowledge_share_hub.tip_attempts a
    set follow_up_notified_at = now()
    from due
    where a.id = due.id
    returning a.id, a.source_tip_id, a.user_id
  ),
  ins as (
    insert into knowledge_share_hub.notifications
      (user_id, type, content_type, content_id, actor_id, is_read, message)
    select
      c.user_id,
      'try_it_followup',
      'tip',
      c.source_tip_id,
      c.user_id,
      false,
      'あの気づき、試してみた？「'
        || left(t.content, 30)
        || case when length(t.content) > 30 then '…' else '' end
        || '」の結果を投稿してみよう'
    from claimed c
    join knowledge_share_hub.tips t on t.id = c.source_tip_id
    returning 1
  )
  select count(*) into v_count from ins;

  return coalesce(v_count, 0);
end;
$$;
