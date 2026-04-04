import type { User, Tip, Memo, Article, Book, Tag, Notification, Comment } from '@/types';

export const mockUsers: User[] = [
  {
    id: '1', email: 'tanaka@example.com', username: 'tanaka',
    display_name: '田中太郎', avatar_url: '', current_project: '金融系Webアプリ開発',
    bio: 'Java/Spring Bootが得意です。最近はReactも勉強中。', skill_tags: ['Java', 'Spring Boot', 'React', 'AWS'], created_at: '2024-01-15',
  },
  {
    id: '2', email: 'suzuki@example.com', username: 'suzuki',
    display_name: '鈴木花子', avatar_url: '', current_project: 'ECサイトリニューアル',
    bio: 'フロントエンドエンジニア。TypeScriptとNext.jsが好き。', skill_tags: ['TypeScript', 'React', 'Next.js', 'Figma'], created_at: '2024-02-01',
  },
  {
    id: '3', email: 'yamada@example.com', username: 'yamada',
    display_name: '山田一郎', avatar_url: '', current_project: 'インフラ基盤構築',
    bio: 'インフラエンジニア。AWSとTerraformを使っています。', skill_tags: ['AWS', 'Terraform', 'Docker', 'Kubernetes'], created_at: '2024-03-01',
  },
];

export const mockTags: Tag[] = [
  { id: '1', name: 'React' }, { id: '2', name: 'TypeScript' }, { id: '3', name: 'AWS' },
  { id: '4', name: 'Docker' }, { id: '5', name: 'Java' }, { id: '6', name: 'Spring Boot' },
  { id: '7', name: 'Next.js' }, { id: '8', name: 'PostgreSQL' }, { id: '9', name: 'Git' },
  { id: '10', name: 'Linux' }, { id: '11', name: 'Python' }, { id: '12', name: 'Kubernetes' },
];

const r = () => ({ helped: Math.floor(Math.random() * 20), clear: Math.floor(Math.random() * 15), learned: Math.floor(Math.random() * 25), nice: Math.floor(Math.random() * 10) });

export const mockTips: Tip[] = [
  { id: 't1', author: mockUsers[0], content: 'git stash で一時退避するとき、git stash -u で未追跡ファイルも含められるの知らなかった', is_anonymous: false, status: 'published', tags: [mockTags[8]], reactions: r(), published_at: '2026-04-03T10:00:00', created_at: '2026-04-03T10:00:00' },
  { id: 't2', author: mockUsers[1], content: 'TypeScriptのsatisfies演算子、型推論を保ったまま型チェックできて便利すぎる', is_anonymous: false, status: 'published', tags: [mockTags[1]], reactions: r(), published_at: '2026-04-03T09:00:00', created_at: '2026-04-03T09:00:00' },
  { id: 't3', author: mockUsers[2], content: 'docker compose up --build --force-recreate でキャッシュ無視して完全再ビルドできる', is_anonymous: false, status: 'published', tags: [mockTags[3]], reactions: r(), published_at: '2026-04-02T15:00:00', created_at: '2026-04-02T15:00:00' },
  { id: 't4', author: mockUsers[0], content: 'PostgreSQLのEXPLAIN ANALYZEでクエリの実行計画を確認するの大事', is_anonymous: true, status: 'published', tags: [mockTags[7]], reactions: r(), published_at: '2026-04-02T11:00:00', created_at: '2026-04-02T11:00:00' },
  { id: 't5', author: mockUsers[1], content: 'VSCodeのマルチカーソル選択、Ctrl+D で同じ単語を順に選択できる。リファクタリング時に超便利', is_anonymous: false, status: 'published', tags: [], reactions: r(), published_at: '2026-04-01T14:00:00', created_at: '2026-04-01T14:00:00' },
];

export const mockArticles: Article[] = [
  { id: 'a1', author: mockUsers[0], title: 'Spring Boot 3.x マイグレーションガイド：つまずきポイントと解決策', content: '<h2>はじめに</h2><p>Spring Boot 2.xから3.xへのマイグレーションで実際にハマったポイントをまとめます。</p><h2>Jakarta EE名前空間の変更</h2><p>javax.* から jakarta.* への変更が最大の影響範囲です。</p><h2>セキュリティ設定の変更</h2><p>WebSecurityConfigurerAdapterが廃止され、SecurityFilterChainベースに変わりました。</p>', is_anonymous: false, status: 'published', tags: [mockTags[4], mockTags[5]], reactions: { helped: 15, clear: 8, learned: 22, nice: 5 }, comment_count: 3, published_at: '2026-04-01T10:00:00', created_at: '2026-04-01T10:00:00' },
  { id: 'a2', author: mockUsers[1], title: 'React Server Componentsを実務で使ってみた所感', content: '<h2>概要</h2><p>RSCを実プロジェクトで導入した経験をシェアします。</p><h2>メリット</h2><p>バンドルサイズの削減とデータフェッチの簡素化が大きなメリットでした。</p>', is_anonymous: false, status: 'published', tags: [mockTags[0], mockTags[6]], reactions: { helped: 10, clear: 12, learned: 18, nice: 8 }, comment_count: 5, published_at: '2026-03-28T09:00:00', created_at: '2026-03-28T09:00:00' },
  { id: 'a3', author: mockUsers[2], title: 'Terraformで始めるAWSインフラのコード管理入門', content: '<h2>なぜIaCが必要か</h2><p>手動でのインフラ構築は再現性が低く、属人化しやすい問題があります。</p>', is_anonymous: false, status: 'published', tags: [mockTags[2], mockTags[3]], reactions: { helped: 20, clear: 15, learned: 30, nice: 12 }, comment_count: 7, published_at: '2026-03-25T10:00:00', created_at: '2026-03-25T10:00:00' },
];

