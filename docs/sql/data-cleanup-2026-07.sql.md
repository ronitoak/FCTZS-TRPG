# データ掃除 SQL（手動実行用）

最終更新: 2026-07-21  
Supabase Dashboard の SQL Editor で実行する。アプリから直接実行しない。

手順正本の全体像: [`database-optimization.md`](./database-optimization.md)

---

## A. `runs.characters` の空文字リンク掃除

ベースラインでは invalid / 重複の主因が空文字だった。

### 確認

```sql
SELECT r.id AS run_id, u.ord, u.value
FROM public.runs AS r
CROSS JOIN LATERAL unnest(coalesce(r.characters, ARRAY[]::text[]))
  WITH ORDINALITY AS u(value, ord)
WHERE btrim(u.value) = ''
ORDER BY r.id, u.ord;
```

### 掃除（空文字を除いた配列へ書き換え）

```sql
BEGIN;

UPDATE public.runs AS r
SET characters = sub.cleaned
FROM (
  SELECT
    id,
    coalesce(
      (
        SELECT array_agg(btrim(v) ORDER BY ord)
        FROM unnest(coalesce(characters, ARRAY[]::text[])) WITH ORDINALITY AS t(v, ord)
        WHERE btrim(v) <> ''
      ),
      ARRAY[]::text[]
    ) AS cleaned
  FROM public.runs
) AS sub
WHERE r.id = sub.id
  AND r.characters IS DISTINCT FROM sub.cleaned;

-- junction 同期トリガーが動く想定。件数を確認してから COMMIT。
COMMIT;
```

掃除後、再度確認 SQL で 0 件であること。

---

## B. `character_scenarios` 不足1件の補完

ドキュメント上の不足: `character_id='c-103'` / `scenario_id='s-021'`

### 確認

```sql
SELECT *
FROM public.character_scenarios
WHERE character_id = 'c-103' AND scenario_id = 's-021';

-- 存在確認
SELECT id FROM public.characters WHERE id = 'c-103';
SELECT id FROM public.scenarios WHERE id = 's-021';
```

### 挿入（未存在のときだけ）

```sql
INSERT INTO public.character_scenarios (character_id, scenario_id)
SELECT 'c-103', 's-021'
WHERE EXISTS (SELECT 1 FROM public.characters WHERE id = 'c-103')
  AND EXISTS (SELECT 1 FROM public.scenarios WHERE id = 's-021')
  AND NOT EXISTS (
    SELECT 1 FROM public.character_scenarios
    WHERE character_id = 'c-103' AND scenario_id = 's-021'
  );
```

---

## C. 適用後チェックリスト

- [x] A の空文字確認が 0 件（2026-07-21 運用者適用）
- [x] B の行が存在する（2026-07-21 運用者適用）
- [x] 画像監査は [`image-url-audit.md`](../image-url-audit.md) 実施。404 の NULL 化は [`image-url-nullify-404-2026-07.sql.md`](./image-url-nullify-404-2026-07.sql.md)（適用待ち）
- [x] junction 読取の進捗は [`junction-read-progress.md`](../junction-read-progress.md) を更新
