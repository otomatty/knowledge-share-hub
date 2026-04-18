-- Issue #8 follow-up (PR #19 twelfth review pass). Two distinct leaks
-- from the same flow:
--
-- 1. **P1: anonymous result leaks via `notifications.actor_id`.** The
--    AFTER trigger (`notify_tip_attempt_result_linked`) anonymises the
--    message *text* for anonymous results but still stamps
--    `actor_id = new.user_id`. `useNotifications` joins
--    `profiles!notifications_actor_id_fkey(*)`, so the source tip
--    author can recover the real identity from their own notification
--    row. Fix: make `notifications.actor_id` nullable and stamp NULL
--    when the linked result is anonymous. Also back-fill existing
--    notifications that currently leak.
--
-- 2. **P2: owners can mutate system-managed scheduler fields.** The
--    RLS UPDATE policy grants blanket column access, and the BEFORE
--    trigger only validates result/user/source identity. A client can
--    `UPDATE tip_attempts SET follow_up_notified_at = now()` to
--    suppress their own follow-up, or shift `pledged_at` into the
--    future to delay the 3-day window. Fix: reject user-initiated
--    changes to both columns in the trigger. The dispatcher function
--    sets a transaction-local session flag before it stamps
--    `follow_up_notified_at`, so the trigger can tell system writes
--    from client writes without relying on role strings.

-- 1. Notifications.actor_id nullable + back-fill leaked rows.
alter table knowledge_share_hub.notifications
  alter column actor_id drop not null;

update knowledge_share_hub.notifications n
set actor_id = null
where n.type = 'try_it_result'
  and n.content_type = 'tip'
  and exists (
    select 1 from knowledge_share_hub.tips t
    where t.id = n.content_id and t.is_anonymous = true
  );

-- 2. AFTER trigger: stamp NULL actor for anonymous results. Every
--    other branch is unchanged from 00017.
create or replace function knowledge_share_hub.notify_tip_attempt_result_linked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_author_id uuid;
  v_result_is_anonymous boolean;
  v_actor_name text;
begin
  if new.result_tip_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and old.result_tip_id is not distinct from new.result_tip_id then
    return null;
  end if;

  select author_id into v_source_author_id
  from knowledge_share_hub.tips
  where id = new.source_tip_id;

  select is_anonymous into v_result_is_anonymous
  from knowledge_share_hub.tips
  where id = new.result_tip_id;

  if v_source_author_id is null or v_result_is_anonymous is null then
    return null;
  end if;

  if v_source_author_id = new.user_id then
    return null;
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
    -- Null actor for anonymous results so the source author can't
    -- deanonymise via `profiles!notifications_actor_id_fkey`.
    case when v_result_is_anonymous then null else new.user_id end,
    false,
    coalesce(v_actor_name, '誰か')
      || 'さんがあなたの気づきを試した結果を投稿しました'
  );

  return null;
end;
$$;

-- 3. BEFORE trigger: add scheduler-field guards. Re-issues the whole
--    function for readability (previous version from 00018).
create or replace function knowledge_share_hub.handle_tip_attempt_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result_author_id uuid;
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

  -- Scheduler fields are system-managed.
  --   pledged_at: set on INSERT, never mutable.
  --   follow_up_notified_at: only mutable inside a dispatcher
  --     invocation that flipped the transaction-local flag below.
  if tg_op = 'UPDATE'
     and old.pledged_at is distinct from new.pledged_at then
    raise exception
      'tip_attempts.pledged_at is immutable (attempt=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE'
     and old.follow_up_notified_at is distinct from new.follow_up_notified_at
     and coalesce(
       current_setting('knowledge_share_hub.dispatching', true),
       'off'
     ) <> 'on' then
    raise exception
      'tip_attempts.follow_up_notified_at is system-managed (attempt=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  -- completed_at is a one-way latch.
  if tg_op = 'UPDATE'
     and old.completed_at is not null
     and new.completed_at is null then
    raise exception
      'tip_attempts.completed_at cannot be cleared once set (attempt=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  -- completed_at requires result_tip_id (blocks silent completion bypass).
  if new.completed_at is not null and new.result_tip_id is null then
    raise exception
      'tip_attempts.completed_at cannot be set without result_tip_id (attempt=%)',
      coalesce(old.id, new.id)
      using errcode = 'check_violation';
  end if;

  -- result_tip_id immutability + block user-initiated nulling (FK is
  -- ON DELETE CASCADE, so legitimate null path is a row delete).
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

  -- Defense-in-depth: no re-link after a loop-close marker has been
  -- placed (unreachable under FK=CASCADE, kept for safety).
  if tg_op = 'UPDATE'
     and old.result_tip_id is null
     and new.result_tip_id is not null
     and old.completed_at is not null then
    raise exception
      'tip_attempts: result already recorded; cannot re-link (attempt=%)',
      old.id
      using errcode = 'check_violation';
  end if;

  -- Pending pledge paths.
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

  return new;
end;
$$;

-- 4. Dispatcher: flip the transaction-local "dispatching" flag so the
--    BEFORE trigger allows its follow_up_notified_at stamp. Everything
--    else is identical to 00016.
create or replace function knowledge_share_hub.dispatch_try_it_followups()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Transaction-scoped flag the BEFORE trigger reads to distinguish
  -- dispatcher-initiated writes from client writes to scheduler fields.
  perform set_config('knowledge_share_hub.dispatching', 'on', true);

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
