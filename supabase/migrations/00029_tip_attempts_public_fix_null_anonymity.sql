-- Issue #41: tip_attempts_public ビューで result_tip が削除されると、
-- 本来匿名にすべき投稿者の user_id が露出する問題を修正。
--
-- 元の CASE 式 (migration 00019):
--
--   case
--     when a.user_id = auth.uid() then a.user_id
--     when rt.is_anonymous = true then null
--     else a.user_id
--   end as user_id
--
-- LEFT JOIN のため result tip (rt) が NULL のとき、`rt.is_anonymous = true`
-- は NULL 評価 → false 扱いとなり、`else` 分岐に落ちて user_id を露出する。
-- result_tip 削除は ON DELETE CASCADE で tip_attempts 行ごと消えるのが
-- 通常経路 (migration 00016) だが、トランザクション順序や将来の参照変更で
-- 露出が発生し得るため、論理的な穴として塞ぐ。
--
-- 修正方針: 「pledged だが未完了 (result_tip_id IS NULL)」のケースは
-- 公開コミットとして user_id 露出を維持し、「result_tip_id がセット
-- されているが rt 行が存在しない (削除済み)」のケースを防御的に
-- 匿名 (NULL) として扱う。これにより通常の pledge 表示は変わらず、
-- 削除後のリーク経路だけを塞ぐ。
--
-- 受け入れ条件 (issue #41):
--   * result_tip が削除された tip_attempts 行で user_id が NULL となる
--   * 既存テストが回帰なくパス

create or replace view knowledge_share_hub.tip_attempts_public as
select
  a.id,
  a.source_tip_id,
  a.result_tip_id,
  case
    when a.user_id = auth.uid() then a.user_id
    when rt.is_anonymous = true then null
    -- result_tip_id is set but the result tip row is missing
    -- (deleted). Mask defensively — we can't verify anonymity flag.
    when a.result_tip_id is not null and rt.id is null then null
    else a.user_id
  end as user_id,
  a.pledged_at,
  a.completed_at,
  a.follow_up_notified_at
from knowledge_share_hub.tip_attempts a
left join knowledge_share_hub.tips rt on rt.id = a.result_tip_id
where auth.role() = 'authenticated';

grant select on knowledge_share_hub.tip_attempts_public to authenticated;
