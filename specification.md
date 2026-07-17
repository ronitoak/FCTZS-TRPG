# FCTZS TRPG部 特設サイト システム仕様書

本仕様書は、「FCTZS TRPG部 特設サイト」のシステム概要、アーキテクチャ、ファイル構成、データベース、API、および外部連携に関する仕様をまとめた技術ドキュメントです。
本プロジェクトの今後の機能追加、改修、リファクタリング、あるいはFlutter等への移行時における共通の設計図（リファレンス）として活用します。

---

## 1. システム概要

### 1-1. 目的
「FCTZS TRPG部 特設サイト」は、TRPG（テーブルトーク・ロールプレイングゲーム）セッションの予定管理、プレイヤー・キャラクター情報の蓄積、シナリオ進行状況のトラッキング、および思い出（コメントやセッション履歴）の蓄積を行うためのWebシステムです。

### 1-2. システムの特徴
* **SPA（Single Page Application）構成**: サーバー負荷を抑え、高速な画面遷移とリッチなUXを提供。
* **サーバーレス/マネージドサービスの活用**: CloudflareおよびSupabaseを活用し、低コストかつ高信頼なインフラを構築。
* **外部コミュニティツール連携**: Discordと密接に連携し、セッション募集、満員検知、前日リマインドなどの自動化を実現。

---

## 2. システムアーキテクチャ

本システムは、フロントエンド、バックエンド（API）、データベース、および外部システム（Discord）が連携する3層クライアント・サーバー構成＋外部サービス連携で成り立っています。

```
+---------------------------------------------------------+
|                      フロントエンド                      |
|                 [ Cloudflare Pages ]                    |
|       - Vanilla JS, HTML5, CSS3                         |
|       - レンダリング、ユーザーインタラクション           |
+---------------------------+-----------------------------+
                            |
                     HTTPS (REST API)
                            |
+---------------------------v-----------------------------+
|                      バックエンド                        |
|                [ Cloudflare Workers ]                   |
|       - ルーティング・ビジネスロジック処理                |
|       - Discord Webhook/Interactions APIのハンドリング   |
|       - 定期実行バッチ (Cron Trigger)                   |
+---------------------------+-----------------------------+
                            |
                    REST / PostgreSQL
                            |
+---------------------------v-----------------------------+
|                      データベース                        |
|                       [ Supabase ]                      |
|       - データの永続化 (PostgreSQL)                     |
|       - 認証、アセット管理等                            |
+---------------------------------------------------------+
                            ^
                            | Webhook / API
+---------------------------v-----------------------------+
|                     外部コミュニティ                     |
|                        [ Discord ]                      |
|       - 募集満員通知、セッション前日通知                |
|       - 参加/キャンセルボタン操作受付                    |
+---------------------------------------------------------+
```

* **フロントエンド (Cloudflare Pages)**
  * Vanilla JS, HTML, CSS で構成（`public/` フォルダ配下にビルド成果物を配置）。
  * GitHub (`main` ブランチ) へのプッシュで自動ビルド・デプロイ。
* **バックエンド (Cloudflare Workers)**
  * `worker/index.js` などを中心に稼働。
  * フロントエンドからの各種リクエスト（GET/POST/PATCH/DELETE）を仲介・処理。
  * DiscordからのInteraction API（署名検証に `tweetnacl` を使用）の受け口。
* **データベース (Supabase)**
  * PostgreSQL データベースエンジン。
  * テーブル構造の管理、データの永続化を担う。
* **外部連携 (Discord)**
  * Discord Webhook経由での各種自動通知（募集満員、前日リマインドなど）。
  * Discord Interaction (メッセージ上の「参加」「キャンセル」ボタン) に応じた、Webシステム連携アクション。

---

## 3. ディレクトリ・ファイル構成

主要なフォルダ・ファイルの構成と役割を以下に示します。

