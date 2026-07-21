# プラットフォーム方針

最終更新: 2026-07-21（Flutter Discord ログイン／シナリオコメント）

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

[Flutter Web]  Worker fctzs-flutter（限定公開可）──同API──▶ Workers
[Flutter app]  （ローカル / 実機）──同API──▶ Workers
```

手順書ファイル名に「Pages」が残る場合があるが、実装・公開経路は Workers Static Assets である。  
Flutter Web 公開: [`flutter-web-deploy.md`](./flutter-web-deploy.md)

## Phase 進捗

| Phase | 内容 | 状態 | 正本 |
|-------|------|------|------|
| 1 | フロント移行（GitHub Pages → Workers `fctzs`） | **完了**（2026-07-17） | [`cloudflare-pages.md`](./cloudflare-pages.md) |
| 2 | API 契約固定 | **完了** | [`api-contract.md`](./api-contract.md) |
| 3 | Flutter 並列 | **進行中**（ゲスト閲覧＋スケジュール照合＋Discordログイン／シナリオコメント。パリティ: [`flutter-web-parity.md`](./flutter-web-parity.md)） | [`flutter/README.md`](../flutter/README.md) |
| 4 | 学習トラック | **未着手**（本番 API を置き換えない） | 下記 |

DB の junction 正規化（[`database-optimization.md`](./database-optimization.md)）は本 Phase とは独立トラック。  
改善メモ: 用語 [`play-style-glossary.md`](./play-style-glossary.md) / パリティ [`flutter-web-parity.md`](./flutter-web-parity.md) / レガシー API [`legacy-api-retirement.md`](./legacy-api-retirement.md)

## Phase 順（詳細）

1. **フロント移行** — コード・CI 完了。運用締め（Redirect / 旧 Pages 停止等）は [`cloudflare-pages.md`](./cloudflare-pages.md) §8.2
2. **API 契約固定** — [`docs/api-contract.md`](./api-contract.md)
3. **Flutter 並列** — [`flutter/fctzs_app`](../flutter/fctzs_app/)（現行 Web は本番のまま。次は他詳細のコメント／「気になる」／募集応募など書込み1本）
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
