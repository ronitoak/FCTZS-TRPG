# Flutter 並列クライアント（学習用）

現行の静的 Web（Cloudflare Pages）は本番閲覧用として残し、Flutter は**同じ Worker API** を叩く別アプリとして進める。

詳細契約: [`docs/api-contract.md`](../docs/api-contract.md)  
全体方針: [`docs/platform-roadmap.md`](../docs/platform-roadmap.md)

## 前提

- Flutter SDK 3.x
- API Base: `https://fctzs-trpg.daruji.workers.dev`（変更時は `--dart-define=API_BASE=...`）
- 認証: 当面は **GET のみ（ゲスト閲覧）** から始め、ログインは次ステップ

## 最小スコープ（最初のマイルストーン）

1. アプリ起動 → API Base を表示
2. `GET /api/players` を一覧表示
3. `GET /api/scenario_summary`（失敗時 `/api/scenarios`）を一覧表示
4. プルリフレッシュ

書込み・Discord ログインは Web 側が安定している機能を1つだけ後から移植する。

## プロジェクトの作り方

このディレクトリはスケルトン文書のみ。実プロジェクトは次で作成する:

```bash
cd flutter
flutter create fctzs_app
cd fctzs_app
flutter pub add http
```

実装のたたき台は [`lib_starter/`](./lib_starter/) を `fctzs_app/lib/` へコピーして始める。

## 移行 vs 並列の再判断

Pages 安定後、かつ Flutter で閲覧3画面（Players / Scenarios / Recruit または Sessions）が動いた時点で決める。

- 並列継続: Web=管理、Flutter=スマホ体験
- 段階移行: 機能単位で Flutter へ寄せる
