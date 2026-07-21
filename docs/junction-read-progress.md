# Junction 読取の進捗と次フェーズ

最終更新: 2026-07-21  
背景: [`database-optimization.md`](./database-optimization.md)、[`DB-overview.md`](./DB-overview.md)

## 現状

| 項目 | 状態 |
|------|------|
| **書込みの正** | Worker が `run_players` / `run_characters` のみ洗替。`runs.player_ids` / `characters` へは**書かない** |
| 配列→junction トリガー | **無効化済**（2026-07-21） |
| **読取 `/api/runs`** | **junction のみ**（取得成功時。失敗時のみレスポンスの配列列を残す） |
| POST/PATCH 応答 | junction で `player_ids` / `characters` を組み立てて返す（クライアント形は維持） |
| フィルタ / Cron / 権限 / session_block | **junction のみ** |
| DB 上の配列列 | 残置・非推奨（過去ミラー。新規更新では古くなる可能性あり） |

## 次フェーズ

1. ~~データ掃除~~ → 完了  
2. ~~読取切替~~ → 完了  
3. ~~Worker dual-write~~ → 完了  
4. ~~Cron / canEditRun / session_block~~ → 完了  
5. ~~配列→junction トリガー無効化~~ → 完了  
6. ~~読取の配列フォールバック撤去~~ → 完了  
7. ~~配列ミラー書込み停止~~ → **完了**（要 Worker 再デプロイ）  
8. 配列列 DROP は全クライアント・手作業参照が junction のみになってから（任意・別リリース）  

## ブロッカー

- Phase C（RLS 締め）はステージング煙テスト後のみ  
- エージェントは SQL を DB に直接実行しない  
- 本変更の本番反映には **Worker `fctzs-trpg` の再デプロイ** が必要  
