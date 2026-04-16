-- Test users password for all: password123
-- IDs are fixed UUIDs for reproducible URLs and seed data.

-- Users (auth)
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) values
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'tanaka@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"username":"tanaka","display_name":"田中太郎"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'suzuki@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"username":"suzuki","display_name":"鈴木花子"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000003',
  'authenticated',
  'authenticated',
  'yamada@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"username":"yamada","display_name":"山田一郎"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
);

update knowledge_share_hub.profiles set
  email = 'tanaka@example.com',
  current_project = '金融系Webアプリ開発',
  bio = 'Java/Spring Bootが得意です。最近はReactも勉強中。',
  skill_tags = array['Java','Spring Boot','React','AWS']::text[],
  created_at = '2024-01-15T00:00:00Z'::timestamptz
where id = '10000000-0000-4000-8000-000000000001';

update knowledge_share_hub.profiles set
  email = 'suzuki@example.com',
  current_project = 'ECサイトリニューアル',
  bio = 'フロントエンドエンジニア。TypeScriptとNext.jsが好き。',
  skill_tags = array['TypeScript','React','Next.js','Figma']::text[],
  created_at = '2024-02-01T00:00:00Z'::timestamptz
where id = '10000000-0000-4000-8000-000000000002';

update knowledge_share_hub.profiles set
  email = 'yamada@example.com',
  current_project = 'インフラ基盤構築',
  bio = 'インフラエンジニア。AWSとTerraformを使っています。',
  skill_tags = array['AWS','Terraform','Docker','Kubernetes']::text[],
  created_at = '2024-03-01T00:00:00Z'::timestamptz
where id = '10000000-0000-4000-8000-000000000003';

-- Tags
insert into knowledge_share_hub.tags (id, name, created_at) values
  ('70000000-0000-4000-8000-000000000001', 'React', now()),
  ('70000000-0000-4000-8000-000000000002', 'TypeScript', now()),
  ('70000000-0000-4000-8000-000000000003', 'AWS', now()),
  ('70000000-0000-4000-8000-000000000004', 'Docker', now()),
  ('70000000-0000-4000-8000-000000000005', 'Java', now()),
  ('70000000-0000-4000-8000-000000000006', 'Spring Boot', now()),
  ('70000000-0000-4000-8000-000000000007', 'Next.js', now()),
  ('70000000-0000-4000-8000-000000000008', 'PostgreSQL', now()),
  ('70000000-0000-4000-8000-000000000009', 'Git', now()),
  ('70000000-0000-4000-8000-000000000010', 'Linux', now()),
  ('70000000-0000-4000-8000-000000000011', 'Python', now()),
  ('70000000-0000-4000-8000-000000000012', 'Kubernetes', now());

-- Tips（気づき）
insert into knowledge_share_hub.tips (id, author_id, content, is_anonymous, status, published_at, created_at) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'git stash で一時退避するとき、git stash -u で未追跡ファイルも含められるの知らなかった', false, 'published', '2026-04-03T10:00:00Z', '2026-04-03T10:00:00Z'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'TypeScriptのsatisfies演算子、型推論を保ったまま型チェックできて便利すぎる', false, 'published', '2026-04-03T09:00:00Z', '2026-04-03T09:00:00Z'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'docker compose up --build --force-recreate でキャッシュ無視して完全再ビルドできる', false, 'published', '2026-04-02T15:00:00Z', '2026-04-02T15:00:00Z'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'PostgreSQLのEXPLAIN ANALYZEでクエリの実行計画を確認するの大事', true, 'published', '2026-04-02T11:00:00Z', '2026-04-02T11:00:00Z'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'VSCodeのマルチカーソル選択、Ctrl+D で同じ単語を順に選択できる。リファクタリング時に超便利', false, 'published', '2026-04-01T14:00:00Z', '2026-04-01T14:00:00Z');

insert into knowledge_share_hub.tip_tags (tip_id, tag_id) values
  ('20000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000009'),
  ('20000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000004'),
  ('20000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000008');

-- Comments (気づき返し)
insert into knowledge_share_hub.comments (id, author_id, content, content_type, content_id, parent_id, created_at) values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
   '<p>git stash -u 知らなかった！node_modules みたいな大きい未追跡を含めたくない時は --keep-index と組み合わせるのも便利だと気づきました。</p>',
   'tip', '20000000-0000-4000-8000-000000000001', null, '2026-04-03T11:00:00Z'),
  ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   '<p>--keep-index あるんですね！次から試してみます。</p>',
   'tip', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '2026-04-03T12:00:00Z');

-- Reactions
insert into knowledge_share_hub.reactions (id, user_id, content_type, content_id, reaction_type, created_at) values
  ('90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'tip', '20000000-0000-4000-8000-000000000001', 'learned', now()),
  ('90000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'tip', '20000000-0000-4000-8000-000000000001', 'new_view', now()),
  ('90000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'tip', '20000000-0000-4000-8000-000000000002', 'new_view', now()),
  ('90000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'tip', '20000000-0000-4000-8000-000000000002', 'same_thought', now()),
  ('90000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'tip', '20000000-0000-4000-8000-000000000003', 'learned', now()),
  ('90000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000003', 'comment', '60000000-0000-4000-8000-000000000001', 'same_thought', now());

-- Notifications
insert into knowledge_share_hub.notifications (id, user_id, type, content_type, content_id, actor_id, is_read, message, created_at) values
  ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'reaction', 'tip', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', false, '鈴木花子さんがあなたの気づきにリアクション「📘 学びになった」しました', '2026-04-03T11:00:00Z'),
  ('80000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'comment', 'tip', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', false, '鈴木花子さんがあなたの気づきに気づき返しをしました', '2026-04-03T11:00:00Z'),
  ('80000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'reaction', 'tip', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', true, '山田一郎さんがあなたの気づきにリアクション「💡 新しい視点だった」しました', '2026-04-03T09:30:00Z');
