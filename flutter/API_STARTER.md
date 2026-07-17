# Flutter が最初に叩く GET API

Base: `https://fctzs-trpg.daruji.workers.dev`

| API | 備考 |
|-----|------|
| `GET /api/players` | 名簿 |
| `GET /api/scenario_summary` | 一覧用。失敗時 `GET /api/scenarios` |
| `GET /api/recruitment_list` | 募集。失敗時 `GET /api/recruitments` |
| `GET /api/runs` | 卓（`gm_name`, `player_names` 付き） |
| `GET /api/sessions` | 開催 |
| `GET /api/characters` | キャラ一覧 |

認証ヘッダは GET では任意。書込みは別マイルストーン。

正本の詳細は [`docs/api-contract.md`](../docs/api-contract.md)。
