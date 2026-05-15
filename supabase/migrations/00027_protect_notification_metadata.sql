-- Issue #37: notifications UPDATE で actor_id 等のメタデータ改ざんを防ぐ.
--
-- 初期スキーマ (`00001_initial_schema.sql:401`) の UPDATE ポリシー
--
--   create policy "Users can update own notifications"
--     on knowledge_share_hub.notifications for update using (auth.uid() = user_id);
--
-- は受信者本人による UPDATE を許可しているが、列レベルの制限がない。
-- これにより受信者は任意の列を書き換えられ、特に匿名 Tip 通知の
-- `actor_id` (migration 00020 で nullable 化、匿名通知では NULL) を
-- 推測 UUID で UPDATE することで、推測 UUID が `profiles` に存在するか
-- どうかを FK 制約 (`profiles_id_fkey`) 経由のレスポンス差で観測でき、
-- 匿名投稿者の絞り込み (deanonymization) が成立する。
--
-- 攻撃シナリオ:
--   1. 攻撃者が匿名 Tip 由来の通知 (`actor_id IS NULL`) を受信
--   2. `update notifications set actor_id = '<推測UUID>' where id = '<自分の通知>'`
--   3. RLS は通過。推測 UUID が profiles に存在すれば成功、不在なら
--      `notifications_actor_id_fkey` 違反で失敗 → 存在判定オラクル
--   4. 通知の文脈 (content_id 等) と紐づけて投稿者候補を絞り込む
--
-- 修正方針 (issue #37 案 A): 受信者は `is_read` のみ更新可能とし、
-- メタデータ列 (`id`, `user_id`, `actor_id`, `content_id`, `content_type`,
-- `type`) の改変を BEFORE UPDATE トリガで拒否する。RLS ポリシーは
-- そのまま残し、列レベルでの defense-in-depth とする。
--
-- 影響範囲:
--   * クライアントの `useMarkAllNotificationsRead`
--     (`src/hooks/use-supabase-query.ts:222`) は `is_read = true` のみを
--     更新するため、トリガに抵触せず影響なし。
--   * 通知を生成する system トリガ (`handle_tip_attempt_result` ほか)
--     は INSERT のみで notifications を UPDATE しないため影響なし。
--
-- 受け入れ条件 (issue #37):
--   * 受信者が actor_id / user_id / content_id / type を UPDATE できない
--   * is_read の更新は引き続き可能
--   * (追加) content_type も保護対象

set search_path = public, knowledge_share_hub;

create or replace function knowledge_share_hub.protect_notification_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.actor_id is distinct from old.actor_id
     or new.content_id is distinct from old.content_id
     or new.content_type is distinct from old.content_type
     or new.type is distinct from old.type then
    raise exception 'notifications: metadata columns are immutable'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ksh_protect_notification_columns
  on knowledge_share_hub.notifications;

create trigger trg_ksh_protect_notification_columns
  before update on knowledge_share_hub.notifications
  for each row execute function knowledge_share_hub.protect_notification_columns();
