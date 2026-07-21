# Junction 読取の進捗と次フェーズ

最終更新: 2026-07-21  
背景: [`database-optimization.md`](./database-optimization.md)、[`DB-overview.md`](./DB-overview.md)

## 現状

| 項目 | 状態 |
|------|------|
| **書込みの正** | Worker が `run_players` / `run_characters` を明示洗替。`runs.player_ids` / `characters` は**互換ミラー**（同時更新） |
| 配列→junction トリガー | **無効化済**（2026-07-21） |
| **読取 `/api/runs`** | **junction のみ**（取得成功時。失敗時のみレスポンスの配列列を残す） |
| フィルタ `participant_id` / `character_id` | **junction のみ**（配列 contains 撤去） |
| Cron / Discord 通知 | **junction のみ** |
| PATCH 権限 `canEditRun` | **junction のみ** |
| `session_block` メンバー判定 | **junction のみ** |

## 次フェーズ

1. ~~データ掃除~~ → 完了  
2. ~~読取切替~~ → 完了  
3. ~~Worker dual-write~~ → 完了  
4. ~~Cron / canEditRun / session_block~~ → 完了  
5. ~~配列→junction トリガー無効化~~ → 完了  
6. ~~読取の配列フォールバック撤去~~ → **完了**（要 Worker 再デプロイ）  
7. 配列ミラー書込みの縮小・列非推奨は任意（クライアント応答形 `player_ids`/`characters` は当面維持）  

## ブロッカー

- Phase C（RLS 締め）はステージング煙テスト後のみ  
- エージェントは SQL を DB に直接実行しない  
- 本変更の本番反映には **Worker `fctzs-trpg` の再デプロイ** が必要  
