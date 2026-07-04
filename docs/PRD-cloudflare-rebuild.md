# PRD: Knowledge Share Hub — Cloudflare ネイティブ再構築

- **ドキュメント種別**: プロダクト要求仕様書（PRD）／現行仕様の抽出
- **対象**: 既存 Supabase 版「Knowledge Share Hub」を **Cloudflare 単一ベンダー構成へ全面再構築**するための仕様
- **前提**: 既存データ・API との**互換性は考慮しない**（グリーンフィールド再実装）。本書は「何を作るか（WHAT）」を規定し、実装詳細（HOW）は設計フェーズに委ねる
- **抽出元**: `src/`（12 ページ・全 hooks・全 lib・型定義）と `supabase/migrations/00001〜00030`
- **作成日**: 2026-07-04

---

## 0. このドキュメントの読み方

現行アプリは「**アプリサーバーを持たず、SPA が Supabase(PostgREST) を直叩きし、認可・整合性・スケジュール処理をすべて DB 側（RLS + トリガ + PL/pgSQL 関数 + pg_cron）に載せている**」構成である。Cloudflare には PostgREST も RLS も pg_cron も等価物が無いため、再構築では **DB が担っていた責務を Workers アプリ層へ移設**する。したがって本 PRD では、UI 機能要件だけでなく、**DB が暗黙に保証していた不変条件（invariants）と認可規則を明示的な機能要件として書き起こす**。ここを取りこぼすと、そのままセキュリティホール・データ破損になる。

---

## 1. プロダクト概要

### 1.1 コンセプト

エンジニアチーム向けの「**気づき（Tip）**」共有アプリ。中心単位は **140 文字以内の短い気づき**。単なる短文投稿ではなく、以下の「熟成ループ」を回すことを狙う:

1. **書く**: 140 字の気づきを、文脈タグ（種類）＋技術タグ付きで投稿
2. **反応する**: 4 種のリアクションで気づきに応答
3. **試す → 結果**: 🔁「試してみる」を宣言（pledge）→ 3 日後に追跡通知 → 試した結果を新しい気づきとして投稿し、元の気づきに系譜として紐付く
4. **熟成させる**: 自分の 1 週間前の気づきを再読プロンプトで振り返る／他者の過去の良い気づきをフィードに再浮上させる
5. **蓄積する**: 個人アーカイブとして Markdown / JSON でエクスポート

### 1.2 UI 言語・トーン

- 全 UI コピーは **日本語**。日時は `date-fns` の `ja` ロケールで相対表示（例: 「3時間前」）
- 匿名表示名は「**名無しエンジニア**」、アバターイニシャルは「**匿**」

### 1.3 ゴール（再構築）

- 全インフラを **Cloudflare に集約**（単一ベンダー・エッジ実行・単一課金）
- 現行の機能・業務ルール・セキュリティ保証を**同等以上**で再現
- Supabase 固有依存（PostgREST 直叩き、RLS、pg_cron、PL/pgSQL）を排除

### 1.4 非ゴール

- 既存データ移行・API 後方互換（互換性は考慮しない）
- 新機能追加（本書は現行仕様の等価再現が範囲。既知の不足は §12 に列挙）

---

## 2. ターゲットアーキテクチャ（Cloudflare A 案）

| レイヤ | 現行（Supabase） | 再構築（Cloudflare） | 主な作業 |
| --- | --- | --- | --- |
| 静的ホスティング | Vercel（SPA リライト） | **Cloudflare Pages** | ほぼ移設のみ |
| API | PostgREST（DB 直叩き） | **Workers + Hono**（REST API を新規実装） | API を新規に設計・実装 |
| DB | Postgres（`knowledge_share_hub` スキーマ） | **D1（SQLite）** | スキーマ移植（型・配列・enum の読み替え） |
| 行レベル認可 | RLS ポリシー | **Hono ミドルウェア＋クエリ条件**（§7 認可マトリクス） | 宣言的 → 命令的に再実装（最重要） |
| トリガ／関数 | PL/pgSQL トリガ・関数 | **Worker アプリロジック**（トランザクション内で実行） | ロジック移植（§6 不変条件） |
| 定期実行 | pg_cron 2 ジョブ | **Cron Triggers（scheduled Worker）** | 2 ジョブ移植 |
| オブジェクト保存 | Supabase Storage | **R2** | 画像・エクスポート格納（必要時） |
| 認証 | Supabase Auth（Magic Link + Google） | **自前実装**（Workers + セッション）または外部 IdP | 認証基盤を新規構築（§8） |
| 可観測性 | Postgres Logs / `cron_logs` | **Workers Logs / Logpush ＋ `cron_logs` 相当テーブル** | ログ移植 |

### 2.1 推奨コンポーネント構成（実装指針・非規範）

- **フロントエンド**: 既存 React SPA を最大限流用。データ取得部（`@supabase/supabase-js` 直叩き）を **自前 API クライアント（`fetch`）へ全面置換**。UI コンポーネント・TanStack Query・ルーティングはそのまま。
- **API**: Hono on Workers。`/api/*` にドメインエンドポイント。JWT/セッション検証ミドルウェア → 認可ミドルウェア → ハンドラ。
- **DB アクセス**: D1 バインディング。複数書き込みを伴う操作は **D1 のバッチ／トランザクション**でアトミックに（トリガが担っていた「投稿と同時に通知」などを 1 トランザクションに束ねる）。
- **スケジューラ**: `scheduled()` ハンドラ＋ `wrangler.toml` の `[triggers] crons`。

---

## 3. ルーティングと画面一覧

Provider ツリー: `AuthProvider → TooltipProvider → Toaster(Sonner) → Router`。保護ルートは単一の `ProtectedRoute` でラップ。

