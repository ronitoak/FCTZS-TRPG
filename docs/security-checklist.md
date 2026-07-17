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

| 経路 | 確認内容 |
|------|----------|
| anon | SELECTは可、INSERT/UPDATE/DELETEは拒否 |
| 本人JWT | 自分の行だけ更新可 |
| 他人JWT | 他人の行は更新・削除不可 |
| Service Role | Discord/Cron/session_block など内部処理だけが成功 |

## 4. Worker 環境変数

| 変数 | 用途 |
|------|------|
| `SUPABASE_ANON_KEY` | 利用者経路 |
| `SUPABASE_SERVICE_ROLE_KEY` | Discord / Cron / session_block のみ |
| `DISCORD_WEBHOOK_URL` | 本番通知 |
| `DISCORD_TEST_WEBHOOK_URL` | テスト通知 |
| `DISCORD_USE_TEST_WEBHOOK` | `true` / `1` のときテストWebhookを使用 |

## 5. 削除済み（nightreign）

アプリ・Worker から nightreign API は削除済み。DB にテーブルが残っていても参照しない。不要なら Dashboard で DROP してよい。
