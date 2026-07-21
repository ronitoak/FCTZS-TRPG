# レガシー API / ビュー削除候補

最終更新: 2026-07-21  
契約正本: [`api-contract.md`](./api-contract.md)

削除は「クライアントがフォールバック含め使わなくなった」ことを確認してから行う。

## 退役済み

| エンドポイント / ビュー | 状態 |
|-------------------------|------|
| `GET /api/scenario_list` | **410**。DB view DROP **適用済** |
| `GET /api/session_list` | **410**。DB view DROP **適用済** |
| `GET /api/character_details` | **410**。Flutter は分割 GET。ビュー DROP **適用済**（2026-07-21） |

## 維持（正パス）

| エンドポイント / ビュー | 用途 |
|-------------------------|------|
| `GET /api/scenario_summary` | シナリオ一覧 |
| `GET /api/scenarios` | シナリオ詳細・単体 |
| `GET /api/sessions` | 開催一覧 |
| `GET /api/characters` + attributes / skill_list / scenarios | キャラ詳細（分割） |
| `GET /api/character_skill_list` | Web キャラ詳細の技能表示 |
| `POST /api/character_full` | Web キャラ作成 |
| `GET /api/recruitment_list` | 募集カード |
| `GET /api/runs` | 卓（membership は junction） |
| `GET /api/schedule_match` | 予定照合 |

## コードスタブ

| ファイル | 扱い |
|----------|------|
| `worker/worker.js` | **非デプロイ**。`wrangler.toml` の main は `index.js` |
| `public/` | ビルド成果物。ソース編集禁止 |

## 配列列

`runs.player_ids` / `characters` の DROP: [`sql/drop-runs-array-columns-future.sql.md`](./sql/drop-runs-array-columns-future.sql.md)（Worker 再デプロイ後・手動。画面 UX は不変）