| パス | 画面 | 保護 | 概要 |
| --- | --- | --- | --- |
| `/login` | Login | 公開 | Magic Link + Google ログイン |
| `/auth/callback` | AuthCallback | 公開 | 認証リダイレクト着地 → `/` へ |
| `/` | Index | 要認証 | 気づきフィード（すべて / フォロー中） |
| `/tips` | TipsList | 要認証 | 公開 Tip のフラットな一覧 |
| `/tips/new` | TipNew | 要認証 | フルページ投稿（`?source=` / `?grown_from=` 対応） |
| `/tips/:id` | TipDetail | 要認証 | Tip 詳細＋系譜＋コメント |
| `/settings/profile` | ProfileSettings | 要認証 | 自分のプロフィール編集 |
| `/users/:username` | UserProfile | 要認証 | 公開プロフィール＋（本人のみ）アーカイブ |
| `/search` | SearchPage | 要認証 | 検索＋タグフォロー |
| `/notifications` | Notifications | 要認証 | 通知一覧 |
| `/admin` | AdminPage | 要認証 | 管理コンソール（読み取り専用） |
| `*` | NotFound | 要認証 | 404 |

**保護の挙動**: 認証状態確定前は全画面「読み込み中…」。未認証なら `/login` へ `state.from` 付きでリダイレクト。認証済みなら描画。

**共通クローム**: `MainLayout = Header + （任意で）RightSidebar`、`max-w-5xl`。TipNew / ProfileSettings / Notifications / AdminPage はサイドバー非表示。Header は sticky で、ロゴ（ホーム）、検索アイコン→`/search`、ベル→`/notifications`（未読数バッジ = 未読通知件数）、アバターのドロップダウン（マイページ / プロフィール設定 / ログアウト）、「気づきを投稿」ボタン（`TipsDialog` を開く）。

> アプリ名は UI 上「**KnowledgeHub**」（📚）、内部名は Knowledge Share Hub。

---

## 4. 機能要件（画面・フロー別）

### 4.1 気づきフィード `/`（Index）

- 見出し「気づきフィード」／サブ「みんなの『ちょっとした気づき』を眺める場所」。
- タブ 2 種: **「すべて」** / **「フォロー中」**。
- **すべて**: 公開 Tip 全件を `ContentCard` で一覧。空: 「まだ気づきが投稿されていません」。
- **フォロー中**: フォロー中タグを含む Tip のみ。クエリはタブを開くまで**遅延**（初回ロードのコスト回避）。空状態の分岐（順序が重要: エラー→ローディング→フォロー 0 件→該当なし）:
  - エラー: 「気づきの読み込みに失敗しました。時間をおいて再度お試しください。」
  - ローディング: 「読み込み中…」
  - フォロー 0 件: 「フォロー中のタグがまだありません。」＋`/search` への導線「検索画面からタグをフォローしましょう。」
  - フォローあり・該当 Tip なし: 「フォロー中のタグに該当する気づきはまだありません。」
- **SelfResurfaceBanner**（自己再読）はタブ上部に常時表示（両タブ共通、§4.8）。
- **ResurfacedFeedSection**（他者の再浮上）は「すべて」タブのみ表示。
- 右下に **FAB**（＋アイコン、aria-label「気づきを投稿」）→ `TipsDialog`。

### 4.2 気づき投稿（2 経路）

投稿は必ず `status = "published"`・`published_at = now` で作成される。**下書きを作る UI は存在しない**（`draft` はデータ状態としてのみ存在し、アーカイブ/エクスポートで保持）。

#### 経路 1: `TipsDialog`（モーダル。FAB・Header から）
- 本文テキストエリア: **140 字ハードキャップ**（`slice(0,140)` ＋ `maxLength`）。残り字数カウンタ、残り < 20 で警告色。プレースホルダ = その日のお題。
- 「今日のお題」ボックス（日替わりプロンプト）。
- **気づきの種類（任意・1 つ選択）**: 文脈タグ単一選択（`ContextTagPicker`）。
- **技術タグ（任意）**: 技術タグ上位 8 件をバッジで複数トグル。
- **匿名で投稿する** チェックボックス。
- 送信「投稿する / 投稿中…」（本文空 or 送信中は無効）、キャンセル。
- 送信処理: `tips` を挿入 → 文脈タグ紐付け → 技術タグ紐付け。技術タグは**大文字小文字を無視して照合**し、無ければ**新規作成**（`category: "tech"`）。一意制約違反（並行作成レース）は既存を再取得してリカバリ。失敗件数はトースト表示（「N 件のタグ保存に失敗しました」等）。成功: 「気づきを投稿しました」。

#### 経路 2: `TipNew`（フルページ `/tips/new`）
クエリパラメータで 3 モード:
- **通常**: 見出し「💡 気づきを投稿する」。「今日のお題」表示。
- **派生（試した結果）**: `?source=<tipId>`。見出し「🔁 試した結果を投稿する」。「派生元の気づき」バナー（本文 80 字で truncate、著者名／匿名は「名無しエンジニア」）。
- **育った気づき**: `?grown_from=<tipId>`（`source` があればそちら優先）。見出し「✨ 育った気づきを投稿する」。「1週間前のあなたの気づき」バナー。

共通フィールドは経路 1 と同等（140 字カウンタ、文脈タグ、技術タグ `TagInput`、匿名スイッチ）。

**ガード規則（重要・DB 側でも二重に強制）**:
- 本文空 or 未ログイン → 「ログインが必要です」。
- `?source` が未解決/削除済 → 送信ブロック（「派生元の読み込み中です…」「派生元の気づきが見つかりません」）。
- **自己派生の禁止**: 自分の Tip を `source` にできない（`sourceTip.author.id === profile.id`）→ エラーバナー「自分の気づきを派生元にはできません」、フィールドセットごと無効化。
- **他者 Tip の育成禁止**: `?grown_from` は自分の Tip のみ。他者なら「育てられるのは自分の気づきだけです。」で無効化。
- 送信可能条件: `本文あり && 送信中でない && 派生元利用可能 && grown_from 利用可能`。
- 送信後: Tip 挿入 → タグ紐付け（`[文脈タグ, ...技術タグ]` を重複排除）。`?source` の場合は **tip_attempts 系譜を upsert でリンク**（成功→`/tips/<sourceTipId>` へ、失敗→`/tips/<newTipId>` へ＋「派生元との紐付けに失敗しました」）。`grown_from` はリンクを張らず**独立した Tip として投稿**。

### 4.3 気づき詳細 `/tips/:id`（TipDetail）

