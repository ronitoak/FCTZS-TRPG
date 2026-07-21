# 画像 URL 監査結果と NULL 化 SQL

実施日: 2026-07-21  
手順: [`image-url-audit.md`](../image-url-audit.md)  
詳細 JSON: [`image-url-audit-report.json`](../image-url-audit-report.json)

## サマリー

| 区分 | http(s) URL 件数 | 200 | 404 |
|------|------------------|-----|-----|
| characters | 142 | 120 | 22 |
| scenarios | 53 | 50 | 3 |
| runs | 0 | — | — |

壊れた URL はすべて R2 公開バケット上の不在オブジェクト。  
対処: `image_url` を `NULL` にし、クライアントのデフォルト画像へフォールバックさせる。

## 404 一覧

### characters（22）

`c-013`, `c-014`, `c-015`, `c-033`, `c-035`, `c-036`, `c-049`, `c-062`, `c-069`, `c-071`, `c-075`, `c-078`, `c-085`, `c-099`, `c-107`, `c-108`, `c-110`, `c-118`, `c-122`, `c-127`, `c-136`, `c-138`

特記: `c-099` は UUID ファイル名の webp パスが 404。

### scenarios（3）

`s-027`, `s-045`, `s-047`

---

## Supabase SQL Editor で実行

確認してから `COMMIT`。

```sql
BEGIN;

-- 事前確認（期待: 22 + 3 行）
SELECT 'character' AS kind, id, image_url
FROM public.characters
WHERE id IN (
  'c-013','c-014','c-015','c-033','c-035','c-036','c-049','c-062',
  'c-069','c-071','c-075','c-078','c-085','c-099','c-107','c-108',
  'c-110','c-118','c-122','c-127','c-136','c-138'
)
UNION ALL
SELECT 'scenario', id, image_url
FROM public.scenarios
WHERE id IN ('s-027','s-045','s-047')
ORDER BY kind, id;

UPDATE public.characters
SET image_url = NULL
WHERE id IN (
  'c-013','c-014','c-015','c-033','c-035','c-036','c-049','c-062',
  'c-069','c-071','c-075','c-078','c-085','c-099','c-107','c-108',
  'c-110','c-118','c-122','c-127','c-136','c-138'
);

UPDATE public.scenarios
SET image_url = NULL
WHERE id IN ('s-027','s-045','s-047');

-- 事後確認（期待: 0 行）
SELECT id, image_url FROM public.characters
WHERE id IN (
  'c-013','c-014','c-015','c-033','c-035','c-036','c-049','c-062',
  'c-069','c-071','c-075','c-078','c-085','c-099','c-107','c-108',
  'c-110','c-118','c-122','c-127','c-136','c-138'
)
  AND image_url IS NOT NULL
UNION ALL
SELECT id, image_url FROM public.scenarios
WHERE id IN ('s-027','s-045','s-047')
  AND image_url IS NOT NULL;

COMMIT;
```

適用後、画像を再アップロードする場合は通常のアップロード UI から R2 へ上げ直す。
