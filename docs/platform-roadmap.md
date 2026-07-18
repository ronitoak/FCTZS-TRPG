# プラットフォーム方針

最終更新: 2026-07-19（Phase 3: fctzs_app 開始）

## 確定方針

| 項目 | 方針 |
|------|------|
| フロント公開 | **Cloudflare Workers Static Assets**（Worker `fctzs`）。GitHub Pages からの移行は完了（2026-07-17） |
| API / バックエンド | **Cloudflare Workers** + **Supabase** を正本のまま維持 |
| クライアント追加 | **Flutter** を現行 Web と**並列**で学習・試作 |
| 学習テーマ | リッチUI / 自前サーバー / スマホアプリ（本番と分離） |

## 構成

```text
[Workers Static Assets]  静的 HTML/JS（dist/ → Worker fctzs）
        │
        ▼
[Cloudflare Workers]  /api/*  （認証・RLS・Discord・R2）※ Worker fctzs-trpg
        │
        ▼
[Supabase]  Postgres + Auth + RLS

[Flutter app] ──同API──▶ Workers （並列・学習用）
```

手順書ファイル名に「Pages」が残る場合があるが、実装・公開経路は Workers Static Assets である。

## Phase 進捗

| Phase | 内容 | 状態 | 正本 |
|-------|------|------|------|
| 1 | フロント移行（GitHub Pages → Workers `fctzs`） | **完了**（2026-07-17） | [`cloudflare-pages.md`](./cloudflare-pages.md) |
| 2 | API 契約固定 | **完了** | [`api-contract.md`](./api-contract.md) |
| 3 | Flutter 並列 | **進行中**（`flutter/fctzs_app` でゲスト閲覧: ホーム/PL/シナリオ/セッション/募集/キャラ＋詳細） | [`flutter/README.md`](../flutter/README.md) |
| 4 | 学習トラック | **未着手**（本番 API を置き換えない） | 下記 |

DB の junction 正規化（[`database-optimization.md`](./database-optimization.md)）は本 Phase とは独立トラック。

## Phase 順（詳細）

1. **フロント移行** — コード・CI 完了。運用締め（Redirect / 旧 Pages 停止等）は [`cloudflare-pages.md`](./cloudflare-pages.md) §8.2
2. **API 契約固定** — [`docs/api-contract.md`](./api-contract.md)
3. **Flutter 並列** — [`flutter/fctzs_app`](../flutter/fctzs_app/)（現行 Web は本番のまま。次はスケジュール照合・ログイン/書込み）
4. **学習トラック** — 下記

## 学習トラック（本番と分離）

| テーマ | 学び方 | 本番への入れ方 |
|--------|--------|----------------|
| リッチな動的サイト | Flutter Web、または一部画面の SPA 化実験 | フロント Worker 上の別ルートから段階導入 |
| サーバーを立てる/借りる | **別リポジトリ**で小さな API を VPS/自宅で試作 | 当面の本番 API は Workers のまま |
| スマホアプリ | 同じ Worker を叩く Flutter Android/iOS | ストア公開は別判断 |

## URL / 環境変数

| 場所 | キー | 用途 |
|------|------|------|
| `js/site-config.js` / `FCTZS_*` | `SITE_URL`, `AUTH_REDIRECT_URL`, `API_BASE` | フロント |
| Worker env | `SITE_URL` | Discord 埋め込みリンク（例: `https://fctzs.daruji.workers.dev`） |
| Supabase Auth | Redirect URLs | フロント URL（例: `https://fctzs.daruji.workers.dev/`）を追加 |

詳細手順は [`cloudflare-pages.md`](./cloudflare-pages.md)。

## やらないこと（この方針の間）

- Supabase をやめて自前 Postgres に即移行
- GitHub Pages と Cloudflare フロントの長期二重メンテ
- nightreign 系の復活
- 公開 SELECT の全面非公開（方針変更が必要）
