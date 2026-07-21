# Web: レガシー一覧APIの軽量化

## 方針

Flutter 改修は止め、Web は docs 上いちばん安全で効果の大きい **レガシー一覧API寄せ** から進める（[`docs/legacy-api-retirement.md`](docs/legacy-api-retirement.md)）。

- `scenario_list` → `scenario_summary` 一本化
- `session_list` → `sessions` 一本化（Worker 上の select 列は同一: `id,run_id,start,status,title`）
- **この段階では** Worker エンドポイントと DB ビューは削除しない（クライアント参照ゼロ確認後の別作業）

## 変更内容

### 1. Web クライアント

| ファイル | 変更 |
|----------|------|
| [`js/scenarios.js`](js/scenarios.js) | `apiGetWithFallback("scenario_summary", … scenario_list …)` をやめ、`apiGet("scenario_summary")` のみ |
| [`js/sessions.js`](js/sessions.js) | `session_list` → `sessions` |
| [`js/schedule.js`](js/schedule.js) | `session_list` → `sessions` |

`scenario_detail.js` のコメントのみ（全 session_list 非使用）は文言整理可。

### 2. Flutter（最小・フォールバック順だけ）

[`flutter/fctzs_app/lib/api/api_client.dart`](flutter/fctzs_app/lib/api/api_client.dart) の `fetchSessions` を `/api/sessions` 優先（現状は `session_list` 優先）にし、レガシー参照を実質ゼロに近づける。UI 改修はしない。

### 3. ドキュメント / 契約

- [`docs/legacy-api-retirement.md`](docs/legacy-api-retirement.md): Web 参照状況を更新（削除候補へ格上げ、まだ DROP しない）
- [`docs/api-contract.md`](docs/api-contract.md) / [`docs/DB-overview.md`](docs/DB-overview.md): 正パスを `scenario_summary` / `sessions` と明記
- [`js/patch-notes-data.js`](js/patch-notes-data.js): `improvement`（インフラ寄り）

### 4. 検証

- `rg "scenario_list|session_list" js` → コード参照ゼロ（コメント除く）
- `node scripts/check-all.mjs` と既存契約テスト（エンドポイント自体は当面残す）

## やらないこと（今回）

- ~~Supabase で `scenario_list` / `session_list` ビュー DROP~~ → 任意手動SQLを追加済み  
- ~~Worker から `/api/scenario_list` `/api/session_list` 削除~~ → **410 Gone で退役済み**  
- junction 書込み正の逆転  
- 404 画像 NULL 化 SQL の実行代行  

## デプロイ

フロント Worker `fctzs` の再デプロイが必要。API Worker 変更は不要（クライアント切替のみ）。
