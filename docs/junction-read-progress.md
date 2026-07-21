# Junction 読取の進捗と次フェーズ

最終更新: 2026-07-21  
背景: [`database-optimization.md`](./database-optimization.md)、[`DB-overview.md`](./DB-overview.md)

## 現状

| 項目 | 状態 |
|------|------|
| 書込みの正 | まだ **`runs.player_ids` / `runs.characters` 配列**（トリガーで junction 同期） |
| **読取 `/api/runs`** | **junction 優先**（`hydrateRunsMembershipFromJunctions`）。レスポンス形は従来どおり `player_ids` / `characters` / `gm_name` / `player_names` |
| フィルタ `participant_id` / `character_id` | junction の run_id 引き → 未ヒット時のみ配列 contains フォールバック |
| Cron / Discord 通知 | まだ配列を参照（別途切替可） |

## 配列依存が残る主な箇所

| 場所 | 依存 |
|------|------|
| Worker 書込み（PATCH/POST runs） | 配列更新＋ Service Role |
| Cron / Discord 通知 | `run.player_ids` |
| Web 卓編集 UI | 配列ベースの保存 |

## 次フェーズ準備（推奨順）

1. **データ掃除**: [`sql/data-cleanup-2026-07.sql.md`](./sql/data-cleanup-2026-07.sql.md) → **完了**（2026-07-21）  
2. **検証 SQL 再実行**: `database-optimization.md` の配列↔junction 一致確認  
3. **読取切替**: `/api/runs` → **完了**（2026-07-21、Worker 再デプロイ必要）  
4. **書込みは配列のまま**維持し、読取が安定していることを確認  
5. **正の逆転**: 書込みを junction 更新 → 配列を生成／非推奨化（別リリース）  
6. レガシー重いビュー削除はクライアントが使わなくなってから（[`legacy-api-retirement.md`](./legacy-api-retirement.md)）

## ブロッカー

- Phase C（RLS 締め）はステージング煙テスト後のみ
- エージェントは SQL を DB に直接実行しない。Dashboard 手動実行
- 本変更の本番反映には **Worker `fctzs-trpg` の再デプロイ** が必要
