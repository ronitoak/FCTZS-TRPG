# Flutter 並列クライアント（学習用）

現行の静的 Web（Cloudflare Workers Static Assets / Worker `fctzs`）は本番閲覧用として残し、Flutter は**同じ Worker API** を叩く別アプリとして閲覧できるようにする。

詳細契約: [`docs/api-contract.md`](../docs/api-contract.md)  
全体方針: [`docs/platform-roadmap.md`](../docs/platform-roadmap.md)  
API メモ: [`API_STARTER.md`](./API_STARTER.md)

## 前提

- Flutter SDK 3.x（本環境例: `%USERPROFILE%\flutter`）
- API Base: `https://fctzs-trpg.daruji.workers.dev`（変更時は `--dart-define=API_BASE=...`）
- 認証: 当面は **GET のみ（ゲスト閲覧）**。書込み・Discord ログインは未移植

## プロジェクト

実アプリ: [`fctzs_app/`](./fctzs_app/)  
たたき台の控え: [`lib_starter/`](./lib_starter/)

### 起動（ローカル）

```bash
cd flutter/fctzs_app
flutter pub get
flutter run -d chrome
# または
flutter run -d windows
```

### 限定公開（Flutter Web → Cloudflare）

本番フロントとは別 Worker `fctzs-flutter` に載せる。手順正本: [`docs/flutter-web-deploy.md`](../docs/flutter-web-deploy.md)

```bash
# リポジトリルートで
set FCTZS_FLUTTER_BIN=%USERPROFILE%\flutter\bin\flutter.bat
node scripts/build-flutter-web.mjs
npx wrangler deploy --config wrangler.flutter.toml
```

公開後の目安 URL: `https://fctzs-flutter.daruji.workers.dev/`  
GitHub Actions の **Deploy Flutter Web** からもデプロイできる。

### 閲覧できる画面（ゲスト）

| タブ | 内容 |
|------|------|
| ホーム | 直近開催・進行中卓（`active`）・最近コメント |
| PL | プレイヤー一覧 / 詳細（プロフィール・キャラ・参加卓） |
| シナリオ | 一覧検索 / 詳細（紹介・関連卓・通過キャラ・気になる人数・コメント） |
| セッション | 卓一覧・開催一覧 / 卓詳細（GM・PL・キャラ・開催URL） |
| 募集 | 一覧検索 / 詳細（応募者） |
| キャラ | 一覧検索 / 詳細（能力・技能・通過シナリオ） |

一覧はプルリフレッシュ対応。詳細間はタップで相互遷移する。

### 次のマイルストーン案

- スケジュール照合（`/api/schedule_match`）
- Discord ログインと書込み（コメント / 気になる / 応募）を1機能だけ移植

## 移行 vs 並列の再判断

閲覧3画面以上が動いている。並列継続（Web=管理、Flutter=スマホ閲覧）を当面の前提とする。
