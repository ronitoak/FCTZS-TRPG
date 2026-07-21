# Junction 読取の進捗と次フェーズ

最終更新: 2026-07-21  
背景: [`database-optimization.md`](./database-optimization.md)、[`DB-overview.md`](./DB-overview.md)

## 現状（互換期間）

| 項目 | 状態 |
|------|------|
| 正（Source of truth） | まだ **`runs.player_ids` / `runs.characters` 配列** |
| Junction | `run_players` / `run_characters` は配列更新時に同期されるターゲット |
| Worker 書込み | 配列更新＋ Service Role（junction トリガー用） |
| Worker 読取 `/api/runs` | 配列を `RUN_LIST_SELECT` で取得し、名称を Worker 側で解決 |

つまり **読取も書込も配列依存が残っている**。junction を正にする前に、読取を junction / 軽量ビューへ寄せる必要がある。

## 配列依存が残る主な箇所

| 場所 | 依存 |
|------|------|
| `worker/index.js` `RUN_LIST_SELECT` | `player_ids`, `characters` |
| `worker/index.js` runs フィルタ | `player_ids.cs`, `characters.cs` |
| Cron / Discord 通知 | `run.player_ids` |
| Web `js/session_detail.js` 等 | 配列ベースの編集 UI |
| Flutter `fetchRuns` | Worker が返す配列付き JSON |

## 次フェーズ準備（推奨順）

1. **データ掃除**: [`sql/data-cleanup-2026-07.sql.md`](./sql/data-cleanup-2026-07.sql.md) を適用 → **完了**（2026-07-21）  
2. **検証 SQL 再実行**: `database-optimization.md` のベースライン／Phase 検証を記録  
3. **読取切替設計**: `/api/runs` を `run_players` / `run_characters`（順序列あり）から組み立て、レスポンス形は現行互換（`player_ids` / `characters` 配列を組み立て直して返す）に保つ  
4. **書込みは配列のまま**維持し、読取だけ junction 優先になったことを確認  
5. **正の逆転**: 書込みを junction 更新 → 配列を生成／非推奨化（別リリース）  
6. レガシー重いビュー削除はクライアントが使わなくなってから（[`legacy-api-retirement.md`](./legacy-api-retirement.md)）

## ブロッカー

- Phase C（RLS 締め）はステージング煙テスト後のみ（`database-optimization.md` / `security-checklist.md`）
- エージェントは SQL を DB に直接実行しない。Dashboard 手動実行
