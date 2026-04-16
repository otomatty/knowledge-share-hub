-- Add try_it test fixture (runs after 00005 which introduces the new enum value)
insert into knowledge_share_hub.reactions (id, user_id, content_type, content_id, reaction_type, created_at)
select '90000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', 'tip', '20000000-0000-4000-8000-000000000003', 'try_it', now()
where exists (
  select 1
  from knowledge_share_hub.profiles
  where id = '10000000-0000-4000-8000-000000000002'
)
  and exists (
    select 1
    from knowledge_share_hub.tips
    where id = '20000000-0000-4000-8000-000000000003'
  )
on conflict do nothing;

insert into knowledge_share_hub.notifications (id, user_id, type, content_type, content_id, actor_id, is_read, message, created_at)
select '80000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'reaction', 'tip', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', false, '鈴木花子さんがあなたの気づきにリアクション「🔁 試してみる」しました', now()
where exists (
  select 1
  from knowledge_share_hub.profiles
  where id = '10000000-0000-4000-8000-000000000003'
)
  and exists (
    select 1
    from knowledge_share_hub.profiles
    where id = '10000000-0000-4000-8000-000000000002'
  )
  and exists (
    select 1
    from knowledge_share_hub.tips
    where id = '20000000-0000-4000-8000-000000000003'
  )
on conflict do nothing;
