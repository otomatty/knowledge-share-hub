-- Issue #33: notifications INSERT ポリシーが無制限.
--
-- 初期スキーマ (`00001_initial_schema.sql:398-399`) では
--
--   create policy "System can create notifications"
--     on knowledge_share_hub.notifications for insert with check (true);
--
-- となっており、認証済みユーザーであれば誰でも任意の `user_id` 宛に
-- 通知を INSERT できる状態だった。`try_it_result` / `resurface_self`
-- など「システム発」を装う通知を偽装でき、フィッシング/スパムに
-- 直結する。さらに `content_id` はポリモーフィック (FK なし) なため、
-- 存在しない Tip や閲覧権限のない Tip を指す通知も作成可能だった。
--
-- 修正方針: クライアントからの INSERT は「自分宛て・自分発 (=
-- 自分自身が自分のトレイに入れるメモ的通知)」のみ許可する。
-- `user_id` だけでなく `actor_id` も `auth.uid()` と一致させ、
-- 自分のフィードに「他ユーザー発」「システム発」を装う通知を
-- 挿入する余地を塞ぐ (PR #49 のレビュー指摘)。
--
-- 実運用ではシステム通知はすべて `tip_attempts` / `tip_resurfacings`
-- などのトリガ関数および pg_cron ジョブ経由で挿入されるが、これらは
-- いずれも `security definer` 関数として実装されており、所有者
-- (`postgres`、BYPASSRLS) の権限で動作するため RLS の対象外となる。
-- したがって今回の引き締めはサーバ側の正規ルートを一切壊さない。
-- また、現状クライアント側で `notifications` への INSERT は存在しない
-- (select と `is_read` の update のみ) ため、ユーザー操作にも影響しない。
--
-- 受け入れ条件 (issue #33):
--   * 通常ユーザーが他人の `user_id` で INSERT できないこと
--   * 既存のトリガ経由通知作成が引き続き動作すること

drop policy if exists "System can create notifications" -- noqa: RF05
  on knowledge_share_hub.notifications;

create policy users_can_insert_own_notifications
  on knowledge_share_hub.notifications for insert
  with check (auth.uid() = user_id and auth.uid() = actor_id);
