# Flutter 並列クライアント（学習用）

現行の静的 Web（Cloudflare Workers Static Assets / Worker `fctzs`）は本番閲覧用として残し、Flutter は**同じ Worker API** を叩く別アプリとして閲覧できるようにする。

詳細契約: [`docs/api-contract.md`](../docs/api-contract.md)  
全体方針: [`docs/platform-roadmap.md`](../docs/platform-roadmap.md)  
API メモ: [`API_STARTER.md`](./API_STARTER.md)

## 前提

- Flutter SDK 3.x（本環境例: `%USERPROFILE%\flutter`）
- API Base: `https://fctzs-trpg.daruji.workers.dev`（変更時は `--dart-define=API_BASE=...`）
- 認証: **Discord（Supabase Auth）ログイン対応**。ゲストでも GET 閲覧可。書込みはシナリオコメントから段階追加

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
| ホーム | 直近開催・進行中卓（`active`）・最近コメント。AppBar からスケジュール照合・**Discordログイン** |
| PL | プレイヤー一覧 / 詳細（プロフィール・キャラ・参加卓） |
| シナリオ | 一覧検索 / 詳細（紹介・関連卓・通過キャラ・気になる人数・**コメント閲覧＋ログイン時投稿**） |
| セッション | 進行中／終了済の卓 / 卓詳細（GM・PL・キャラ・開催URL） |
| 募集 | 一覧検索 / 詳細（応募者） |
| キャラ | 一覧検索 / 詳細（能力・技能・通過シナリオ） |

一覧はプルリフレッシュ対応。詳細間はタップで相互遷移する。  
パリティ表: [`docs/flutter-web-parity.md`](../docs/flutter-web-parity.md)

### 認証（コメント投稿）

- パッケージ: `supabase_flutter`（Web と同じ Supabase プロジェクト）
- ログイン: ホーム AppBar「ログイン」→ Discord OAuth
- Redirect（既定）: `https://fctzs-flutter.daruji.workers.dev/`  
  **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs に追加が必要**
- 上書き: `--dart-define=AUTH_REDIRECT_URL=...` / `SUPABASE_URL` / `SUPABASE_ANON_KEY`

### 次のマイルストーン案

- ~~スケジュール照合（`/api/schedule_match`）~~ → 実装済み（ゲスト）
- ~~Discord ログイン + コメント投稿~~ → シナリオ詳細で実装済み
- 他画面へのコメント UI 展開、または「気になる」／募集応募を1本追加

## 移行 vs 並列の再判断

閲覧3画面以上が動いている。並列継続（Web=管理、Flutter=スマホ閲覧）を当面の前提とする。
