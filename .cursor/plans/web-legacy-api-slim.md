# Web: レガシー一覧APIの軽量化

## 状態（2026-07-21）

**完了。** 一覧寄せ・junction・character_details 退役・画像 NULL 化まで終わった。

| 項目 | 結果 |
|------|------|
| scenario_list → scenario_summary | 完了（410 + view DROP） |
| session_list → sessions | 完了（410 + view DROP） |
| junction 正規化 | 完了 |
| character_details | 410 + Flutter 分割 GET + view DROP **適用済** |
| 404 画像 NULL 化 | 適用済 |

**次の本線は Flutter ではなく** DB / Worker / Web の残り（配列列 DROP・Phase C）。Flutter 追加パリティはそれが終わってから（[`platform-roadmap.md`](../docs/platform-roadmap.md)）。

詳細: [`docs/junction-read-progress.md`](../docs/junction-read-progress.md)、[`docs/legacy-api-retirement.md`](../docs/legacy-api-retirement.md)