- 状態: 「読み込み中…」／赤エラー／「気づきが見つかりません」。
- **派生元バックリンク**（この Tip 自体が結果の場合）: 「派生元」＋元本文（line-clamp）、元 Tip へリンク。
- **著者ブロック**: アバター（匿名は「匿」）、名前（匿名は「名無しエンジニア」・**非リンク**、実名は `/users/:username` へリンク）、相対時刻。
- **本文**: `whitespace-pre-wrap`。
- **追記（再読み追記）**: アンバー左罫のリスト、「再読み追記 · yyyy-MM-dd」＋本文、時系列。
- **タグ**: 文脈タグ優先でソートし `TagBadgeLink`。
- **リアクションバー**（インタラクティブ）。
- **「試した結果を投稿する」CTA**（→`/tips/new?source=<id>`）: `ログイン済 && 自分の Tip でない && 自分の pledge がある && result_tip_id が null && completed_at が null` のときのみ表示。`completed_at` は一方向ラッチ（一度閉じたら再表示しない）。
- **「この気づきから試した人 (N)」**: 各 attempt をアバター＋名前で表示。**結果 Tip が匿名なら「名無しエンジニア／匿」で表示し非リンク**（相関による匿名解除を防止）。`result_tip_id` があれば「結果あり」バッジ。
- **「📘 試した結果 (N)」**: 結果 Tip を持つ attempt のみ `ContentCard` で表示。
- **コメントセクション**（§4.6）。

### 4.4 検索 `/search`（SearchPage）

- 見出し「気づきを探す」。全 Tip を**クライアント側でフィルタ**。
- **キーワード入力**（プレースホルダ「キーワード、タグで検索...」）: 本文 or 任意タグ名に対する**大文字小文字無視の部分一致**。
- **URL が真実の情報源**: `?q=`（キーワード）と `?tag=`（文脈タグ）。`?tag` が文脈タグ名に一致すれば `contextFilter` に設定、そうでなければ（レガシー `?tag=<tech>`）キーワード欄へ流し込む。`?q` と文脈 `?tag` は併用可（例 `?q=react&tag=#今日の学び`）。
- **気づきの種類で絞り込み**（文脈タグ）: チップで `?tag` をトグル（URL 同期）。各チップに `TagFollowButton`（ベル）を併設。
- **技術タグで絞り込み**（全技術タグ）: チップで**ローカルのみ**の `techFilter` をトグル（URL 非同期。レガシー `?tag=<tech>` キーワード経路との衝突回避）。各チップにフォローボタン併設。
- 合成: `キーワード一致 && 文脈一致 && 技術一致`。無入力なら結果空。
- 結果サマリ: 「{条件を × 連結}の検索結果: N件」。空状態: 無入力→「キーワードまたはタグを選択してください」、該当なし→「検索結果が見つかりませんでした」。

### 4.5 タグフォロー

- `TagFollowButton`: ベルのトグル（フォロー時 primary 色）。フォロー状態確定まで描画を保留（誤ラベル防止）。クリックは伝播停止（チップがリンク内にあるため）。トースト: 「{name} をフォローしました／のフォローを解除しました」、失敗「フォローの更新に失敗しました」。
- フォローは**フォロワー本人にのみ可視**（§7 認可）。**フォロワー数は一切公開しない**（構造的に集計不可能であること）。
- 入口: SearchPage（文脈・技術チップ）、RightSidebar（フォロー中タグ・トレンド文脈・トレンド技術）。

### 4.6 コメント「気づき返し」（CommentSection）

- ヘッダ「気づき返し (N)」。N = **ネスト返信を含む再帰総数**。エディタ placeholder「この気づきを読んで、自分は何に気づいた？」。
- **リッチテキストエディタ**（TipTap、minimal: Bold/Italic/Code/Undo/Redo。full 版は H2/H3・箇条書き・番号・引用・リンク・画像 URL も）。
- **ネストはちょうど 1 段**: ルートコメントのみ「気づきを返す」ボタン。返信には返信ボタン無し（データモデルは任意 `parent_id` 深さを許すが UI はルート宛のみ）。
- **サニタイズ**: 全コメント HTML を DOMPurify で書き込み・表示の両方で通す。許可タグ `p,br,strong,em,s,code,pre,blockquote,h1-h6,ul,ol,li,hr,a,img`／許可属性 `href,src,alt,class`／data 属性禁止。`a` は `rel="noopener noreferrer" target="_blank"` を強制。
- **バリデーション**: サニタイズ後にレンダリング可能な内容（テキスト or img）が必須。空なら「コメント内容を入力してください」。未ログインなら「ログインが必要です」。
- 挿入形: `{author_id, content: sanitized, content_type:"tip", content_id, parent_id: parentId ?? null}`。
- 各コメントに独自のリアクションバー（4 種、size sm）。

### 4.7 リアクション

**4 種のみ**（`REACTION_CONFIG`）:

| enum | emoji | ラベル | 分布バー色 |
| --- | --- | --- | --- |
| `same_thought` | 🤔 | 自分も思った | kh-blue-light |
| `new_view` | 💡 | 新しい視点だった | kh-yellow |
| `try_it` | 🔁 | 試してみる | kh-green |
| `learned` | 📘 | 学びになった | kh-purple |

- **2 表示バリアント**: `buttons`（トグルボタン。Tip/コメントでインタラクティブ）と `distribution`（読み取り専用の比例バー。`ContentCard`）。分布バーは幅 = `count/total`、≥10% で emoji、≥20% で % を表示、ツールチップ「{emoji} {label}: {count}件」。空「まだリアクションがありません」。
- **トグル挙動**: 同一 user+content+type の行があれば削除、無ければ挿入（**1 ユーザーが 1 アイテムに複数種のリアクションを保持可、ただし各種 1 つまで**）。楽観的更新＋失敗ロールバック。
- **`try_it` の副作用（最重要）**: Tip への `try_it` は **tip_attempts 行（pledge）を生成**する（§6.1）。🔁 を押す = 「試してみる」宣言。トグル時に系譜キャッシュも無効化して CTA・「試した人」を同期。
- 未ログイン or 送信中は無効。

### 4.8 気づきの熟成（Resurfacing）

2 系統ある。

