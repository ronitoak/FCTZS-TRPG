# レガシー API / ビュー削除候補

最終更新: 2026-07-21  
契約正本: [`api-contract.md`](./api-contract.md)

削除は「クライアントがフォールバック含め使わなくなった」ことを確認してから行う。

## 優先して軽量へ寄せる経路

| エンドポイント / ビュー | 現状利用 | 推奨 |
|-------------------------|----------|------|
| `GET /api/scenario_summary` | Web / Flutter のシナリオ一覧の**正** | **維持** |
| `GET /api/scenarios` | 詳細・単体取得 | 維持 |
| `GET /api/sessions` | Web sessions/schedule、Flutter 一覧の**正** | **維持**（列限定） |
| `GET /api/scenario_list` + view `scenario_list` | クライアント参照なし（2026-07-21 切替済） | **削除候補**（Worker・view は当面残置） |
| `GET /api/session_list` + view `session_list` | Flutter のフォールバックのみ | **削除候補**（フォールバック除去後に DROP） |
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

## 削除前チェックリスト

1. `rg "scenario_list|session_list|character_details" js flutter` で参照ゼロ（またはフォールバック削除済み）  
2. `tests/contracts.test.cjs` からパスを外す or 410 期待に変更  
3. Supabase で view DROP はメンテ時間に（依存ビュー確認）  
4. パッチノートに improvement を記載  
