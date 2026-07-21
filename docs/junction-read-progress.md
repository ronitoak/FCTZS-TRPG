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
| キャラ一覧最終セッション | `character_last_session` 優先（失敗時のみ runs/sessions 補完） |
| DB 上の配列列 | 残置・非推奨（過去ミラー。新規更新では古くなる可能性あり） |

## 完了フェーズ

1. ~~データ掃除~~  
2. ~~読取切替~~  
3. ~~Worker dual-write → 配列ミラー停止~~  
4. ~~Cron / canEditRun / session_block~~  
5. ~~配列→junction トリガー無効化~~  
6. ~~読取の配列フォールバック撤去~~  
7. ~~キャラ一覧の runs 全件補完を失敗時のみへ~~  

## 残作業（任意・別トラック）

| 項目 | 備考 |
|------|------|
| `runs.player_ids` / `characters` 列 DROP | 手作業・SQL 直参照が無くなってから |
| 404 画像 URL の NULL 化 | ~~適用待ち~~ → **完了**（2026-07-21） |
| Phase C（RLS 締め） | ステージング煙テスト後 |
| `character_details` 等レガシー | [`legacy-api-retirement.md`](./legacy-api-retirement.md) |

## ブロッカー

- エージェントは SQL を DB に直接実行しない  
- junction 関連 Worker 変更の本番反映には **`fctzs-trpg` 再デプロイ**  
- キャラ一覧軽量化の本番反映には **フロント Worker `fctzs` 再デプロイ**  