**(1) 自己再読**（SelfResurfaceBanner／`tip_resurfacings`）: **スケジューラ**が自分の約 1 週間前の Tip に対して挿入した再読プロンプト行。見出し「気づきの熟成」／サブ「1週間前のあなたの気づき。今のあなたはどう感じる？」。未確認（未 acknowledge）を最大 5 件。各項目に 3 アクション:
  - **追記する** → ダイアログ「今の視点で追記する」。テキストエリア **140 字上限**、placeholder「今のあなたはどう感じる？」。`tip_addendums` 行を追加。成功「追記しました」。
  - **育った気づきとして再投稿** → `/tips/new?grown_from=<tipId>`。
  - **閉じる（X）** → acknowledge のみ。
  - どのアクションも acknowledge を試行（失敗は握りつぶす）。acknowledge は `acknowledged_at` のみ書き込み可（他カラム変更は拒否、§6.4）。

**(2) フィード再浮上**（ResurfacedFeedSection／`useFeedResurfacings`）: **他者**の少し前の良い Tip を再浮上。見出し「今読み直したい気づき」／サブ「少し前に投稿された、時間をおいて読み返したい1件」。**DB/cron 状態を持たず毎回ライブ算出**。選定: 公開 && `created_at` が **7〜60 日前** && `author_id != 閲覧者` && 合計リアクション **≥ 2**、新しい順、**limit 3**、スキャンは 50 件ページで **最大 300 件**まで。

**追記（Addendum）**: 専用テーブル `tip_addendums`、**追記専用（append-only、更新・削除不可）**、**140 字上限かつ 1 字以上**。著者は Tip 著者に限定。TipDetail に時系列表示。

### 4.9 ユーザープロフィール `/users/:username`（UserProfile）

- ヘッダ: アバター、display_name、`@username`、`📋 {current_project}`、bio、skill_tags バッジ。
- 本人判定は**セッション `user.id` と取得した `userId` の比較**（レース回避）。本人のみアーカイブ可。
- **本人ビュー**: タブ「💬 気づき」／「📦 アーカイブ」。タブ状態は `?tab=`（`archive` のみ永続、本人限定）。アーカイブタブは遅延マウント。
- **他者ビュー**: 「💬 気づき (N)」のみ。
- 気づき一覧は **`author_id` 一致・`status=published`・`is_anonymous=false`** にサーバ側で限定（公開プロフィールで匿名投稿を露出しない）。状態: 「気づきを読み込み中…」／赤エラー／「まだ気づきがありません」。

### 4.10 個人アーカイブ／エクスポート（ArchiveSection・issue #11）

- **本人限定**。`useUserArchive` は**下書きを含む全 Tip**（非公開読み取りは著者に限定）＋追記＋試行系譜を取得。全ページネーション。
- UI: 投稿のある日に下線を引くカレンダー（ja）、月 Select（「すべての月」＋`YYYY-MM`）、タグ Select（「すべてのタグ」＋文脈優先）、「条件をクリア」。件数表示「全 N 件」「表示中 M 件」。フィルタはローカルカレンダー基準（日 > 月 の優先）。
- **エクスポート**: **Markdown（.md）** と **JSON（.json）**。
- **ファイル名**: `archive-<sanitizedUsername>-<timestamp>`（username は `[^A-Za-z0-9_-]`→`_`、フォールバック `user`）。Blob ダウンロード。
- **サイズ上限**（超過時トースト、`ArchiveExportSizeError`）:
  - `MAX_EXPORT_ENTRIES = 10,000` 件 → 「エクスポート件数が多すぎます…期間やタグで絞って再度お試しください。」
  - `MAX_EXPORT_CONTENT_BYTES = 20MB`（推定: Tip ごと `content.length*4 + 512`、追記 `+256`、タグ/結果 `+64`）→ 「エクスポート量が大きすぎます（推定 XMB > 20MB）…」。
- **Markdown 構成**: `# {display_name} の気づきアーカイブ`＋メタ（ユーザー・生成日時・件数・条件）→ `## YYYY-MM`（新しい順）→ `### YYYY-MM-DD`＋本文→ 箇条書き（タグ／リアクション／状態〔下書き・公開(date)〕／匿名投稿／派生元／派生先／`**再読メモ:**` に追記一覧）。
- **JSON 構成**（`schema_version: 1`）: `{schema_version, generated_at, owner, filter_summary, count, entries[]}`。各 entry: `{id, content, created_at, status, published_at, is_anonymous, tags[], reactions, source_tip_id, result_tip_ids[], addendums[]}`。シリアライザは純粋関数（Edge Function 不要）。

### 4.11 プロフィール設定 `/settings/profile`

- フィールド: アバター（表示のみ・カメラボタンは非機能）、表示名、現在の案件、スキルタグ（`TagInput`、技術タグ名を文字列で保持）、自己紹介（**200 字上限**、カウンタ `{n}/200`）。
- 保存: `profiles` を更新（`current_project`/`bio` は空→null、`skill_tags` は名前配列）。成功「保存しました」。キャンセル→`navigate(-1)`。

### 4.12 日替わりお題（今日のお題）

- **15 個の固定プロンプト**を**ローカル暦日で決定的にローテーション**（`Date.UTC(y,m,d)/86,400,000 mod 15`）。60 秒ごとにポーリングして日付跨ぎで切替。両投稿フォームで placeholder/お題に使用。
- 15 プロンプト（順序厳守）:
  1. 今日、何に気づいた？
  2. 直近で「あ、これ便利」と思ったことは？
  3. 今週、自分の考え方が変わった瞬間は？
  4. 同僚に伝えたい "ちょっとしたこと" は？
  5. 最近の "違和感" は何だった？
  6. 今日ハマった落とし穴は？
  7. 最近読んだ中で一番響いた一文は？
  8. もっと早く知りたかった…と思ったことは？
  9. 今日、コードや仕事でどんな小さな工夫をした？
  10. 直近で自分なりに言語化できた気づきは？
  11. 当たり前だと思っていたけど、実は違った？ということは？
  12. 今週、過去の自分に教えてあげたいことは？
  13. 最近、何に時間を溶かした？ そこから学んだことは？
  14. 昨日より1mmだけ成長した実感があったのは、どんな瞬間？
  15. 最近、誰かに感謝した瞬間は？ そこから何を学んだ？

### 4.13 気づき一覧 `/tips`（TipsList）

- 見出し「💡 気づき」、公開 Tip 全件を `ContentCard` で表示。

