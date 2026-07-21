# セキュリティ煙テスト記録

四半期ごと（または大きな RLS / Worker 変更の直後）に実施し、結果を本ファイル末尾へ追記する。  
手順の本体: [`security-checklist.md`](./security-checklist.md)

## 実施記録

### 2026-07-21（実施完了）

| 項目 | 結果 | メモ |
|------|------|------|
| 日付 | 2026-07-21 | 運用者確認済み |
| 実施者 | 運用者 | `security-checklist.md` §1–3 / §5 相当 |
| anon GET `/api/players` | OK | |
| anon POST `/api/comments` | OK | 書込み拒否を確認 |
| 壊れた Bearer POST | OK | 401 を確認 |
| 本人 JWT PATCH | OK | |
| 他人 JWT PATCH | OK | |
| Discord テストWebhook | OK | |
| RLS ポリシー SQL §1 | OK | |
| nightreign 残存 SQL §5 | OK | |

**次回**: 次回四半期、または RLS / Worker の大きな変更直後。

---

### （次回）YYYY-MM-DD

| 項目 | 結果 | メモ |
|------|------|------|
| 日付 | | |
| 実施者 | | |
| … | | |