export const mockMemos: Memo[] = [
  { id: 'm1', author: mockUsers[0], title: 'AWS Lambda + API Gateway 調査メモ', is_anonymous: false, status: 'published', tags: [mockTags[2]], entries: [
    { id: 'me1', content: '<p>Lambda関数のコールドスタート問題について調査中。Provisioned Concurrencyで解決できそう。</p>', order: 1, created_at: '2026-04-02T10:00:00' },
    { id: 'me2', content: '<p>Provisioned Concurrencyのコストを計算した。月額約$15程度で許容範囲内。</p>', order: 2, created_at: '2026-04-02T14:00:00' },
  ], reactions: { helped: 8, clear: 5, learned: 12, nice: 3 }, comment_count: 2, published_at: '2026-04-02T10:00:00', created_at: '2026-04-02T10:00:00' },
  { id: 'm2', author: mockUsers[1], title: 'Next.js App Router移行で気づいたこと', is_anonymous: false, status: 'published', tags: [mockTags[6], mockTags[1]], entries: [
    { id: 'me3', content: '<p>Pages RouterからApp Routerへの移行を開始。まずはルーティング部分から。</p>', order: 1, created_at: '2026-03-30T09:00:00' },
  ], reactions: { helped: 6, clear: 10, learned: 8, nice: 4 }, comment_count: 1, published_at: '2026-03-30T09:00:00', created_at: '2026-03-30T09:00:00' },
];

export const mockBooks: Book[] = [
  { id: 'b1', author: mockUsers[2], title: 'AWS実践入門シリーズ', description: 'AWSの主要サービスを実務で使うためのガイド集', status: 'published', chapters: [
    { id: 'bc1', article: mockArticles[2], order: 1 },
  ], published_at: '2026-03-26T10:00:00', created_at: '2026-03-26T10:00:00' },
];

export const mockComments: Comment[] = [
  { id: 'c1', author: mockUsers[1], content: '<p>Spring Boot 3のマイグレーション、うちのプロジェクトでも同じところでハマりました。参考になります！</p>', content_type: 'article', content_id: 'a1', reactions: { helped: 2, clear: 0, learned: 1, nice: 3 }, created_at: '2026-04-01T12:00:00', replies: [
    { id: 'c2', author: mockUsers[0], content: '<p>同じ経験をされたんですね！Jakarta EE周りは本当に影響範囲が広いですよね。</p>', content_type: 'article', content_id: 'a1', parent_id: 'c1', reactions: { helped: 0, clear: 0, learned: 0, nice: 1 }, created_at: '2026-04-01T13:00:00' },
  ]},
];

export const mockNotifications: Notification[] = [
  { id: 'n1', type: 'reaction', content_type: 'article', content_id: 'a1', actor: mockUsers[1], is_read: false, created_at: '2026-04-03T11:00:00', message: '鈴木花子さんがあなたの記事にリアクション「🙏 助かった」しました' },
  { id: 'n2', type: 'comment', content_type: 'article', content_id: 'a1', actor: mockUsers[1], is_read: false, created_at: '2026-04-01T12:00:00', message: '鈴木花子さんがあなたの記事にコメントしました' },
  { id: 'n3', type: 'reaction', content_type: 'tip', content_id: 't1', actor: mockUsers[2], is_read: true, created_at: '2026-04-03T09:30:00', message: '山田一郎さんがあなたのTipsにリアクション「💡 勉強になった」しました' },
];

export const currentUser = mockUsers[0];

export const trendingTags = [
  { tag: mockTags[0], count: 12 }, { tag: mockTags[2], count: 10 },
  { tag: mockTags[1], count: 8 }, { tag: mockTags[3], count: 7 },
  { tag: mockTags[6], count: 5 },
];

export const weeklyRanking = [
  { user: mockUsers[2], reactionCount: 77 },
  { user: mockUsers[0], reactionCount: 50 },
  { user: mockUsers[1], reactionCount: 48 },
];