```
FCTZS-TRPG/
├── index.html                  # ポータル（HOME）画面。直近の予定、進行中セッション、開発予定、コメント等を表示。
├── 404.html                    # 404 エラーページ。
├── readme.md                   # 開発者向けの基本仕様メモ。
├── bbs/                        # 掲示板（BBS）関連。
│   └── index.html              # 掲示板画面。
├── character/                  # キャラクター管理。
│   ├── create.html             # 新規キャラクター作成画面。
│   ├── detail.html             # キャラクター詳細画面（技能値や外部いあきゃらURL連携等）。
│   └── index.html              # キャラクター一覧。
├── player/                     # プレイヤー管理。
│   ├── detail.html             # プレイヤー詳細（担当GM卓、参加PL卓の一覧等）。
│   └── index.html              # プレイヤー一覧。
├── recruit/                    # 募集管理。
│   ├── detail.html             # 募集詳細（参加希望、Discord連携など）。
│   └── index.html              # 募集一覧。
├── scenarios/                  # シナリオ管理。
│   ├── create.html             # シナリオ登録画面。
│   ├── detail.html             # シナリオ詳細画面。
│   └── index.html              # シナリオ一覧。
├── schedule/                   # 予定・スケジュール管理。
│   └── index.html              # セッション日程の一覧・カレンダー調整。
├── sessions/                   # セッション履歴・詳細管理。
│   ├── create.html             # セッション（卓）新規登録。
│   ├── detail.html             # 各セッション（回数ごと、配信URL、アーカイブ情報等）の詳細。
│   └── index.html              # セッション履歴一覧。
├── css/
│   └── style.css               # グローバル共通スタイルシート。
├── js/                         # フロントエンドJavaScriptロジック（各画面に対応）。
│   ├── init-supabase.js        # Supabaseクライアントの初期化処理。
│   ├── utils.js                # 共通ユーティリティ（日付フォーマット、ナビゲーションバー動的生成、汎用関数）。
│   ├── home.js                 # HOME画面制御用。
│   ├── bbs.js                  # 掲示板制御。
│   ├── character.js            # キャラクター一覧制御。
│   ├── character_create.js     # キャラクター登録。
│   ├── character_detail.js     # キャラクター詳細・技能更新制御（洗い替え機能含む）。
│   ├── player.js               # プレイヤー一覧。
│   ├── player_detail.js        # プレイヤー詳細情報抽出・描画。
│   ├── recruit.js              # 募集一覧。
│   ├── recruit_detail.js       # 募集詳細、Discord連携受付。
│   ├── scenarios.js            # シナリオ一覧。
│   ├── scenario_create.js      # シナリオ追加。
│   ├── scenario_detail.js      # シナリオ詳細。
│   ├── sessions.js             # セッション一覧。
│   ├── session_create.js       # セッション作成。
│   ├── session_detail.js       # セッション詳細。
│   ├── schedule.js             # スケジュール調整。
│   ├── comments.js             # コメント入力制御。
│   └── top_comments.js         # 新着コメントのトップページ表示。
├── img/                        # 各種画像アセット（アバター、シナリオ画像、セッション画像、アイコン等）。
├── worker/                     # Cloudflare Workers（バックエンドAPI）ソースコード。
│   ├── index.js                # APIルーティング、メソッド判定、Supabase連携処理のエントリポイント。
│   ├── worker.js               # 定期処理（Cron）や通知系を含むロジック。
│   ├── wrangler.toml           # Cloudflare Workers の環境設定、Cron定義ファイル。
│   └── package.json            # 依存ライブラリ（tweetnacl 等）の管理。
└── public/                     # Pages公開用フォルダ。
```

---

## 4. データベース設計 (主要テーブル)

データベースは Supabase (PostgreSQL) 上に構築されています。

### 4-1. `players` (プレイヤーマスタ)
システムを利用するプレイヤー情報を保持します。
* `player_id` (PK, UUID または文字列) : プレイヤーを一意に識別するID。
* `player_name` (Text) : 表示用ユーザー名。
* `discord_id` (Text) : Discordのメンション等に用いるDiscordユーザーID（数値文字列）。

### 4-2. `scenarios` (シナリオ情報)
プレイされるTRPGシナリオの情報を管理します。
* `id` (PK, Serial/Int) : シナリオID。
* `title` (Text) : シナリオタイトル。
* `system` (Text) : TRPGシステム名（例: "クトゥルフ神話TRPG", "エモクロアTRPG" 等）。
* `description` (Text) : シナリオ概要・紹介文。
* `notes` (Text) : メモ・特記事項。

