# FCTZS TRPG部 システム仕様書（開発者向け）

詳細なスキーマ・API・運用手順は **`docs/` および `docs.html` を正本**とする。本ファイルは構成の要約である。

## 1. システム全体構成

| 層 | 内容 | 正本 |
|----|------|------|
| フロント（本番） | Vanilla HTML/JS → `dist/` → Workers Static Assets（Worker `fctzs`） | [`docs/cloudflare-pages.md`](docs/cloudflare-pages.md), [`docs/platform-roadmap.md`](docs/platform-roadmap.md) |
| API | Cloudflare Workers（`worker/index.js`、Worker `fctzs-trpg`） | [`docs/api-contract.md`](docs/api-contract.md) |
| DB | Supabase（PostgreSQL + Auth + RLS） | [`docs/DB-overview.md`](docs/DB-overview.md), [`docs/DB_info.txt`](docs/DB_info.txt) |
| 画像 | R2（`POST /api/upload`） | Worker + [`docs/r2-cors.json`](docs/r2-cors.json) |
| Flutter（並列・後回し） | 閲覧＋ログイン書込みまで実装済。追加パリティは DB/Worker/Web 完了後 | [`flutter/README.md`](flutter/README.md), [`docs/flutter-web-parity.md`](docs/flutter-web-parity.md) |
| Discord | Webhook / Interactions / Cron | Worker + テスト用 `DISCORD_USE_TEST_WEBHOOK` |

公開 URL 目安:

- Web: `https://fctzs.daruji.workers.dev/`
- API: `https://fctzs-trpg.daruji.workers.dev`
- Flutter Web: `https://fctzs-flutter.daruji.workers.dev/`

ソース編集はリポジトリ直下（`index.html`, `js/`, 各画面ディレクトリ）。**`public/` は触らない**（`.cursorrules`）。

## 2. 主要エンティティ（要約）

| テーブル | 役割 |
|----------|------|
| `players` / `player_profiles` | 部員マスタとプロフィール（欲求・アイコンキャラ ID） |
| `characters` (+ attrs/skills/scenarios) | PC |
| `scenarios` / `scenario_interests` | シナリオと「気になる」 |
| `runs` / `sessions` | 卓と開催（互換期間中は `player_ids`/`characters` 配列が正） |
| `run_players` / `run_characters` | junction（同期先 → 将来の正） |
| `recruitments` / `recruitment_applicants` | 募集（旧称 `recruits` は使わない） |
| `comments` / `posts` | コメント・なりチャ |

正規化手順: [`docs/database-optimization.md`](docs/database-optimization.md)  
用語: [`docs/play-style-glossary.md`](docs/play-style-glossary.md)

## 3. API（要約）

- **GET**: ゲスト可（anon）。契約一覧は `docs/api-contract.md`
- **POST/PATCH/DELETE**: Bearer JWT（Supabase Auth 実検証）。所有者 ID はサーバー側で上書き
- レガシー削除候補: [`docs/legacy-api-retirement.md`](docs/legacy-api-retirement.md)

## 4. Discord / Cron（要約）

- 募集満員などの Webhook 通知
- セッション前日リマインド（Cron）
- Interactions: `POST /api/interactions`（Ed25519 検証）

詳細・煙テスト: [`docs/security-checklist.md`](docs/security-checklist.md)

## 5. 開発時の制約

- DB 変更 SQL はチャット提示 → Supabase Dashboard で手動実行
- 秘密情報は環境変数（ハードコード禁止）
- 機能改修時は `js/patch-notes-data.js` に追記

Flutter は本番 Web を置き換えず並列で伸ばす。書込み移植はパリティ表の「次に埋める候補」を1本ずつ。
