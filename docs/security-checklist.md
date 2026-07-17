# セキュリティ確認チェックリスト

最終更新: 2026-07-17  
コード側の境界（JWT実検証・所有者フィールド上書き・予定同期のWorker化・R2制限）とあわせて、Dashboard で DB 実効を確認する。

## 1. 寛容ポリシーが残っていないこと

```sql
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    policyname ILIKE '%anon%access%'
    OR policyname ILIKE '%dev_%'
    OR policyname NOT LIKE 'fctzs_%'
  )
ORDER BY tablename, policyname;
```

期待: 業務テーブルは `fctzs_*` 以外が残っていない（意図的な例外があれば記録する）。

## 2. RLS 有効と GRANT

```sql
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'players', 'player_profiles', 'player_availability',
    'characters', 'character_attributes', 'character_skills', 'character_scenarios',
    'scenarios', 'runs', 'run_players', 'run_characters', 'sessions',
    'recruitments', 'recruitment_applicants', 'comments', 'posts'
  )
ORDER BY c.relname;

SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
ORDER BY table_name, grantee, privilege_type;
```

## 3. 4経路スモーク（手動）

Worker 経由でも、最終防衛線は Supabase RLS です。各経路で同じ対象行を試し、結果を記録する。

| 経路 | 確認内容 | 合格条件 |
|------|----------|----------|
| anon（Bearerなし / anon keyのみ） | `GET /api/players` 等のSELECT、`POST /api/comments` 等の書込み | SELECTは可、書込みは Worker 401 または PostgREST 拒否 |
| 本人JWT | 自分の `characters` / `player_profiles` / `player_availability` を PATCH | 成功する |
| 他人JWT | 他人の `characters?id=eq.<victim>` を PATCH / DELETE | 0件更新または 401/403 |
| Service Role | Discord Interaction・Cron・`/api/player_availability/session_block` | 内部処理のみ成功。通常ブラウザ経路からは呼べないこと |

### 3.1 本人 / 他人 PATCH の例（Dashboard または curl）

```bash
# 本人: 自分のキャラだけ更新できること
curl -X PATCH "$SUPABASE_URL/rest/v1/characters?id=eq.<own_character_id>" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $OWN_USER_JWT" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"memo":"self-ok"}'

# 他人: 更新件数が0、またはエラーになること
curl -X PATCH "$SUPABASE_URL/rest/v1/characters?id=eq.<victim_character_id>" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $OTHER_USER_JWT" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"memo":"should-fail"}'
```

### 3.2 Worker 経路の確認

```bash
# Bearerなし書込み → 401
curl -X POST "$WORKER_URL/api/comments" \
  -H "Content-Type: application/json" \
  -d '{"target_type":"post","target_id":"1","author":"x","body":"x"}'

# 壊れたBearer → 401（形だけでなくAuth API検証）
curl -X POST "$WORKER_URL/api/comments" \
  -H "Authorization: Bearer not-a-real-jwt" \
  -H "Content-Type: application/json" \
  -d '{"target_type":"post","target_id":"1","author":"x","body":"x"}'
```

## 4. Worker 環境変数

| 変数 | 用途 |
|------|------|
| `SUPABASE_ANON_KEY` | 利用者経路 |
| `SUPABASE_SERVICE_ROLE_KEY` | Discord / Cron / session_block のみ |
| `DISCORD_WEBHOOK_URL` | 本番通知 |
| `DISCORD_TEST_WEBHOOK_URL` | テスト通知 |
| `DISCORD_USE_TEST_WEBHOOK` | `true` / `1` のときテストWebhookを使用 |

## 5. 削除済み（nightreign）

- ソース側: Worker `/api/nightreign/*`、ルートの `nightreign.html`、仕様・DB概要の参照は削除済み。
- `public/` 配下の旧成果物（例: `public/nightreign.html`）はビルド管理領域のため、公開物から手動削除する。
- DB にテーブルが残っていてもアプリは参照しない。不要なら Dashboard で DROP してよい。

```sql
-- 残存確認（存在しなければ空）
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'nightreign%'
ORDER BY tablename;
```

## 6. コード側で完了済みの境界（参照）

| 項目 | 状態 |
|------|------|
| 全 POST/PATCH/DELETE の JWT 実検証 | `worker/index.js` `validateUserBearer` |
| 予定一日占有の Worker 化 | `POST /api/player_availability/session_block` |
| 所有者フィールドのサーバー解決 | 募集 / 応募 / 予定 / プロフィール / キャラ作成 |
| R2 MIME・拡張子・5MB・type 制限 | `/api/upload` |
| Discord テストWebhook切替 | `DISCORD_USE_TEST_WEBHOOK` + `DISCORD_TEST_WEBHOOK_URL` |
| legacy `worker/worker.js` | 非デプロイスタブ（`wrangler.toml` は `index.js`） |
