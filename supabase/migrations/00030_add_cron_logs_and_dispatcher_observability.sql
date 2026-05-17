-- Issue #44: dispatch_* 関数の失敗が静かに飲まれる（cron 監視穴）
--
-- `dispatch_try_it_followups()` (00008) と `dispatch_tip_resurfacings()` (00022)
-- は例外発生時に何のログも残さずトランザクション全体がロールバックされる。
-- pg_cron は次回 24 時間後まで再試行しないため、フォローアップ通知 /
-- 再読プロンプトが丸 1 日落ちる事故を検知できない。
--
-- 修正方針 (issue 案 B): 観測用テーブル `cron_logs` を新設し、両 dispatcher を
-- `begin ... exception when others then ...` で囲んで成功 / 失敗の両方を記録する。
-- PL/pgSQL のサブトランザクション挙動により、例外ブロック内の INSERT は
-- 親トランザクション (cron 起動) のコミット時に永続化される。
-- 失敗時は `raise warning` で Postgres ログにも残し、関数戻り値は -1 とする。

-- 1. cron_logs テーブル
create table knowledge_share_hub.cron_logs (
  id bigserial primary key,
  job_name text not null,
  ran_at timestamptz not null default now(),
  success boolean not null,
  error_message text,
  sqlstate text,
  affected_rows int
);

-- 「最新の失敗 N 件」「ジョブ別の最終成功時刻」の運用クエリを高速化。
create index idx_ksh_cron_logs_job_ran_at
  on knowledge_share_hub.cron_logs(job_name, ran_at desc);

alter table knowledge_share_hub.cron_logs enable row level security;

-- INSERT / SELECT ポリシーは作らない。
-- - 書き込みは security definer な dispatcher 関数からのみ。
-- - 参照は service_role (RLS を素通し) と Supabase SQL エディタ前提。
--   将来的に admin 管理画面から見せたくなったら、その時点で
--   profiles.role='admin' を判定するポリシーを追加する。

revoke all on knowledge_share_hub.cron_logs from public, anon, authenticated;
-- Default privileges in 00001 already grant `all on tables` to service_role,
-- but the explicit grant mirrors the dispatcher's `grant execute` style and
-- keeps the migration self-documenting.
grant select on knowledge_share_hub.cron_logs to service_role;

-- 2. dispatch_try_it_followups() を例外捕捉版に差し替え。
-- 関数本体は 00020 の "claim first, notify from claimed set" パターン
-- (00011 で導入された `for update skip locked` による並行排他、00020 で
-- 追加された `knowledge_share_hub.dispatching` フラグの set_config) を
-- そのまま踏襲し、その外側を `begin ... exception when others ...` で
-- 包んで観測ログを取る。
--
-- 00020 の BEFORE トリガが `follow_up_notified_at` の更新時に
-- `knowledge_share_hub.dispatching = 'on'` を要求するため、フラグの
-- set_config を忘れると毎回 check_violation で失敗する。
create or replace function knowledge_share_hub.dispatch_try_it_followups()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- 00020: BEFORE トリガが参照するトランザクションスコープのフラグ。
  -- これがないと follow_up_notified_at の UPDATE が check_violation で
  -- 失敗し、例外パスに落ちて 1 通も通知が出ないまま終わる。
  perform set_config('knowledge_share_hub.dispatching', 'on', true);

  -- 00011: 「先に claim → claimed から notify」パターン。`for update
  -- skip locked` で並行する dispatcher 同士が同じ pending を観測しない。
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

  v_count := coalesce(v_count, 0);

  insert into knowledge_share_hub.cron_logs
    (job_name, success, affected_rows)
  values
    ('ksh-try-it-followups', true, v_count);

  return v_count;
exception when others then
  -- 例外ブロックは新しいサブトランザクションで実行されるため、
  -- ここの INSERT は親トランザクションのコミットで永続化される。
  -- 再 raise すると親ごとロールバックしてログ行も消えるため、戻り値 -1
  -- でハンドリングを示し、Postgres ログにも warning を残す。
  insert into knowledge_share_hub.cron_logs
    (job_name, success, error_message, sqlstate)
  values
    ('ksh-try-it-followups', false, SQLERRM, SQLSTATE);

  raise warning 'dispatch_try_it_followups failed: % (SQLSTATE=%)',
    SQLERRM, SQLSTATE;

  return -1;
end;
$$;

revoke all on function knowledge_share_hub.dispatch_try_it_followups() from public;
grant execute on function knowledge_share_hub.dispatch_try_it_followups() to service_role;

-- 3. dispatch_tip_resurfacings() も同じ扱い
create or replace function knowledge_share_hub.dispatch_tip_resurfacings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select t.id as tip_id, t.author_id as user_id, t.content
    from knowledge_share_hub.tips t
    where t.status = 'published'
      and t.created_at < now() - interval '7 days'
      and t.created_at > now() - interval '60 days'
      and not exists (
        select 1
        from knowledge_share_hub.tip_resurfacings r
        where r.user_id = t.author_id
          and r.tip_id = t.id
          and r.interval_days = 7
      )
    -- Intentionally no `limit` here. Migration 00024 removed the
    -- earlier `limit 200` because backlog rows could age past the
    -- 60-day floor before the next run claimed them. Keep the cap
    -- absent so this redefinition does not regress that fix.
    order by t.created_at asc
  ),
  claimed as (
    insert into knowledge_share_hub.tip_resurfacings
      (user_id, tip_id, interval_days)
    select d.user_id, d.tip_id, 7
    from due d
    on conflict (user_id, tip_id, interval_days) do nothing
    returning user_id, tip_id
  ),
  ins_notif as (
    insert into knowledge_share_hub.notifications
      (user_id, type, content_type, content_id, actor_id, is_read, message)
    select
      c.user_id,
      'resurface_self',
      'tip',
      c.tip_id,
      null,
      false,
      '1週間前のあなたの気づき、今のあなたはどう感じる？「'
        || left(d.content, 30)
        || case when length(d.content) > 30 then '…' else '' end
        || '」'
    from claimed c
    join due d
      on d.tip_id = c.tip_id and d.user_id = c.user_id
    returning 1
  )
  select count(*) into v_count from ins_notif;

  v_count := coalesce(v_count, 0);

  insert into knowledge_share_hub.cron_logs
    (job_name, success, affected_rows)
  values
    ('ksh-tip-resurfacings', true, v_count);

  return v_count;
exception when others then
  insert into knowledge_share_hub.cron_logs
    (job_name, success, error_message, sqlstate)
  values
    ('ksh-tip-resurfacings', false, SQLERRM, SQLSTATE);

  raise warning 'dispatch_tip_resurfacings failed: % (SQLSTATE=%)',
    SQLERRM, SQLSTATE;

  return -1;
end;
$$;

revoke all on function knowledge_share_hub.dispatch_tip_resurfacings() from public;
grant execute on function knowledge_share_hub.dispatch_tip_resurfacings() to service_role;
