# Junction 読取の進捗と次フェーズ

最終更新: 2026-07-21  
背景: [`database-optimization.md`](./database-optimization.md)、[`DB-overview.md`](./DB-overview.md)  
優先順: Flutter より **DB / Worker / Web**（[`platform-roadmap.md`](./platform-roadmap.md)）

## 現状

| 項目 | 状態 |
|------|------|
| **書込みの正** | Worker が `run_players` / `run_characters` のみ洗替 |
| 配列→junction トリガー | **無効化済** |
| 読取・フィルタ・Cron・権限 | **junction のみ** |
| API 応答 `player_ids`/`characters` | junction から組み立て（互換キー維持） |
| Worker `RUN_LIST_SELECT` | **配列列を select しない**（DROP 準備済） |
| DB 配列列 | **DROP 済**（2026-07-21）。手順メモ: [`sql/drop-runs-array-columns-future.sql.md`](./sql/drop-runs-array-columns-future.sql.md) |
| `character_details` | **410** + view DROP **適用済** |

## 完了フェーズ

1. データ掃除 / 画像 404 NULL 化  
2. 一覧 API 退役（scenario_list / session_list）  
3. junction 読取・書込・トリガー無効化・配列ミラー停止  
4. キャラ一覧 `character_last_session` 優先  
5. `character_details` 退役  
6. Worker/Web の配列列依存・死コード除去（UX 不変）  

## 残

| 項目 | 備考 |
|------|------|
| 配列列 DROP（手動 SQL） | **完了**（2026-07-21） |
| Phase C RLS | **やらない**（権限が変わる・ステージング必須） |
| Flutter 機能追加 | **後回し** |

## ブロッカー

- エージェントは SQL を DB に直接実行しない  
- Phase C はステージング前提  
