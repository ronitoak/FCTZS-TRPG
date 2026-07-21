# Junction 読取の進捗と次フェーズ

最終更新: 2026-07-21  
背景: [`database-optimization.md`](./database-optimization.md)、[`DB-overview.md`](./DB-overview.md)

## 現状（コード完了）

| 項目 | 状態 |
|------|------|
| **書込みの正** | Worker が `run_players` / `run_characters` のみ洗替 |
| 配列→junction トリガー | **無効化済** |
| 読取・フィルタ・Cron・権限 | **junction のみ** |
| API 応答 `player_ids`/`characters` | junction から組み立て（互換キー維持） |
| DB 配列列 | 残置。DROP は [`sql/drop-runs-array-columns-future.sql.md`](./sql/drop-runs-array-columns-future.sql.md)（未推奨） |
| `character_details` | **410**。Flutter は分割 GET。ビュー DROP **適用済**（2026-07-21） |

## 完了フェーズ

1. データ掃除 / 画像 404 NULL 化  
2. 一覧 API 退役（scenario_list / session_list）  
3. junction 読取・書込・トリガー無効化・配列ミラー停止  
4. キャラ一覧 `character_last_session` 優先  
5. `character_details` 退役準備（Flutter 分割 GET + Worker 410）  

## 残（手動のみ）

| 項目 | 備考 |
|------|------|
| Worker / フロント / Flutter 再デプロイ | 実施済み想定 |
| `v_character_details` DROP | **完了**（2026-07-21） |
| 配列列 DROP | 将来・慎重 |
| Phase C RLS | ステージング煙テスト後のみ |

## ブロッカー

- エージェントは SQL を DB に直接実行しない  
- Phase C はステージング前提  
