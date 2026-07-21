# Flutter Web 限定公開（Workers Static Assets）

本番フロント（`fctzs`）とは別 Worker `fctzs-flutter` で、ゲスト閲覧用 Flutter Web を配信する。

| 役割 | Worker 名 | URL（初回デプロイ後） |
|------|-----------|----------------------|
| 本番 Web | `fctzs` | https://fctzs.daruji.workers.dev/ |
| Flutter 閲覧 | `fctzs-flutter` | https://fctzs-flutter.daruji.workers.dev/ |
| API | `fctzs-trpg` | https://fctzs-trpg.daruji.workers.dev |

設定ファイル: [`wrangler.flutter.toml`](../wrangler.flutter.toml)  
ビルド: [`scripts/build-flutter-web.mjs`](../scripts/build-flutter-web.mjs)  
CI: [`.github/workflows/flutter-web.yml`](../.github/workflows/flutter-web.yml)

## ローカルから初回デプロイ

```bash
# Flutter が PATH に無い場合（Windows 例）
set FCTZS_FLUTTER_BIN=%USERPROFILE%\flutter\bin\flutter.bat

node scripts/build-flutter-web.mjs
npx wrangler deploy --config wrangler.flutter.toml
```

Cloudflare 認証は本番フロントと同じ（`CLOUDFLARE_API_TOKEN` / アカウントログイン）。

## GitHub Actions

1. Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`（本番フロントと共用で可）
2. Actions → **Deploy Flutter Web** → **Run workflow**
3. または `flutter/**` を `main` に push すると自動デプロイ

## 限定公開の強化（任意）

URL 秘匿だけでは弱い。部員だけにしたい場合:

1. Cloudflare Dashboard → Workers → `fctzs-flutter`
2. **Settings** → **Domains & Routes** / 関連から **Cloudflare Access** を有効化
3. 許可するメール（または One-time PIN）をポリシーに追加

本番 `fctzs` には Access を付けない運用を推奨（一般閲覧用と分離）。

## 注意

- Flutter はゲスト GET に加え、**Discord ログイン＋コメント／気になる／募集応募**に対応
- OAuth 戻り先は Web では**いま開いているオリジン**（ローカルなら localhost、公開なら `fctzs-flutter`）
- Supabase Redirect URLs に次を登録すること:
  - `https://fctzs-flutter.daruji.workers.dev/`
  - ローカル検証時: `http://localhost:PORT/`（ポート固定推奨: `flutter run -d chrome --web-port=56123`）
- API CORS は既に `*` のため別オリジンから叩ける
- **R2 画像**: Flutter Web は `Image.network` が XHR になるため、バケット側 CORS が必要。設定ファイルは [`r2-cors.json`](./r2-cors.json)。適用例:
  ```bash
  npx wrangler r2 bucket cors set fctzs-trpg-assets --file docs/r2-cors.json --force
  ```
- `build/web` は git 管理しない（`.gitignore`）
- サブパス配信する場合は `flutter build web --base-href /app/` と Worker ディレクトリ構成の変更が必要（現在はルート `/`）