### 4.14 管理画面 `/admin`（AdminPage）

- 見出し「管理画面」（Shield）。タブ「ユーザー管理」「タグ管理」。
- ユーザー: 全 `profiles`（登録日降順）をテーブル表示（ユーザー／メール／ロール〔admin=default バッジ〕／登録日／操作）。**「編集」ボタンは無効（非機能）**。
- タグ: 全 `tags`（名前順）をチップ表示。**「×」削除ボタンは無効（非機能）**。
- **現行はフロントでロールゲートされていない**（`ProtectedRoute` のみ）。§12 で「再構築時に `role='admin'` 認可を必須化」とする。

---

## 5. データモデル（D1 / SQLite ターゲット）

現行は Postgres `knowledge_share_hub` スキーマ。**互換不要**のため、SQLite に自然な形へ読み替える。全テーブルの認可は §7 のミドルウェアで強制する（SQLite に RLS は無い）。

### 5.1 型マッピング方針

| Postgres | D1(SQLite) | 備考 |
| --- | --- | --- |
| `uuid`（`gen_random_uuid()`） | `TEXT` | Worker 側で `crypto.randomUUID()` を採番 |
| `timestamptz`（`now()`） | `TEXT`(ISO8601) または `INTEGER`(epoch ms) | 全期間比較・並び替えに使うため単調・可比較であること。ISO8601 UTC 推奨 |
| `boolean` | `INTEGER`(0/1) | |
| `text[]`（`skill_tags`） | `TEXT`(JSON 配列) | 検索要件が無いため JSON 文字列で十分 |
| enum（`content_status` 等） | `TEXT` ＋ `CHECK(... in (...))` | |
| `bigserial`（`cron_logs.id`） | `INTEGER PRIMARY KEY AUTOINCREMENT` | |
| VIEW（`tip_attempts_public`） | なし（クエリ層でマスキング、§6.5） | |
| トリガ／関数 | なし（Worker アプリロジック、§6） | |

### 5.2 テーブル定義（論理）

**profiles**（`auth.users` 1:1 → 自前ユーザーと 1:1）
`id (PK)`, `email (not null)`, `username (not null, unique)`, `display_name (not null)`, `avatar_url?`, `current_project?`, `bio?`, `skill_tags (JSON配列, default [])`, `role ('admin'|'user', default 'user')`, `created_at`, `updated_at`
- ユーザー作成時に自動でプロフィール行を生成（現行の `handle_new_user` トリガ相当を **サインアップ処理内**で実行）。`username`/`display_name` の既定値はメールのローカル部（`split_part(email,'@',1)` 相当）。

**tags**
`id (PK)`, `name (not null, unique)`, `category ('tech'|'context', default 'tech')`, `created_at`
- **文脈タグ 6 種を固定 UUID でシード**（先頭 `#` 込み・冪等）:
  `#今日の学び / #ハマった / #逆に気づいた / #違和感 / #試してみたい / #振り返り`
  （固定 ID: `80000000-0000-4000-8000-00000000000{1..6}`）

**tips**
`id (PK)`, `author_id (FK profiles, cascade)`, `content (not null, CHECK char_length<=140)`, `is_anonymous (default 0)`, `status ('draft'|'published', default 'draft')`, `published_at?`, `created_at`
- 索引: `author_id`, `status`。

**tip_tags**（M:N）
`tip_id (FK tips, cascade)`, `tag_id (FK tags, cascade)`, `PK(tip_id, tag_id)`。索引 `tag_id`（フォロー中フィードのタグ側スキャン用）。

**comments**
`id (PK)`, `author_id (FK profiles, cascade)`, `content (not null, サニタイズ済 HTML)`, `content_type ('tip')`, `content_id`, `parent_id? (FK comments self, cascade)`, `created_at`。索引 `(content_type, content_id)`, `parent_id`。

**reactions**
`id (PK)`, `user_id (FK profiles, cascade)`, `content_type ('tip'|'comment')`, `content_id`, `reaction_type ('same_thought'|'new_view'|'try_it'|'learned')`, `created_at`, **`UNIQUE(user_id, content_type, content_id, reaction_type)`**。索引 `(content_type, content_id)`。

**notifications**
`id (PK)`, `user_id (FK profiles, cascade)`, `type ('reaction'|'comment'|'reply'|'try_it_followup'|'try_it_result'|'resurface_self')`, `content_type ('tip')`, `content_id`, **`actor_id? (nullable, FK profiles)`**, `is_read (default 0)`, `message (not null)`, `created_at`。索引 `(user_id, is_read)`。
- `actor_id` は**匿名アクションでは NULL**（匿名解除防止、§6.3）。

**tip_attempts**（試行 pledge／系譜）
`id (PK)`, `source_tip_id (FK tips, cascade)`, `result_tip_id? (FK tips, set null)`, `user_id (FK profiles, cascade)`, `pledged_at`, `completed_at?`, `follow_up_notified_at?`, **`UNIQUE(source_tip_id, user_id)`**。索引 `source_tip_id`, `user_id`, `result_tip_id`, 部分索引（`result_tip_id is null and follow_up_notified_at is null`）。

**tip_addendums**（追記・append-only）
`id (PK)`, `tip_id (FK tips, cascade)`, `author_id (FK profiles, cascade)`, `content (CHECK char_length<=140 AND >0)`, `created_at`。索引 `(tip_id, created_at)`, `author_id`。

**tip_resurfacings**（自己再読の送信履歴）
`id (PK)`, `user_id (FK profiles, cascade)`, `tip_id (FK tips, cascade)`, `interval_days (CHECK >0)`, `surfaced_at`, `acknowledged_at?`, **`UNIQUE(user_id, tip_id, interval_days)`**。索引 `user_id`、部分索引（未 ack）。

**tag_follows**（プライベート）
`user_id (FK profiles, cascade)`, `tag_id (FK tags, cascade)`, `followed_at`, `PK(user_id, tag_id)`。索引 `tag_id`。
- UPDATE は無い。再フォローは delete + insert（`followed_at` がリセットされる仕様）。

