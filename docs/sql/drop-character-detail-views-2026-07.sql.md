# 巨大キャラ詳細ビュー DROP（手動）

最終更新: 2026-07-21  
**適用**: 完了（2026-07-21・ユーザー Dashboard 実行）

前提:

1. API Worker `fctzs-trpg` が `GET /api/character_details` を **410** 返却済み  
2. Flutter / Web が分割 GET（`characters` + `character_attributes` + `character_skill_list` + `character_scenarios`）のみを使うこと  

エージェントは実行しません。Supabase Dashboard → SQL Editor で実施してください。

## 適用前確認

```sql
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('v_character_details', 'v_character_list');
```

## DROP（適用済・再実行不要）

```sql
DROP VIEW IF EXISTS public.v_character_details;
```

```sql
-- アプリ参照なし。残っていれば同様に削除可
DROP VIEW IF EXISTS public.v_character_list;
```

## 適用後

1. 上記確認 SQL が 0 行  
2. キャラ詳細（Web / Flutter）が従来どおり表示されること  
3. `GET /api/character_details` は Worker 側で 410 のまま  

ロールバックが必要なら `database-optimization.md` または過去マイグレーションからビュー定義を再作成する。
