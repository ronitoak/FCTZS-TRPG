# Web: レガシー一覧APIの軽量化

## 状態（2026-07-21）

**完了。** 本計画の当初スコープ（一覧寄せ）と後続の junction / character_details 退役までコード側は一通り終わった。

| 項目 | 結果 |
|------|------|
| scenario_list → scenario_summary | 完了（410 + view DROP） |
| session_list → sessions | 完了（410 + view DROP） |
| junction 正規化 | 完了（読取・書込・トリガー無効化・ミラー停止） |
| character_details | 410 + Flutter 分割 GET。view DROP は手動 SQL |
| 404 画像 NULL 化 | 適用済 |

残手動: デプロイ、`v_character_details` DROP（任意）、配列列 DROP（将来）、Phase C（ブロッカー）。

詳細: [`docs/junction-read-progress.md`](../docs/junction-read-progress.md)、[`docs/legacy-api-retirement.md`](../docs/legacy-api-retirement.md)