**cron_logs**（可観測性）
`id (PK autoincrement)`, `job_name (not null)`, `ran_at`, `success (not null)`, `error_message?`, `sqlstate?`, `affected_rows?`。索引 `(job_name, ran_at desc)`。
- 参照は運用/管理者のみ（一般ユーザー非公開）。

> **廃止済みで再実装しないもの**: 旧スキーマの `articles / books / memos / article_tags / memo_tags / memo_entries / book_chapters`（現行 00003/00004 で除去済み）。`content_type` は実質 `tip`（reactions のみ `comment` も取る）。

---

## 6. 不変条件・業務ロジック（旧トリガ/関数 → Worker アプリ層）

RLS/トリガが担っていた保証を **Workers のトランザクション内ロジック**として実装する。ここは UX ではなく**整合性・セキュリティの要**であり、テストで固定すること。

### 6.1 「試してみる → 結果」ループ

1. **pledge 生成**: `try_it` リアクションが **Tip** に付いたとき、`tip_attempts(source_tip_id, user_id)` を upsert（`ON CONFLICT (source_tip_id,user_id) DO NOTHING` 相当）。**自分の Tip への try_it では pledge を作らない**（`author_id == user_id` を除外）。
   - 現行は reactions への AFTER トリガ。再構築では**リアクション作成ハンドラ内**で同一トランザクションで実行。
2. **自己派生の禁止**: `tip_attempts` の `source_tip` 著者 == 試行ユーザーとなる pledge を作らせない（挿入ガード）。
3. **結果リンク**: `?source` からの結果 Tip 投稿時、`result_tip_id` と `completed_at` を pledge にセット。**不変条件**（現行 00014/00015/00018/00020 相当を移植）:
   - `user_id` / `source_tip_id` は作成後 **不変**。
   - `pledged_at` は **不変**（クライアントが 3 日窓をずらせないように）。
   - `follow_up_notified_at` は **システム管理**（ディスパッチャのみ更新可。クライアントによる自己抑制を禁止）。
   - `completed_at` は **一方向ラッチ**（一度セットしたら null に戻せない）。
   - `completed_at` をセットするには `result_tip_id` が必須。
   - `result_tip_id` は一度セットしたら **再割り当て・null 化不可**（正規の消去はカスケード削除のみ）。
   - **結果 Tip の著者は pledge ユーザー本人でなければならない**（他人の Tip を結果に紐付け不可）。
4. **結果リンク通知**: 結果がリンクされたら、**元 Tip の著者へ** `try_it_result` 通知を作成（本人が試した場合＝ source 著者 == user は通知しない）。文言: 「{名前}さんがあなたの気づきを試した結果を投稿しました」。**結果 Tip が匿名なら名前は「名無しエンジニア」、かつ `actor_id = NULL`**（§6.3）。

### 6.2 追跡通知ディスパッチ（Cron①）

- ジョブ名 **`ksh-try-it-followups`**、**毎日 02:00 UTC**（≒11:00 JST）。
- 対象: `pledged_at < now()-3日` かつ `result_tip_id is null` かつ `completed_at is null` かつ `follow_up_notified_at is null`。
- 各対象に `follow_up_notified_at = now()` をセットし（**先に claim してから通知を作る**＝二重送信防止。現行は `FOR UPDATE SKIP LOCKED`。D1 では claim → 通知を 1 トランザクションで）、`try_it_followup` 通知を作成。
- 文言: 「あの気づき、試してみた？「{本文先頭 30 字}{30 字超なら …}」の結果を投稿してみよう」。
- 実行結果を `cron_logs` に記録（成功/失敗、件数、SQLSTATE/エラー、§6.6）。

### 6.3 匿名性の保護（横断要件・最重要）

匿名投稿（`is_anonymous=1`）の実著者が、いかなる経路でも第三者に**逆引きされない**こと。現行が塞いだ具体的リークを再現する:

- **表示層マスキング**: 匿名 Tip は著者名「名無しエンジニア」・アバター「匿」・**プロフィール非リンク**。公開プロフィールの気づき一覧は `is_anonymous=false` のみ。
- **試した人の相関防止**: TipDetail「試した人」で、**結果 Tip が匿名なら**その試行ユーザーを「名無しエンジニア」表示・非リンクにする。
- **API マスキング**（現行 `tip_attempts_public` ビュー相当）: `tip_attempts` を返す API は、**閲覧者が本人でなく、かつ結果 Tip が匿名の場合に `user_id` を null にマスクして返す**。生の `user_id` を返すエンドポイントを作らない（現行はテーブルへの SELECT 権限自体を剥奪）。
- **通知の `actor_id`**: 匿名結果に由来する `try_it_result` 通知は `actor_id = NULL`（`resurface_self` も system 発なので NULL）。API は `actor` を join して返すため、ここを NULL にしないと通知経由で逆引きできてしまう。

### 6.4 自己再読ディスパッチ（Cron②）

- ジョブ名 **`ksh-tip-resurfacings`**、**毎日 02:30 UTC**（Cron① と衝突しないよう 30 分ずらす）。
- 対象 Tip: `status=published` かつ `created_at < now()-7日` かつ `created_at > now()-60日` かつ **その (user,tip,interval=7) の resurfacing 行が未作成**。作成日昇順（**limit なし** ＝ 60 日フロアを越える取りこぼしを防ぐため。現行 00024 で上限撤廃）。
- 各対象に `tip_resurfacings(user_id, tip_id, interval_days=7)` を作成（`ON CONFLICT DO NOTHING`）し、**その Tip 著者本人へ** `resurface_self` 通知を作成（`actor_id = NULL`）。
- 文言: 「1週間前のあなたの気づき、今のあなたはどう感じる？「{本文先頭 30 字}{…}」」。
- `cron_logs` に記録。
- **`tip_resurfacings` の更新制約**: ユーザーは `acknowledged_at` のみ更新可（他カラム変更は拒否）。`acknowledged_at` は**一度セットしたらクリア・再代入不可**（一方向ラッチ）。

### 6.5 集計はオンザフライ（非正規化しない）

- リアクション件数・コメント件数は**保存しない**。閲覧時にリアクション/コメント行を集計して `ReactionSummary`／count に畳み込む（現行のクライアント集計と同じ設計。再構築では **API 側で集計**して返すのが自然）。
- タグ利用数・トレンド（技術/文脈 各上位 8）・「今週の気づき」（直近 7 日・リアクション合計降順・上位 3）も同様に都度算出。

