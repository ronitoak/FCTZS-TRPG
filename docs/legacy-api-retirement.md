# レガシー API / ビュー削除候補

最終更新: 2026-07-21  
契約正本: [`api-contract.md`](./api-contract.md)

削除は「クライアントがフォールバック含め使わなくなった」ことを確認してから行う。

## 優先して軽量へ寄せる経路

| エンドポイント / ビュー | 現状利用 | 推奨 |
|-------------------------|----------|------|
| `GET /api/scenario_summary` | Flutter 優先、Web も一部 | **正**として維持 |
| `GET /api/scenarios` | 詳細・フォールバック | 維持（単体取得） |
| `GET /api/scenario_list` + view `scenario_list` | Web `js/scenarios.js` がフォールバック利用 | Web を `scenario_summary` 一本化後に削除候補 |
| `GET /api/session_list` + view `session_list` | Web sessions/schedule、Flutter フォールバック | `/api/sessions` または専用軽量へ寄せた後に削除候補 |
| `GET /api/character_details` + `v_character_details` | Flutter 詳細 | 属性・技能を分割 GET に寄せられたら削除候補 |
| `GET /api/character_skill_list` 等 | 契約にレガシー記載 | 利用箇所調査後 |

## 維持（当面）

| 経路 | 理由 |
|------|------|
| `GET /api/recruitment_list` | 募集カード用の結合ビューとして有用 |
| `GET /api/runs`（配列付き） | junction 読取切替までは現行形を維持（[`junction-read-progress.md`](./junction-read-progress.md)） |
| `GET /api/schedule_match` | Flutter / Web 照合の正 |

## コードスタブ

| ファイル | 扱い |
|----------|------|
| `worker/worker.js` | **非デプロイ**。`wrangler.toml` の main は `index.js`。410 JSON を返す安全スタブとして残置 |
| `public/` | ビルド成果物領域。ソース編集禁止（`.cursorrules`） |

## 削除前チェックリスト

1. `rg "scenario_list|session_list|character_details" js flutter` で参照ゼロ（またはフォールバック削除済み）  
2. `tests/contracts.test.cjs` からパスを外す or 410 期待に変更  
3. Supabase で view DROP はメンテ時間に（依存ビュー確認）  
4. パッチノートに improvement を記載  