### 4-3. `runs` (卓情報)
セッション（卓）そのものの情報を管理します。
* `id` (PK, Serial/Int) : 卓ID。
* `title` (Text) : 卓名。未設定時はシナリオタイトル等をフォールバック表示。
* `scenario_id` (FK: `scenarios.id`) : プレイするシナリオへの参照。
* `gm_id` (FK: `players.player_id`) : ゲームマスター(GM)のID。
* `player_ids` (Array of Text/UUID) : 参加プレイヤーたちのID配列。
* `characters` (Array of Int) : 参加キャラクターのID配列。
* `status` (Text) : 卓のステータス（`active`（進行中）、`done`（完結）等）。

### 4-4. `sessions` (各セッション回/予定)
1つの卓（`runs`）に紐づく、具体的なセッション実施予定（第○回等）を保持します。
* `id` (PK, Serial/Int) : セッション回ID。
* `run_id` (FK: `runs.id`) : 対象となる卓への参照。
* `title` (Text) : 「第1回」「最終回」などの回タイトル。
* `start` (Timestamp) : セッション開始日時。
* `status` (Text) : `scheduled`（予定）、`done`（終了）、`cancelled`（中止）。
* `stream_url` (Text) : 配信先URL（YouTube等）。
* `replay_url` (Text) : アーカイブ/リプレイ動画のURL。

### 4-5. `characters` (キャラクターマスタ)
PC（プレイヤーキャラクター）の情報を登録します。
* `id` (PK, Serial/Int) : キャラクターID。
* `name` (Text) : キャラクター名。
* `system` (Text) : 所属TRPGシステム。
* `iachara_url` (Text) : 「いあきゃら」などの外部キャラクター保管サービスへのURL。

### 4-6. `character_skills` (キャラクター技能)
キャラクターのステータスや技能値を保存します。
* `id` (PK, Serial/Int) : レコードID。
* `character_id` (FK: `characters.id`) : 対象キャラクターへの参照。
* `name` (Text) : 技能名（例: "近接戦闘（刀剣）", "目星"）。
* `skill_key` (Text) : システム識別キー。
* `value` (Int) : 技能値。
* *仕様補足*: 重複エラーを防ぐため、キャラ技能更新時は「該当キャラクターの技能を一度全DELETE（削除）し、その後新規POST（一括追加）する」洗い替え方式を採用。

### 4-7. `recruits` (募集)
セッションプレイヤーの募集を管理します。
* `id` (PK, Serial/Int) : 募集ID。
* `scenario_id` (FK: `scenarios.id`) : 募集するシナリオへの参照。
* `owner_id` (FK: `players.player_id`) : 募集主プレイヤー。
* `target_count` (Int) : 目標募集人数。
* `current_count` (Int) : 現在の応募済人数。
* `status` (Text) : 募集ステータス（`open`（受付中）、`full`（満員）、`closed`（締め切り）等）。

---

## 5. API仕様（Cloudflare Workers: `index.js`）

すべてのHTTPリクエストは、Cloudflare Workerの `fetch` イベントで処理されます。リクエストURLおよびメソッドに応じてハンドラー関数にルーティングされます。

### 5-1. OPTIONS（CORS対応）
* **メソッド**: `OPTIONS`
* **ハンドラー**: `handleOptions(request)`
* **役割**: クロスオリジン（CORS）プリフライトリクエストに対応し、必要なAccess-Controlヘッダーを返却します。

### 5-2. GET（データ取得）
* **メソッド**: `GET`
* **ハンドラー**: `handleGet(request)`
* **エンドポイント例**:
  * `/api/runs` : 卓情報一覧の取得
  * `/api/sessions` : セッション予定・履歴の取得
  * `/api/characters` : キャラクター一覧の取得
* **役割**: `sbGet()` などの共通関数を介して、Supabaseからデータを取得してフロントエンドにJSONとして返却。

### 5-3. POST（新規登録）
* **メソッド**: `POST`
* **ハンドラー**: `handlePost(request)`
* **エンドポイント例**:
  * `/api/runs` : 新規卓作成。
  * `/api/sessions` : 新規セッション（日程）追加。
  * `/api/characters` : キャラクター新規登録。
  * `/api/character_skills` : キャラクター技能値の一括登録。
* **役割**: フロントエンドから受け取ったデータをバリデーションし、Supabaseへインサートします。

