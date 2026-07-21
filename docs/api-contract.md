# Worker API 契約（Web / Flutter 共通正本）

最終更新: 2026-07-21  
実装: [`worker/index.js`](../worker/index.js)  
静的契約テスト: [`tests/contracts.test.cjs`](../tests/contracts.test.cjs)

## 基本

| 項目 | 内容 |
|------|------|
| Base URL | `https://fctzs-trpg.daruji.workers.dev`（`FCTZS_API_BASE` で変更可） |
| 形式 | JSON |
| CORS | `Access-Control-Allow-Origin: *` |
| GET | 認証任意（付けると利用者 JWT が PostgREST へ転送される） |
| POST / PATCH / DELETE | 原則として**有効な Bearer JWT 必須**（Auth API で実検証） |
| Discord Interaction | `/api/interactions` のみ Ed25519。Bearer 不要 |

所有権の最終防衛線は Supabase RLS。Worker は募集・応募・予定などで `player_id` を JWT から上書きする。

例外として `PATCH /api/player_profiles/external_passed` は部活外通過履歴の共同編集専用で、Bearer JWT不要。`player_id` と最大100件の `external_passed_scenarios` だけを受け付け、ほかのプロフィール列は変更できない。

関連: [`DB-overview.md`](./DB-overview.md) / [`security-checklist.md`](./security-checklist.md)

---

## Flutter / 新規クライアントが最初に使う GET

読み取り専用の並列アプリはこの順で実装する。

| 順 | Method | Path | 用途 |
|----|--------|------|------|
| 1 | GET | `/api/players` | プレイヤー名簿 |
| 2 | GET | `/api/scenario_summary` | シナリオ一覧（軽量）。正パス |
| 3 | GET | `/api/recruitment_list` | 募集カード。失敗時は `/api/recruitments` |
| 4 | GET | `/api/runs` | 卓一覧。membership は `run_players` / `run_characters` 優先で組み立て、応答は従来どおり `player_ids` / `characters` / `gm_name` / `player_names` |
| 5 | GET | `/api/sessions` | 開催予定（列限定） |
| 6 | GET | `/api/characters` | キャラ一覧（列限定） |
| 7 | GET | `/api/comments/recent/with_names` | 最近コメント。失敗時は `/api/comments/recent` |

クエリは PostgREST 風（`id=eq...`, `order=...`）を Worker が中継する画面がある。新規クライアントは **パス＋必要最小限の query** に留める。

---

## 書込み（Web 安定後に1機能だけ移植）

| Method | Path | 注意 |
|--------|------|------|
| POST | `/api/comments` | author はサーバー側で上書きしうる |
| POST | `/api/recruitments` | `owner_player_id` はサーバー解決 |
| POST | `/api/recruitment_applicants` | `player_id` はサーバー解決 |
| POST | `/api/player_availability` | 自分の `player_id` のみ |
| POST | `/api/player_availability/session_block` | 卓メンバー検証後に参加者予定を NG |
| POST | `/api/upload` | multipart。画像 MIME / 5MB / type 制限。任意の `replace_url`（自バケットの旧公開URL）があれば put 成功後に旧オブジェクトを削除（`_default/` は除外）。応答 `{ url, replaced }` |
| PATCH | `/api/player_profiles/external_passed` | 認証不要。対象プレイヤーの部活外通過履歴を追加・削除する共同編集用 |
| GET | `/api/scenario_interests?scenario_id=` | `{ interested, count }`。interested はログイン本人のみ |
| POST | `/api/scenario_interests` | `{ scenario_id }`。新規ON時のみ GM可能者へ Discord DM |
| DELETE | `/api/scenario_interests?scenario_id=` | 本人の気になる解除（通知なし） |

本人解決は次の順で行う（Auth UUID と Discord snowflake を直接比較しない）:

1. `players.user_id = auth.users.id`（Auth UUID）
2. 未連携なら `players.discord_id = Discord snowflake` で検索し、見つかれば `user_id` を自動連携

どちらでも解決できない JWT は、所有者必須の API で 403 になる。

---

## 互換のために残すレガシー入口

`/api/character_details`, `/api/character_skill_list` など。  
`/api/scenario_list` と `/api/session_list` は **410 Gone**（代替: `scenario_summary` / `sessions`）。DB ビュー DROP は [`sql/drop-legacy-list-views-2026-07.sql.md`](./sql/drop-legacy-list-views-2026-07.sql.md)。

---

## レスポンス方針（Flutter 移行配慮）

- 成功: JSON 配列またはオブジェクト（画面ごとに既存形を維持）
- 失敗: HTTP ステータス + `{ "error": "..." }` または PostgREST 原文
- 一覧は列限定。詳細は `id` 指定時に広い select を許す経路がある
