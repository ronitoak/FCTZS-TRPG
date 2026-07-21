# レガシー一覧ビュー DROP（手動・任意）

最終更新: 2026-07-21  
**適用**: 完了（2026-07-21・ユーザー Dashboard 実行）

前提: Worker が `/api/scenario_list` `/api/session_list` を **410** 返却済みで、Web/Flutter が参照していないこと。

エージェントは実行しません。Supabase Dashboard → SQL Editor で実施してください。

## 適用前確認

```sql
-- ビューが存在するか
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('scenario_list', 'session_list');
```

## DROP（各文を個別実行）

```sql
DROP VIEW IF EXISTS public.scenario_list;
```

```sql
DROP VIEW IF EXISTS public.session_list;
```

## 適用後

1. 上記確認 SQL が 0 行になること  
2. `GET /api/scenario_summary` と `GET /api/sessions` が従来どおり動くこと  
3. 旧 URL は Worker 側で 410 のまま（ビュー DROP 後も Worker 再デプロイ不要）

ロールバックが必要なら `database-optimization.md` のビュー定義から再作成する。