### 6.6 ディスパッチャの可観測性

- 両ジョブは例外を捕捉し、**成功・失敗いずれも `cron_logs` に記録**（失敗時は `error_message`/`sqlstate`、成功時は `affected_rows`）。失敗はログにも警告を残し、戻り値で失敗を示す（現行は `-1`）。Cron Triggers では `scheduled()` 内 try/catch ＋ Workers Logs/Logpush で代替。
- 運用クエリ（そのまま踏襲）: 「直近の失敗 N 件」「ジョブ別の最終成功時刻（24h 以上空きは要調査）」。

---

## 7. 認可マトリクス（RLS → Hono ミドルウェア）

**SQLite に行レベルセキュリティは無い。** 現行 RLS ポリシーを **API 層で等価に強制**する。原則: 認証必須（未認証は全ドメイン API を 401）。`me = 認証ユーザー id`。書き込み系は必ず所有者チェック。**一覧・詳細の SELECT も下表の条件をクエリに畳み込む**（クライアントに絞り込みを委ねない）。

| リソース | 参照(SELECT) | 作成(INSERT) | 更新(UPDATE) | 削除(DELETE) |
| --- | --- | --- | --- | --- |
| profiles | 認証済み全員 | 本人（`id==me`）／サインアップ時自動 | 本人のみ | — |
| tags | 認証済み全員 | 認証済み全員（技術タグ自動作成含む） | — | （管理のみ／現行未実装） |
| tips | **`status=published` または `author_id==me`** | 本人（`author_id==me`） | 本人 | 本人 |
| tip_tags | 認証済み全員 | 対象 Tip の著者のみ | — | 対象 Tip の著者のみ |
| comments | 認証済み全員 | 本人（`author_id==me`） | 本人 | 本人 |
| reactions | 認証済み全員 | 本人（`user_id==me`） | —（トグルは insert/delete） | 本人 |
| notifications | **本人（`user_id==me`）のみ** | **本人宛のみ**（現行 00026: `user_id==me && actor_id==me`）。**システム発（followup/result/resurface）はサーバ内部処理で作成**し、この制約の外側 | 本人（既読化） | — |
| tip_attempts | 認証済み全員（ただし **匿名結果は `user_id` をマスク**、§6.3） | 本人（`user_id==me`）。自己 pledge 禁止 | 本人（不変条件は §6.1 で強制） | （カスケードのみ） |
| tip_addendums | 認証済み全員 | **対象 Tip の著者のみ**（`author_id==me && author_id==tips.author_id`） | —（append-only） | —（append-only） |
| tip_resurfacings | **本人のみ** | システム（ディスパッチャ）のみ | 本人（`acknowledged_at` のみ、§6.4） | （カスケードのみ） |
| tag_follows | **本人のみ**（フォロワー数を集計不能にする核） | 本人（`user_id==me`） | — | 本人 |
| cron_logs | 運用／管理者のみ | システムのみ | — | — |
| admin 系 API | **`role=='admin'` を必須化**（§12） | | | |

> **設計上の含意**: 現行で「通知の INSERT はクライアントから本人宛のみ許可、システム通知は security definer 関数が作成」という二層構造だった点を、再構築では「**クライアント API では通知作成を許可しない／許可しても本人宛のみ。followup・result・resurface はサーバ内部（リアクション作成ハンドラ・cron）でのみ生成**」と読み替える。

---

## 8. 認証（Supabase Auth → 自前 / 外部 IdP）

現行は Supabase Auth（Magic Link ＋ Google OAuth、自動サインアップ）。Cloudflare にマネージド消費者認証の等価物は無いため、**Workers 上に自前構築**（例: セッション/JWT ＋ D1 にユーザー資格情報、Magic Link はメール送信、Google は OAuth2 コードフロー）か、**外部 IdP**（Clerk / WorkOS / Auth0 等）を採用する。要件:

- **Magic Link**: メールにログインリンクを送信。着地は `/<origin>/auth/callback`。UI: 送信後「メールを確認してください」「{email} にログインリンクを送信しました。」「別のメールアドレスを使用する」。ボタン「マジックリンクでログイン／送信中…」。
- **Google OAuth**: リダイレクトは `/<origin>/auth/callback`。ボタン「Googleでログイン」（Google の SVG）。
- **自動サインアップ**: 「アカウントをお持ちでない場合も、上記の方法で自動的にアカウントが作成されます。」— **初回ログイン時にプロフィール行を自動生成**（username/display_name = メールのローカル部を既定）。
- **コールバック** `/auth/callback`: サインイン確立で `/` へ replace 遷移。表示「認証中…」。
- **セッション**: 永続化・自動リフレッシュ。フロントの `AuthContext` は `{ user, session, profile, loading, signInWithMagicLink, signInWithGoogle, signOut, refreshProfile }` を提供（このインターフェースは維持し、内部実装のみ差し替え）。`profile` はユーザー行（`role` を含む）。
- **ログアウト**: セッション破棄 → `/login`。
- **バージョンバッジ**: Login に `v{__APP_VERSION__}`（ビルド時 define）。

---

## 9. 通知（種別と発火）

| type | アイコン | 発火契機 |
| --- | --- | --- |
| `reaction` | 💬 | 自分の Tip/コメントにリアクションが付いた |
| `comment` | 💬 | 自分の Tip にコメント（気づき返し）が付いた |
| `reply` | 💬 | 自分のコメントに返信が付いた |
| `try_it_followup` | 🔁 | 🔁 宣言後 3 日間、結果未投稿の本人へ追跡（Cron①） |
| `try_it_result` | 🎉 | 自分の Tip を元にした結果 Tip が投稿された（§6.1。匿名結果は `actor_id=NULL`） |
| `resurface_self` | ✨ | 自己再読プロンプトが発生（Cron②、`actor_id=NULL`） |

- 未知 type のアイコンは「•」。
- 通知ページ `/notifications`: 見出し「通知」、「すべて既読にする」（未読を一括既読化）。各行 = 未読ドット＋`message`（サーバ生成の日本語）＋相対時刻。`content_type=='tip'` の行は `/tips/<content_id>` へリンク。空「通知はありません」。Header のベルバッジ = 未読数。
- `reaction`/`comment`/`reply` の通知生成は現行スキーマ上、対応する書き込みハンドラで作成する想定（本 PRD では**該当アクションのサーバ処理内で本人以外への通知を生成**、匿名時は名前/`actor_id` を秘匿）。

