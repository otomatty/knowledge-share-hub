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
-- 修正方針: クライアントからの INSERT は「自分宛て (= 自分自身が
-- 自分のトレイに入れるメモ的通知)」のみ許可する。実運用では
-- システム通知はすべて `tip_attempts` / `tip_resurfacings` などの
-- トリガ関数および pg_cron ジョブ経由で挿入されるが、これらは
-- いずれも `security definer` 関数として実装されており、所有者
-- (`postgres`、BYPASSRLS) の権限で動作するため RLS の対象外となる。
-- したがって今回の引き締めはサーバ側の正規ルートを一切壊さない。
--
-- 受け入れ条件 (issue #33):
--   * 通常ユーザーが他人の `user_id` で INSERT できないこと
--   * 既存のトリガ経由通知作成が引き続き動作すること

drop policy if exists "System can create notifications"
  on knowledge_share_hub.notifications;

create policy "Users can insert own notifications"
  on knowledge_share_hub.notifications for insert
  with check (auth.uid() = user_id);
