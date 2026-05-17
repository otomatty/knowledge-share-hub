# Knowledge Share Hub

エンジニアチーム向けの「気づき」共有アプリ。140 文字の短い投稿を中心に、文脈タグ・技術タグ・タグフォロー・「試してみる→結果」のアクションループ・1 週間後の再読プロンプトなど、**気づきを書き残し・熟成させる**ための仕組みを備えています。

UI は日本語、バックエンドは Supabase（PostgREST + RLS + pg_cron）で動いています。

## 主な機能

### コンテンツ

- **140 字の気づき（Tip）投稿**: ドラフト / 公開ステータス、匿名投稿に対応
- **追記（Addendum）**: 公開済み Tip に後から短文を追記（こちらも 140 字上限、追記履歴は時系列で保持）
- **コメント / 返信**: ネスト構造のスレッド、コメントへのリアクション

### タグ

- **技術タグ（tech）と文脈タグ（context）の二系統**: `tags.category` で区別
- **プリセットの文脈タグ**: `#今日の学び` `#ハマった` `#逆に気づいた` `#違和感` `#試してみたい` `#振り返り`
- **タグフォロー**: 「フォロー中」フィードでフォロー対象タグの Tip だけを表示。フォロー関係は本人にしか見えない（フォロワー数は構造的に計上不可）

### リアクションとアクションループ

- **4 種類のリアクション**: `same_thought` / `new_view` / `try_it` / `learned`
- **「試してみる」誓約**: `try_it` を押すと `tip_attempts` に pledge が記録される
- **3 日後の追跡通知**: pg_cron が `dispatch_try_it_followups()` を毎日 02:00 UTC に実行し、未着手の pledge にフォローアップ通知を送る
- **結果 Tip のリンク化**: 結果として投稿された Tip は元の Tip の系譜として詳細ページに表示

### 気づきの熟成（Resurfacing）

- **自分の Tip の 1 週間後再読プロンプト**: pg_cron が 02:30 UTC に `dispatch_tip_resurfacings()` を実行。`tip_resurfacings` で重複送信を防止
- **他ユーザーの過去 Tip のフィード再浮上**: クエリ層で算出（テーブル不要）。「すべて」タブにのみ表示
- **再読時の追記**: 再読プロンプトから直接 Addendum を追加できる

### 検索 / 通知 / 個人アーカイブ

- **検索**: キーワード + 文脈タグ + 技術タグの併用フィルタ。URL パラメータ（`?q=` `?tag=`）が真実の情報源
- **通知**: リアクション、コメント、返信、try_it 系、resurface_self を一覧
- **個人アーカイブ**: 自分の Tip を Markdown / JSON でエクスポート（サイズ上限あり）
- **デイリー・リフレクションプロンプト**: 投稿フォームに毎日違う問いかけを表示

### 管理

- **管理画面 `/admin`**: ユーザー一覧 / タグ一覧

## 技術スタック

| Layer | 採用技術 |
| --- | --- |
| フロントエンド | Vite 8 / React 18 / TypeScript 5 |
| UI | shadcn/ui（Radix UI）+ Tailwind CSS 3 + lucide-react |
| ルーティング | React Router 6 |
| データ取得 | TanStack Query v5 |
| エディタ | Tiptap 3（starter-kit, heading, image, link, placeholder） |
| フォーム | React Hook Form + Zod |
| バックエンド | Supabase（Auth / PostgREST / Storage / pg_cron） |
| 認証 | Magic Link + Google OAuth |
| テスト | Vitest + Testing Library + jsdom / Playwright |
| パッケージマネージャ | Bun |
| デプロイ | Vercel（SPA リライト設定済み） |

## セットアップ

### 必要環境

- Node.js 20+ と Bun（推奨）。`npm` でも動きますが、`vercel.json` は `bun install` / `bun run build` を前提にしています。
- Supabase プロジェクト（リモート、またはローカルの `supabase start`）

### 1. 依存インストール

```bash
bun install
```

### 2. 環境変数

`.env.example` をコピーして `.env` を作成します。

```bash
cp .env.example .env
```

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

> Supabase ダッシュボードの **Project Settings → API** で `knowledge_share_hub` を **Exposed schemas** に追加してください（`db.schema` 設定により `Accept-Profile` / `Content-Profile` ヘッダがこのスキーマに対して送出されます）。

### 3. データベースのマイグレーション

`supabase/migrations/` 配下に 30 本のマイグレーションがあります。Supabase CLI で適用してください。

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

ローカル環境では `supabase start` 後に `supabase db reset` で全マイグレーションが適用され、`00002_seed_test_data.sql` でテストユーザー（`tanaka@example.com` / `suzuki@example.com` / `yamada@example.com`、パスワード `password123`）も作成されます。

### 4. 開発サーバー起動

```bash
bun run dev
```

http://localhost:8080 で起動します（`vite.config.ts` で固定）。

## スクリプト