### 5-4. PATCH（情報更新）
* **メソッド**: `PATCH`
* **ハンドラー**: `handlePatch(request)`
* **エンドポイント例**:
  * `/api/runs` : 卓情報の変更。URLパラメータ (`?id=eq.xxx`) を直接渡し、重複エラーや条件バッティングを防ぎます。
  * `/api/sessions` : セッション状態や配信URL、日時の変更。
* **役割**: 部分的なデータの差分更新（アップデート）処理を行います。

### 5-5. DELETE（削除）
* **メソッド**: `DELETE`
* **ハンドラー**: `handleDelete(request)`
* **エンドポイント例**:
  * `/api/character_skills` : 技能変更時の既存レコードの一括削除。
* **役割**: 不要なデータの物理/論理削除を行います。

---

## 6. 外部連携・自動化仕様

### 6-1. Discord Webhook通知 (募集満員検知)
* **ロジック**: `sendDiscordNotification(embedData)`
* **挙動**: ユーザーのアクション（Web画面やDiscordボタンでの参加操作等）によって、募集の `current_count` が `target_count` に達した際、Worker側で自動検知。
* **通知内容**: 対象のシナリオ名、GM名、参加メンバー、および募集ステータスが「満員」になったことを示すリッチなEmbedメッセージをDiscordチャンネルへ自動送信。

### 6-2. 定期処理 (Cron Triggers: セッション前日通知)
* **ロジック**: Cloudflare Workers `scheduled` イベントハンドリング
* **トリガー**: `wrangler.toml` に設定されたCron定義に従い定期実行。
* **挙動**:
  1. `sessions` テーブルから「翌日開始予定（`status = 'scheduled'`）」となっているセッションを抽出。
  2. 紐づく `runs` から卓名、および `players` テーブルからGM・参加PLの `discord_id` を検索・抽出。
  3. 各プレイヤーのIDを `String()` に変換し突合、メンション情報を整形。
  4. 翌日の予定に関するリマインドメッセージ（卓名、開始時刻、配信有無、および参加者へのメンション）をDiscord Webhook経由で送信。

### 6-3. Discord Interactions (ボタン操作の処理)
* **エンドポイント**: `POST /api/discord/interactions`
* **挙動**:
  1. Discord上の募集メッセージにある「参加」「キャンセル」等のボタンがプレイヤーに押下される。
  2. Discordのカスタムペイロードが、Cloudflare Workerの該当エンドポイントに送信される。
  3. **署名検証**: `tweetnacl` ライブラリを用い、Discordの公開鍵（Public Key）を使いリクエストが本物であることを暗号学的に署名検証。
  4. ボタンの `custom_id` をパースし、SupabaseのDB更新処理（`registerParticipant` など）を実行。
  5. 処理結果（最新の参加者一覧や募集残数など）を反映した最新メッセージをDiscordにレスポンスとして返し、表示を更新。

---

## 7. 今後のロードマップと開発・テスト方針

### 7-1. 開発予定の主要機能
* **プレイヤー詳細画面の拡張**: 細かい表示領域や統計情報の精査。
* **なりチャ（なりきりチャット）機能**: TRPGキャラクターを模したチャット・ロールプレイ用ロジックの構築。
* **コメント機能の拡張**: 現在HOME画面のみに新着表示されているものを、各セッション詳細やキャラクター詳細、掲示板など、用途・場所に合わせて出し分ける。
* **フロントエンド Flutter 移行対応**: WebのSPA構成からクロスプラットフォーム（Flutter Web/Mobile）化を見据え、API（Cloudflare Workers）のインターフェースやエラーレスポンスの整理、データスキーマの最適化を継続実施。

### 7-2. テスト方針
* **APIテスト**: 各HTTPメソッド（GET/POST/PATCH/DELETE）に対する境界値、異常系（バリデーション、DB接続エラー、権限エラー等）のテスト。
* **外部通知テスト**: Discord Webhook送信および定期バッチ（Cron）のドライランテスト（モックやテスト用Discordサーバーを使用）。
* **UI/UXテスト**: 各種ブラウザ（Chrome, Firefox, Safari等）やスマートフォン表示におけるレイアウト破綻の検知、ローディングスピナーなどの非同期処理時の表示保証。
