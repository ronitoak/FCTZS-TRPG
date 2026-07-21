# runs 配列列 DROP（手動）

最終更新: 2026-07-21  
**適用**: 完了（2026-07-21・ユーザー Dashboard 実行）

前提（コード側は準備済み）:

1. Worker が配列列へ書かない  
2. `RUN_LIST_SELECT` が `player_ids` / `characters` を select しない  
3. hydrate が常に junction から応答キーを組み立てる  
4. 読取・権限・Cron は junction のみ  

エージェントは実行しません。API 応答の `player_ids` / `characters` キーは Worker が組み立てるため、**画面の使用感は変わりません**。

## 適用前確認

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'runs'
  AND column_name IN ('player_ids', 'characters');
```

```sql
SELECT
  (SELECT count(*) FROM public.run_players) AS run_players,
  (SELECT count(*) FROM public.run_characters) AS run_characters;
```

## DROP（各文を個別実行）

```sql
ALTER TABLE public.runs DROP COLUMN IF EXISTS player_ids;
```

```sql
ALTER TABLE public.runs DROP COLUMN IF EXISTS characters;
```

## 適用後確認

```sql
-- 0 行
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'runs'
  AND column_name IN ('player_ids', 'characters');
```

卓一覧・詳細で参加者／参加キャラが表示されること。
ｚ
ロールバックは列再追加＋junction からの backfill が必要（高コスト）。
