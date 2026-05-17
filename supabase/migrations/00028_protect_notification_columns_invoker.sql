-- Issue #54: protect_notification_columns() を SECURITY DEFINER から
-- SECURITY INVOKER に降格する。
--
-- 関数本体は NEW / OLD の to_jsonb 差分比較と raise exception のみで、
-- テーブルへの SELECT/UPDATE も昇格権限も必要としない。SECURITY DEFINER の
-- ままだと将来の本体拡張で意図せず権限昇格経路を再利用するリスクが残るため、
-- 最小権限の原則 (least privilege) に従って SECURITY INVOKER で再定義する。
--
-- トリガ登録 (trg_ksh_protect_notification_columns) はシグネチャを変えないため
-- 再作成不要。既存クライアント (useMarkAllNotificationsRead) の挙動にも
-- 影響しない。

create or replace function knowledge_share_hub.protect_notification_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'is_read') is distinct from (to_jsonb(old) - 'is_read') then
    raise exception 'notifications: only is_read is updatable'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
