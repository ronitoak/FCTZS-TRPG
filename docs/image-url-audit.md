# 画像 URL 監査手順

最終更新: 2026-07-21（API 経由の HTTP 監査を実施）  
壊れた `image_url` を減らし、クライアントの `onerror` フォールバックに頼らない状態を目指す。

## 0. 直近の監査結果（2026-07-21）

| 区分 | URL あり | OK | 404 |
|------|----------|----|-----|
| characters | 142 | 120 | 22 |
| scenarios | 53 | 50 | 3 |
| runs | 0 | — | — |

- レポート JSON: [`image-url-audit-report.json`](./image-url-audit-report.json)
- NULL 化 SQL: [`sql/image-url-nullify-404-2026-07.sql.md`](./sql/image-url-nullify-404-2026-07.sql.md)（**適用済 2026-07-21**）

---

## 1. DB 上の候補抽出（Supabase SQL Editor）

```sql
-- キャラ: 絶対URLが設定されている行
SELECT id, name, image_url
FROM public.characters
WHERE image_url IS NOT NULL
  AND btrim(image_url) <> ''
  AND image_url ~* '^https?://'
ORDER BY id;

-- シナリオ: 同様
SELECT id, title, image_url
FROM public.scenarios
WHERE image_url IS NOT NULL
  AND btrim(image_url) <> ''
  AND image_url ~* '^https?://'
ORDER BY id;

-- 卓カバー
SELECT id, title, image_url
FROM public.runs
WHERE image_url IS NOT NULL
  AND btrim(image_url) <> ''
  AND image_url ~* '^https?://'
ORDER BY id;
```

## 2. HTTP 確認（ローカル）

抽出した URL を CSV にし、HEAD/GET で 404 を洗い出す。例（PowerShell）:

```powershell
# urls.txt に1行1URL
Get-Content urls.txt | ForEach-Object {
  try {
    $r = Invoke-WebRequest -Method Head -Uri $_ -MaximumRedirection 0 -TimeoutSec 15
    "{0}`t{1}" -f $r.StatusCode, $_
  } catch {
    "ERR`t$_"
  }
}
```

R2 公開ベース: `https://pub-b7f067c04745438680b7ed7adebbba6b.r2.dev`  
CORS: [`r2-cors.json`](./r2-cors.json)

## 3. 修正方針

| 結果 | 対応 |
|------|------|
| 404 / 接続失敗 | `image_url` を `NULL` にするか、正しい R2 パスへ更新 |
| 相対パス・キャラIDのみ | Flutter/Web はデフォルト画像へフォールバック（正は R2 絶対URL） |
| 卓 `image_url` 空 | シナリオ画像 → デフォルト（Web/Flutter 共通） |

```sql
-- 例: 壊れたURLをNULL化（IDを確認してから実行）
-- UPDATE public.characters SET image_url = NULL WHERE id = 'c-XXX';
-- UPDATE public.scenarios SET image_url = NULL WHERE id = 's-XXX';
```

## 4. 既知のヒューリスティック（クライアント）

`js/utils.js` / Flutter `FctzsImages`:

- キャラ数値 ID > 137 かつ DB URL なし → デフォルト  
- シナリオ数値 ID > 48 かつ DB URL なし → デフォルト  

監査で 404 が減れば、これらの特例も段階的に見直せる。
