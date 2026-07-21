# 配列→junction 互換トリガー無効化（手動）

最終更新: 2026-07-21  
**適用**: 完了（2026-07-21・ユーザー Dashboard 実行）

前提:

1. API Worker `fctzs-trpg` が **junction 明示洗替**をデプロイ済みであること（配列ミラーは不要）  
2. Cron / `canEditRun` / `session_block` も junction 優先であること（同 Worker）  
3. 通常の卓作成・更新はすべて Worker 経由であること（Dashboard 直書きで配列だけ更新しない）

エージェントは実行しません。Supabase Dashboard → SQL Editor で実施してください。

背景: [`junction-read-progress.md`](../junction-read-progress.md)、[`database-optimization.md`](../database-optimization.md) A-3

## 何をするか

- `trg_runs_sync_arrays_to_junctions` を **DROP** する  
- Worker が既に `run_players` / `run_characters` を洗替しているため、配列変更監視トリガーは冗長  
- 配列列（`runs.player_ids` / `characters`）は互換ミラーとして **残す**（列削除はしない）

## 適用前確認

```sql
-- トリガーが存在するか
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'runs'
  AND trigger_name = 'trg_runs_sync_arrays_to_junctions';
```

```sql
-- 配列と junction の不一致が無いこと（どちらも 0 行が理想）
SELECT r.id AS run_id, 'player_missing_in_junction' AS issue
FROM public.runs AS r
CROSS JOIN LATERAL unnest(coalesce(r.player_ids, ARRAY[]::text[])) AS u(player_id)
LEFT JOIN public.run_players AS rp
  ON rp.run_id = r.id AND rp.player_id = btrim(u.player_id)
WHERE btrim(u.player_id) <> '' AND rp.player_id IS NULL
UNION ALL
SELECT rp.run_id, 'player_extra_in_junction'
FROM public.run_players AS rp
LEFT JOIN public.runs AS r ON r.id = rp.run_id
WHERE r.id IS NULL
   OR NOT (coalesce(r.player_ids, ARRAY[]::text[]) @> ARRAY[rp.player_id]);
```

不一致がある場合は、先に dual-write デプロイ後に卓を再保存するか、[`data-cleanup-2026-07.sql.md`](./data-cleanup-2026-07.sql.md) / `database-optimization.md` の backfill を確認してから進めてください。

## DROP（各文を個別実行）

```sql
DROP TRIGGER IF EXISTS trg_runs_sync_arrays_to_junctions ON public.runs;
```

```sql
-- 関数も不要なら削除（他から参照していない前提）
DROP FUNCTION IF EXISTS public.sync_run_arrays_to_junctions();
```

## 適用後確認

```sql
-- 0 行になること
SELECT trigger_name
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND trigger_name = 'trg_runs_sync_arrays_to_junctions';
```

手作業スモーク:

1. Web から卓を新規作成し、参加者・参加キャラが一覧に出ること  
2. 卓を編集して参加者を増減し、再読込後も一致すること  
3. セッション通知 Cron・卓 PATCH 権限が従来どおり動くこと  

## ロールバック

`database-optimization.md` の **A-3** にある `CREATE OR REPLACE FUNCTION` / `CREATE TRIGGER` を再実行すれば復元できます。

## やらないこと（この SQL）

- `runs.player_ids` / `characters` 列の削除  
- junction→配列の逆転トリガー追加（配列書込みは Worker 側で停止済み。列 DROP は別リリース）
- Phase C（RLS 締め）
