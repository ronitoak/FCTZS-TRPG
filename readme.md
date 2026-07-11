承知いたしました。今後のメンテナンスやFlutter移行時の設計図として、システム全体の中枢となる「1〜4」の仕様をMarkdown形式で書き出します。

体裁は気にせず、現在のシステムの実態（これまでに実装・修正してきた内容）を正確に反映させた備忘録としてまとめました。

---

# FCTZS TRPG部 システム仕様書（開発者向け）

## 1. システム全体構成（アーキテクチャ）

本システムは、サーバーレス環境を組み合わせたSPA（Single Page Application）として構成されている。

* **フロントエンド**: `Cloudflare Pages`
* **構成**: Vanilla JS, HTML, CSS (`public/` フォルダ配下)
* **デプロイ**: GitHub (`main` ブランチ) へのプッシュで自動ビルド・デプロイ。


* **バックエンド（API）**: `Cloudflare Workers` (`index.js`)
* **役割**: フロントエンドからのリクエスト（GET/POST/PATCH/DELETE）の処理、Supabaseとの通信仲介、Discord APIとの連携、および定期処理（Cron）。


* **データベース**: `Supabase` (PostgreSQL)
* **役割**: 全データの永続化。直接のDBアクセスはWorkerまたはフロントエンド（一部）からREST API経由で行う。


* **外部連携**: `Discord`
* **機能**: Webhook経由での各種通知（募集満員、セッション前日通知）、およびInteraction APIを利用したボタン操作（参加/キャンセル）の処理。



---

## 2. データベース仕様（主要テーブル）

Supabase上の主要なテーブルと、システムで利用している主なカラム構成。

### `players` (プレイヤーマスタ)

* `player_id` (PK, UUID等)
* `player_name` (表示名)
* `discord_id` (Discordのメンション用に利用)

### `scenarios` (シナリオ)

* `id` (PK)
* `title` (シナリオ名)
* `description`, `notes` (概要・メモ)
* `system` (システム名)

### `runs` (卓情報)

* `id` (PK)
* `title` (卓名。未設定時はフォールバックあり)
* `scenario_id` (FK: `scenarios`)
* `gm_id` (FK: `players`. ※以前の `gm` テキストカラムから移行)
* `player_ids` (参加者のID配列。※以前の `players` から移行)
* `characters` (参加キャラクターのID配列)
* `status` (active, done 等)

### `sessions` (セッション履歴/予定)

* `id` (PK)
* `run_id` (FK: `runs`)
* `title` (第○回などのタイトル)
* `start` (開始日時)
* `status` (scheduled, done, cancelled)
* `stream_url`, `replay_url` (配信・アーカイブURL)

### `characters` (キャラクター)

* `id` (PK)
* `name` (キャラクター名)
* `system` (対象システム)
* `iachara_url` (いあきゃら等の外部URL)

### `character_skills` (キャラクター技能)

※重複エラー防止のため、更新時は「該当キャラの技能を全DELETEしてから新規POST」の洗い替え方式を採用。

* `id` (PK)
* `character_id` (FK: `characters`)
* `name` (技能名テキスト 例: "近接戦闘（刀剣）")
* `skill_key` (システム上のキー)
* `value` (技能値・数値)

### `recruits` (募集)

* `id` (PK)
* `scenario_id` (FK: `scenarios`)
* `owner_id` (募集主)
* `target_count` (募集人数)
* `current_count` (現在人数)
* `status` (open, full, closed 等)

---

## 3. API仕様（Cloudflare Workers: `index.js`）

全てのHTTPリクエストは `index.js` の `fetch` イベントで受けて、メソッドごとに分割したハンドラー関数にルーティングされる。

### ルーティング一覧

* **OPTIONS**
* `handleOptions()`: CORSのプリフライトリクエストに対応。


* **GET** (`handleGet`)
* `/api/runs`, `/api/sessions`, `/api/characters` など: 内部の `sbGet()` 関数を利用し、Supabaseからデータを取得してフロントへ返す。


* **POST** (`handlePost`)
* `/api/runs`, `/api/sessions`, `/api/characters`, `/api/character_skills` 等の新規作成。


* **PATCH** (`handlePatch`)
* `/api/runs`: 卓情報の更新。（※ `url.search` を直接渡すことで `?id=eq.xxx` の重複エラーを回避する実装済み）
* `/api/sessions` 等の更新。


* **DELETE** (`handleDelete`)
* `/api/character_skills`: 洗い替え更新時の既存データ削除などに利用。



---

## 4. 外部連携仕様（Discord / 定期処理）

### 4-1. Discord Webhook通知

Worker内の `sendDiscordNotification` 関数を使用して、以下のタイミングでDiscordへリッチなEmbedメッセージ（通知）を送信する。

* **募集満員通知**:
* ユーザーのアクション（Discordボタンでの参加等）によって `current_count` が `target_count` に達した際、システムが自動検知して「募集満員」の通知を送信。アバターや名前も動的に生成。



### 4-2. 定期実行 (Cron Triggers: `scheduled`)

* **セッション前日通知**:
* Cloudflare Workersの `scheduled` イベントで定期実行。
* `sessions` テーブルから「翌日開始（scheduled）」のセッションを抽出。
* `runs` テーブルから卓名、`players` テーブルからGMおよび参加PLの `discord_id` を取得（型不一致を防ぐため `String()` で突合処理）。
* 参加者宛にメンション付きでDiscordにリマインドを送信。



### 4-3. Discord Interactions (ボタン操作)

* **エンドポイント**: `POST /api/discord/interactions` (※旧URLから移行済み)
* **フロー**:
1. Discord上で「参加」「キャンセル」等のボタンが押下される。
2. Cloudflare Workerがリクエストを受信。
3. `tweetnacl` ライブラリを使用して、Discordからの正規リクエストであることを署名検証。
4. 押されたボタンの `custom_id` に応じて処理（`registerParticipant` など）を実行し、SupabaseのDBを更新。
5. 処理結果をDiscord上に反映（メッセージの更新など）。



---

以上が現在のバックエンド・データベース・インフラの全体像です。
Flutter移行の際には、「1. のフロントエンドがFlutterに置き換わり、3. のAPIを叩くようになる」という形になります。今後の開発の設計図としてお使いください！