# レガシー API / ビュー削除候補

最終更新: 2026-07-21  
契約正本: [`api-contract.md`](./api-contract.md)

削除は「クライアントがフォールバック含め使わなくなった」ことを確認してから行う。

## 優先して軽量へ寄せる経路

| エンドポイント / ビュー | 現状利用 | 推奨 |
|-------------------------|----------|------|
| `GET /api/scenario_summary` | Web / Flutter シナリオ一覧の**正** | **維持** |
| `GET /api/scenarios` | 詳細・単体取得 | 維持 |
| `GET /api/sessions` | Web / Flutter 開催一覧の**正** | **維持** |
| `GET /api/scenario_list` | **410 Gone**（2026-07-21） | DB view DROP は [`sql/drop-legacy-list-views-2026-07.sql.md`](./sql/drop-legacy-list-views-2026-07.sql.md) |
| `GET /api/session_list` | **410 Gone**（2026-07-21） | 同上 |
| `GET /api/character_details` + `v_character_details` | Flutter 詳細 | 属性・技能を分割 GET に寄せられたら削除候補 |
| `GET /api/character_skill_list` 等 | 契約にレガシー記載 | 利用箇所調査後 |

## 維持（当面）

| 経路 | 理由 |
|------|------|
| `GET /api/recruitment_list` | 募集カード用の結合ビューとして有用 |
| `GET /api/runs`（配列付き） | junction 読取は済。応答形は従来互換（[`junction-read-progress.md`](./junction-read-progress.md)） |
| `GET /api/schedule_match` | Flutter / Web 照合の正 |

## コードスタブ

| ファイル | 扱い |
|----------|------|
| `worker/worker.js` | **非デプロイ**。`wrangler.toml` の main は `index.js`。410 JSON を返す安全スタブとして残置 |
| `public/` | ビルド成果物領域。ソース編集禁止（`.cursorrules`） |

## 削除前チェックリスト（一覧ビュー）

1. ~~クライアント参照ゼロ~~ → 完了（Web 一本化＋ Flutter フォールバック除去＋ Worker 410）  
2. ~~契約テスト更新~~ → 完了  
3. Supabase で view DROP（任意）: [`sql/drop-legacy-list-views-2026-07.sql.md`](./sql/drop-legacy-list-views-2026-07.sql.md)  
4. パッチノートに improvement を記載  