| コマンド | 用途 |
| --- | --- |
| `bun run dev` | 開発サーバー（HMR） |
| `bun run build` | 本番ビルド |
| `bun run build:dev` | development モードでのビルド |
| `bun run preview` | ビルド成果物のローカルプレビュー |
| `bun run lint` | ESLint |
| `bun run test` | Vitest（単発実行） |
| `bun run test:watch` | Vitest（watch モード） |

Playwright のフィクスチャは `playwright-fixture.ts` / `playwright.config.ts` に最小構成のみ用意されています。

## ディレクトリ構成

```text
src/
├── App.tsx                 # ルーティング定義（ProtectedRoute で保護）
├── pages/                  # 画面単位（Index / TipDetail / SearchPage / AdminPage 等）
├── components/
│   ├── auth/               # 認証ガードとバージョンバッジ
│   ├── layout/             # Header / MainLayout / RightSidebar
│   ├── shared/             # ContentCard / TipsDialog / ReactionButtons など
│   ├── archive/            # 個人アーカイブ
│   └── ui/                 # shadcn/ui のコンポーネント群
├── contexts/AuthContext.tsx
├── hooks/                  # use-domain-queries / use-tip-attempts / use-tag-follows 等
├── integrations/supabase/  # 自動生成された Database 型
├── lib/                    # supabase クライアント、マッパー、エクスポート、tag-utils
├── types/                  # ドメイン型（Tip / Comment / ReactionSummary など）
└── test/                   # Vitest セットアップ
supabase/
├── config.toml             # ローカル Supabase（exposed schemas / OAuth リダイレクト）
└── migrations/             # 00001 〜 00030 のスキーマ進化
```

## データベース概要

すべてのテーブルは `knowledge_share_hub` スキーマに集約され、RLS が有効です。

主要テーブル:
- `profiles`: `auth.users` と 1:1。`role` は `admin | user`、`skill_tags`（text[]）あり
- `tips`: 140 字本文、`is_anonymous`、`status`（draft/published）
- `tags` / `tip_tags`: `category` で `tech` / `context` を区別
- `tag_follows`: タグフォロー（プライマリキー `(user_id, tag_id)`、自分の行のみ参照可）
- `tip_attempts`: 「試してみる」誓約と結果 Tip の系譜（`source_tip_id` / `result_tip_id`）
- `tip_addendums`: 追記（append-only、140 字上限、Tip 著者のみ insert 可）
- `tip_resurfacings`: 1 週間再読プロンプトの送信履歴。`acknowledged_at` 以外は変更不可（BEFORE トリガで保護）
- `comments` / `reactions` / `notifications`

`pg_cron` ジョブ:
- `ksh-try-it-followups`（毎日 02:00 UTC）→ `dispatch_try_it_followups()`
- `ksh-tip-resurfacings`（毎日 02:30 UTC）→ `dispatch_tip_resurfacings()`

### cron 失敗時の確認手順

両 dispatcher は `begin ... exception when others then ...` で例外を捕捉し、成功 / 失敗の両方を `knowledge_share_hub.cron_logs` に記録します（migration `00030`）。失敗時は戻り値 `-1` と `RAISE WARNING` も併発し、Supabase の Logs Explorer から検索できます。

```sql
-- 最近の失敗を確認
select id, job_name, ran_at, sqlstate, error_message
from knowledge_share_hub.cron_logs
where success = false
order by ran_at desc
limit 20;

-- ジョブ別の最終成功時刻（24h 以上空いていたら要調査）
select job_name, max(ran_at) filter (where success) as last_success
from knowledge_share_hub.cron_logs
group by job_name;
```

`cron_logs` が空（= 関数が一度も呼ばれていない）の場合は cron 起動自体が落ちている可能性があるため、pg_cron の `cron.job_run_details` を補助的に確認します。

```sql
select jobname, status, return_message, start_time, end_time
from cron.job_run_details
where jobname in ('ksh-try-it-followups', 'ksh-tip-resurfacings')
order by start_time desc
limit 20;
```

失敗を確認したら、原因を修正したうえで `service_role` から手動再実行できます。

```sql
select knowledge_share_hub.dispatch_try_it_followups();
select knowledge_share_hub.dispatch_tip_resurfacings();
```

失敗が継続する場合は Supabase Logs（Database / Postgres）で `RAISE WARNING` の詳細とスタックトレースを参照してください。

> 旧スキーマ（`articles` / `books` / `memos`）は `00003` `00004` で除去済み。アプリは Tip 中心に再設計されています（コミット `887e683`）。

## デプロイ

`vercel.json` に SPA 用のリライトが入っているので、Vercel に接続すれば追加設定なしでデプロイできます。

```json
{
  "installCommand": "bun install",
  "buildCommand": "bun run build",
  "rewrites": [
    { "source": "/((?!assets/).*)", "destination": "/index.html" }
  ]
}
```

ビルド時は `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` を Vercel の環境変数に設定してください。

## ライセンス

このリポジトリにライセンスファイルは含まれていません。利用条件はリポジトリ所有者にご確認ください。