---

## 10. フロントエンドのデータ取得・集計（実装指針）

現行はクライアント集計だが、再構築では **API が集計済みドメインオブジェクトを返す**のが自然（往復とペイロード削減）。維持すべき挙動:

- **Tip ドメインオブジェクト**: `author`（プロフィール埋め込み・匿名時マスク）、`tags`（**フォロー中フィードでも全タグを保持**。フォロー一致だけに絞らない）、`reactions`（4 種サマリ）、`comment_count`。
- **フォロー中フィード**: 「フォロー → 候補 tip_id → 全タグ付き Tip」の 3 段取得（`INNER JOIN` で非フォロータグを削らない）。
- **トレンド**: 利用数 > 0 を降順、技術/文脈 各上位 8。
- **今週の気づき**: 直近 7 日・リアクション合計降順・同点は公開時刻降順→id、上位 3。
- **ページング**: 大きな `IN(...)` は 100 件チャンク・並列。安定した全順序（timestamp + id タイブレーク）。
- **リアクショントグル**: 楽観的更新＋ロールバック、影響 Tip のみ無効化。`try_it` 時は系譜キャッシュも無効化。

> **バリデーションの現状**: Zod / react-hook-form は**未使用**。字数上限は入力の `slice`＋`maxLength`（Tip 140／追記 140／bio 200）、必須は ad-hoc チェック＋トースト。再構築では**サーバ側バリデーションを正**とし（DB CHECK と Worker で二重化）、クライアントは UX 用の事前検証に留める。

---

## 11. 非機能要件

- **性能**: エッジ実行（Workers/Pages）。フィード・詳細は集計込みで低レイテンシ。`IN` チャンク・ページングで大規模でも破綻しない。
- **セキュリティ**: §7 認可マトリクスと §6.3 匿名性を**サーバ側で強制**。コメント HTML は保存・表示時に DOMPurify（許可リスト厳守、`a` は `noopener/noreferrer/_blank`）。
- **整合性**: §6 の不変条件をトランザクション＋テストで固定。多段書き込み（投稿＋タグ＋通知、pledge＋通知）はアトミックに。
- **可観測性**: Cron の成功/失敗を記録（`cron_logs` ＋ Workers Logs）。ジョブ別最終成功時刻を監視可能に。
- **国際化/日時**: 全 UI 日本語、相対時刻は ja。Cron 文言の「先頭 30 字＋…」等の整形を維持。
- **設定**: フロントは API ベース URL 等を環境変数に。認証プロバイダの資格情報は Workers Secrets に（本書はキー名を列挙しない）。
- **テスト**: 現行は Vitest（16 ファイル）＋ Playwright（golden-path 1 本）。再構築でも同水準以上のユニット＋ API 契約テスト＋主要 E2E を用意。特に §6 不変条件・§7 認可・§6.3 匿名性は回帰テスト必須。

---

## 12. 既知の未実装・要改善（再構築で解消するもの）

- **`/admin` のロールゲート欠如**: 現行はフロントで `admin` を検証していない。再構築では **API・画面ともに `role=='admin'` を必須**にする（§7）。
- **管理アクションが未実装**: ユーザー「編集」・タグ「×削除」は非機能。要件化するなら本フェーズでスコープ定義（現行等価再現の範囲では非機能のまま）。
- **下書き作成 UI が無い**: `draft` はデータ状態のみ。必要なら下書き保存フローを追加検討（現行等価再現では対象外）。
- **プロフィールのアバターアップロード非機能**: カメラボタンは飾り。R2 連携で実装可能（任意）。
- **`ProtectedRoute` の `state.from` 未消費**: ログイン後に元 URL へ戻らない。改善余地。

---

## 13. 用語集

- **気づき（Tip）**: 140 字以内の短い技術的気づき。本アプリの中心単位。
- **文脈タグ（context）**: 「気づきの種類」。プリセット 6 種（先頭 `#`）。1 投稿に 1 つ選択。
- **技術タグ（tech）**: 技術名タグ。自由入力・自動作成、複数可。
- **pledge / 試してみる**: 🔁 リアクションで宣言する「試す約束」。`tip_attempts` 1 行。
- **結果 Tip**: pledge を試した結果として投稿し、元 Tip に系譜リンクされる新しい Tip。
- **追記（Addendum）**: 公開済み Tip への append-only の短い追記（140 字）。
- **自己再読（resurface_self）**: 1 週間後に自分の Tip を振り返る個人向けプロンプト。
- **フィード再浮上**: 他者の 7〜60 日前・反応 2 件以上の Tip をフィードにライブ再掲。

---

### 付録 A: 現行スキーマ進化の要点（参照）

再構築では最終状態のみ再現すればよいが、**なぜその不変条件があるか**の根拠として以下を残す:

- `00004`: 旧 `articles/books/memos` 除去、`content_type` を実質 `tip` に、**Tip 本文 140 字 CHECK** 追加。
- `00005`: リアクション enum を `same_thought/new_view/try_it/learned` に再設計。
- `00007`: `tags.category`（tech/context）＋文脈タグ 6 種シード。
- `00008`〜`00021`: `tip_attempts` の段階的堅牢化（並行性・一意性・状態不変・匿名性）。
- `00019`/`00020`: **匿名性リークの封鎖**（`tip_attempts_public` マスクビュー、`notifications.actor_id` を nullable 化、scheduler フィールドのクライアント改変禁止）。
- `00022`〜`00024`: 自己再読（`tip_resurfacings`）＋ cron②、上限撤廃。
- `00023`: 追記（`tip_addendums`）を専用テーブル化（140 字を超えず、read-modify-write レースも回避）。
- `00025`: タグフォロー（`tag_follows`、フォロワー数を構造的に非公開）。
- `00026`〜`00029`: 通知 INSERT の厳格化・メタデータ列保護。
- `00030`: `cron_logs`＋ディスパッチャ例外捕捉（cron 監視穴を塞ぐ）。
