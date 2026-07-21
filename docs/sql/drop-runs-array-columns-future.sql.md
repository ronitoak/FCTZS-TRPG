# runs 配列列 DROP（将来・手動・慎重）

最終更新: 2026-07-21  
**適用**: **未実施（推奨しない・別リリース）**

前提がすべて揃うまで実行しないでください。

- Worker は既に `player_ids` / `characters` 列へ書かない  
- 読取・権限・Cron は junction のみ  
- API 応答の `player_ids` / `characters` キーは Worker が junction から組み立てる（列 DROP しても応答形は維持可能）  
- Dashboard / 手作業 SQL で配列列を参照していないこと  
- `RUN_LIST_SELECT` から列を外し、junction 失敗時の配列フォールバックも廃止済みであること  

エージェントは実行しません。

## 適用前確認

```sql
-- 列がまだ存在するか
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'runs'
  AND column_name IN ('player_ids', 'characters');
```

```sql
-- junction 行数（参考）
SELECT
  (SELECT count(*) FROM public.run_players) AS run_players,
  (SELECT count(*) FROM public.run_characters) AS run_characters;
```

## DROP（準備が揃ってから・各文個別）

```sql
ALTER TABLE public.runs DROP COLUMN IF EXISTS player_ids;
```

```sql
ALTER TABLE public.runs DROP COLUMN IF EXISTS characters;
```

## 適用後に必要なコード追従

1. `worker/index.js` の `RUN_LIST_SELECT` から `player_ids,characters` を削除  
2. `hydrateRunsMembershipFromJunctions` の「junction 失敗時は配列列を残す」分岐を削除  
3. 契約テストを更新  

ロールバックは列再追加＋junction からの backfill が必要（高コスト）。急がない。
