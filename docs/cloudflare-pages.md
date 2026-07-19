# フロント公開移行手順（Workers Static Assets）

ファイル名に歴史的経緯で `cloudflare-pages` が残るが、公開経路は Workers Static Assets（Worker `fctzs`）である。

## 概要

静的フロントだけを `dist/` に集め、Cloudflare へ公開する。

| 役割 | URL / 名前 |
|------|------------|
| フロント | Worker 名 `fctzs`（静的アセット）→ [https://fctzs.daruji.workers.dev/](https://fctzs.daruji.workers.dev/) |
| Flutter 閲覧 | Worker 名 `fctzs-flutter` → [https://fctzs-flutter.daruji.workers.dev/](https://fctzs-flutter.daruji.workers.dev/)（手順: [`flutter-web-deploy.md`](./flutter-web-deploy.md)） |
| API | Worker 名 `fctzs-trpg` → [https://fctzs-trpg.daruji.workers.dev](https://fctzs-trpg.daruji.workers.dev) |

補足: 公開 URL が `*.workers.dev` のため、CI は `wrangler pages deploy` ではなく  
`wrangler deploy --config wrangler.frontend.toml`（[Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)）を使います。

## GitHub Secrets の作り方（ここが分からないとき）

GitHub の Secrets は **Cloudflare のダッシュボードから値をコピーして貼る**ものです。リポジトリ内には書きません。

### A. `CLOUDFLARE_ACCOUNT_ID`（アカウントID）

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. 右上のアカウントを確認した状態で、左側 **Workers & Pages** を開く
3. 右サイドや概要に **Account ID** が出る  
   - 出ない場合: 任意のドメインを開く → 右下の **API** 欄に Account ID がある  
   - または: [https://dash.cloudflare.com/?to=/:account/workers-and-pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) の URL 中の長い英数字が Account ID のこともある
4. その文字列をコピー
5. GitHub → リポジトリ `FCTZS-TRPG` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Secret: さっきの Account ID

### B. `CLOUDFLARE_API_TOKEN`（APIトークン）

1. Cloudflare Dashboard 右上のプロフィール → **My Profile**
2. 左メニュー **API Tokens**
3. **Create Token**
4. テンプレート **Edit Cloudflare Workers** を使う（Pages のデプロイにも使える）  
   または **Create Custom Token** で最低限:
   - Account → Cloudflare Pages → Edit
   - Account → Account Settings → Read（Account ID 確認用。無くても可）
5. Account Resources で自分のアカウントを選択 → **Continue to summary** → **Create Token**
6. **一度だけ表示されるトークン文字列をコピー**（閉じると二度と見られない）
7. GitHub → 同じ **Actions secrets** 画面で
   - Name: `CLOUDFLARE_API_TOKEN`
   - Secret: さっきのトークン

トークンを紛失したら、古いのを削除して作り直せばよいです。

### C. 任意: Repository Variables（公開URL）

GitHub → **Settings** → **Secrets and variables** → **Actions** → **Variables** タブ

| Name | 値の例 |
|------|--------|
| `FCTZS_SITE_URL` | `https://fctzs.daruji.workers.dev` |
| `FCTZS_AUTH_REDIRECT_URL` | `https://fctzs.daruji.workers.dev/` |
| `FCTZS_API_BASE` | `https://fctzs-trpg.daruji.workers.dev` |

未設定でも `js/site-config.js` の既定値（上記と同じ）で `prepare-pages` が動きます。

---

## 1. ローカルで成果物を作る

```bash
node scripts/prepare-pages.mjs
```

任意の環境変数:

```bash
set FCTZS_SITE_URL=https://fctzs.daruji.workers.dev
set FCTZS_AUTH_REDIRECT_URL=https://fctzs.daruji.workers.dev/
set FCTZS_API_BASE=https://fctzs-trpg.daruji.workers.dev
node scripts/prepare-pages.mjs
```

`dist/` には `public/`・`worker/`・`tests/` を含めない。

## 2. Cloudflare / GitHub の準備チェックリスト

1. Pages プロジェクト名は **`fctzs`**（workflow と一致）
2. Secrets: `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`
3. Variables（推奨）: 上記 C

## 3. Supabase の Redirect URL を設定する（詳細）

Discord ログイン後に戻ってくる先を、新しいフロント URL に許可する設定です。

1. [Supabase Dashboard](https://supabase.com/dashboard) にログイン
2. プロジェクト `bcmxaqrjpelpfxafrtqu`（FCTZS 用）を開く
3. 左メニュー **Authentication**（認証）
4. 上タブまたは左下寄りの **URL Configuration**（URL 設定）を開く  
   - 場所が分からない場合: **Authentication** → **Sign In / Providers** の近く、または **Project Settings** → **Authentication**
5. 次を確認・編集する

| 項目 | 推奨値 | 注意 |
|------|--------|------|
| **Site URL** | `https://fctzs.daruji.workers.dev` | メインの戻り先。末尾スラッシュなしでも可 |
| **Redirect URLs** | 下のリストを追加 | **1行に1 URL**。許可されていない URL へはログイン後に戻れない |

Redirect URLs に入れる例（コピー用）:

```text
https://fctzs.daruji.workers.dev/
https://fctzs.daruji.workers.dev/**
https://ronitoak.github.io/FCTZS-TRPG/
https://ronitoak.github.io/FCTZS-TRPG/**
```

- 新フロント必須: `https://fctzs.daruji.workers.dev/`
- 移行中の保険: 旧 GitHub Pages の行も残してよい
- `/**` はサブパスへの戻りをまとめて許可する書き方（Supabase のワイルドカード対応時）
- 編集後は **Save** を必ず押す

6. 動作確認（設定後）
   - [https://fctzs.daruji.workers.dev/](https://fctzs.daruji.workers.dev/) を開く
   - **Discord Login** を押す
   - Discord 認証後、同じフロント URL に戻ってログイン状態になれば成功
   - 「redirect_uri is not allowed」等のエラーなら、Redirect URLs のスペル・`https`・末尾 `/` を見直す

---

## 4. API Worker に `SITE_URL` を設定する（詳細）

Discord 通知の「詳細を見る」リンクなどが、新しいフロントを指すようにします。  
対象は **API 用 Worker**（名前の目安: `fctzs-trpg`）。フロント用の `fctzs` とは別です。

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages**
2. 一覧から **`fctzs-trpg`**（API）を開く  
   - 間違えてフロントの `fctzs` を開かないこと
3. 上タブ **Settings**
4. **Variables and Secrets**（または Variables）を開く
5. **Add** / **Edit variables**
   - Type: **Text**（Plaintext）でよい（秘密情報ではない）
   - Variable name: `SITE_URL`
   - Value: `https://fctzs.daruji.workers.dev`  
     - **末尾に `/` を付けない**
6. **Save** / **Deploy** が出たら保存する  
   - 変数変更後、Worker の再デプロイが必要な UI の場合は指示に従う
7. 確認
   - 募集作成やセッション通知で Discord に飛ぶリンクが  
     `https://fctzs.daruji.workers.dev/...` になっていれば成功
   - まだ `github.io` のままなら、変数名の typo（`SITE_URL` 完全一致）と、編集した Worker が API 側かを確認

`wrangler deploy` はローカル `wrangler.toml` でリモート設定を上書きする。  
`SITE_URL` と observability は [`worker/wrangler.toml`](../worker/wrangler.toml) に書いておき、Dashboard だけに頼らないこと。

---

## 5. GitHub Actions で Pages を手動デプロイする（詳細）

Secrets（`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`）を入れたあとで行う。

### 5.1 事前条件

- 変更が GitHub の `main` に push 済みであること  
  （workflow ファイルや `site-config.js` がリモートに無いと、古い定義で動く）
- リポジトリ: `ronitoak/FCTZS-TRPG`（自分の fork ならそのリポジトリ）

### 5.2 手動実行の手順

1. ブラウザでリポジトリを開く  
   例: `https://github.com/ronitoak/FCTZS-TRPG`
2. 上タブ **Actions**
3. 左の Workflows 一覧から **Deploy to Cloudflare Pages** を選ぶ  
   - 出てこない場合: `.github/workflows/cloudflare-pages.yml` が `main` に無い → push が必要
4. 右上の **Run workflow**
5. Branch は **`main`** のまま → 緑の **Run workflow** を押す
6. 下に新しい実行が並ぶので、その行をクリックしてログを見る

### 5.3 成功 / 失敗の見方

| 結果 | 意味 | 次にやること |
|------|------|----------------|
| 全体が緑（成功） | `dist` 生成 → Worker `fctzs` へ公開完了 | [https://fctzs.daruji.workers.dev/](https://fctzs.daruji.workers.dev/) をハードリロードして確認 |
| `npx ... exit code 1` だけ見える | 昔の workflow が `pages deploy` して失敗していることが多い | 最新の workflow（`wrangler.frontend.toml` + `deploy`）を `main` に入れて再実行 |
| `Authentication error` / `401` / `403` | Token または Account ID が違う | Secrets を作り直し。Token は **Edit Cloudflare Workers** テンプレを使う |
| `Check Cloudflare secrets` で失敗 | Secret 名の typo か未設定 | `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を確認 |
| `Prepare Pages artifact` で失敗 | Node / スクリプトエラー | ログの `prepare-pages.mjs` 行を読む |

ログの見方: 失敗したジョブ → **Publish frontend Worker**（または旧名 Publish to Cloudflare Pages）を開き、`wrangler` が出している赤いエラー行を確認する。

### 5.4 以後の自動デプロイ

- `main` に push するたびに同じ workflow が自動実行される
- 旧 **Deploy to GitHub Pages (legacy)** は手動専用。常用しない
- GitHub → **Settings** → **Pages** で Source が GitHub Actions のままなら、二重公開を避けるため無効化してよい

---

## 6. 設定後の通し確認（推奨順）

1. Actions のデプロイが緑
2. [https://fctzs.daruji.workers.dev/](https://fctzs.daruji.workers.dev/) で Home / Sessions / Character が開く
3. Discord Login → 戻ってきてログイン状態になる（Supabase Redirect）
4. 予定・募集など API が読める（API Worker 側）
5. （任意）募集を1件立てて Discord リンクが新 URL か見る（Worker `SITE_URL`）

## 7. 合格条件

- Home / Sessions / Character / Recruit / Schedule がフロント URL で表示できる
- Discord ログイン往復が成功する
- API Worker・R2 画像が従来どおり動く
- Discord 通知のリンクがフロント URL を指す

## 8. 移行の締め（最終チェック）

**状態（2026-07-17）: 通し確認成功・移行完了。**  
コード・CI・公開URLの正本は Cloudflare 側（フロント `fctzs` / API `fctzs-trpg`）です。

旧 GitHub Pages をまだ止めていない場合だけ、§8.2 C を実施すればよい。


### 8.1 すでに揃っているもの（自動確認済みの目安）

| 項目 | 状態 |
|------|------|
| フロント URL | `https://fctzs.daruji.workers.dev/` が応答 |
| `js/site-config.js` | `SITE_URL` / `AUTH_REDIRECT_URL` / `API_BASE` が上記に一致 |
| CI | `main` push → Cloudflare workflow。旧 GitHub Pages は `workflow_dispatch` のみ |
| API Worker `SITE_URL` | `worker/wrangler.toml` の `[vars]` に記載（deploy で維持） |

### 8.2 あなたがやること（この順）

**A. Supabase Redirect（必須）**

1. [§3](#3-supabase-の-redirect-url-を設定する詳細) のとおり Redirect URLs に新 URL があること
2. [https://fctzs.daruji.workers.dev/](https://fctzs.daruji.workers.dev/) で **Discord Login** → 同じ URL に戻ってログイン状態になること

**B. 画面通し（必須）**

新 URL で次を開く（ハードリロード推奨）:

- Home / Sessions / Character / Recruit / Schedule
- 画像（キャラ・シナリオ）が R2 から表示されること
- ログイン後、予定や募集が読めること

**C. 旧 GitHub Pages を止める（推奨）**

1. GitHub → リポジトリ **Settings** → **Pages**
2. Source を **None**（または Pages を Disable）にする  
   - 以後 `ronitoak.github.io/FCTZS-TRPG` は出なくなる（または 404）
3. Supabase の Redirect URLs から旧 `github.io` 行を消すかは任意  
   - もう旧 URL を使わないなら削除してよい
4. ブックマーク・Discord 案内を新 URL に差し替える

**D. 任意**

- Discord 通知の詳細リンクが `https://fctzs.daruji.workers.dev/...` であること（次回 Cron や手動通知で確認で可）
- `public/` 旧成果物をローカルから削除（正本ではない）

### 8.3 コード完了と運用締めの分離

| 区分 | 状態 | 内容 |
|------|------|------|
| コード・CI・公開URL | **完了**（2026-07-17） | §8.1。方針正本は [`platform-roadmap.md`](./platform-roadmap.md) |
| 運用チェック（Dashboard・案内） | 人が確認 | §8.2 A–D |

運用締めの完了定義（すべて Yes なら運用面も完了）:

1. 新 URL で主要画面が表示できる  
2. Discord ログイン往復が成功する  
3. 旧 GitHub Pages を停止した（または意図的に短期間だけ残している）  
4. メンバーへの案内 URL が新 URL になっている
