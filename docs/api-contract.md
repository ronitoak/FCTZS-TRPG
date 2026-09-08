# Worker API 契約（Web / Flutter 共通正本）

最終更新: 2026-08-30  
実装: [`worker/index.js`](../worker/index.js)  
静的契約テスト: [`tests/contracts.test.cjs`](../tests/contracts.test.cjs)

## 基本

| 項目 | 内容 |
|------|------|
| Base URL | `https://fctzs-trpg.daruji.workers.dev`（`FCTZS_API_BASE` で変更可） |
| 形式 | JSON |
| CORS | `Access-Control-Allow-Origin: *`。許可ヘッダに `Authorization` / `Content-Type` / `X-Discord-Provider-Token` |
| GET | 認証任意（付けると利用者 JWT が PostgREST へ転送される）。`GET /api/me` は例外で Bearer 必須 |
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
| 4 | GET | `/api/runs` | 卓一覧。membership は `run_players` / `run_characters` のみ。POST/PATCH も junction 洗替のみ（配列列非更新）。応答の `player_ids`/`characters` は junction 組み立て |
| 5 | GET | `/api/sessions` | 開催予定（列限定） |
| 6 | GET | `/api/characters` | キャラ一覧（列限定） |
| 7 | GET | `/api/comments/recent/with_names` | 最近コメント。失敗時は `/api/comments/recent` |

クエリは PostgREST 風（`id=eq...`, `order=...`）を Worker が中継する画面がある。新規クライアントは **パス＋必要最小限の query** に留める。

---

## 書込み（Web 安定後に1機能だけ移植）

| Method | Path | 注意 |
|--------|------|------|
| POST | `/api/comments` | author はサーバー側で上書きしうる |
| POST | `/api/recruitments` | `owner_player_id` はサーバー解決。`min_count` / `target_count` / `deadline` / `selection_mode`（`first_come`\|`lottery`）必須系 |
| POST | `/api/recruitments/draw` | 募集主のみ。抽選募集の抽選実行（`{ recruitment_id }`） |
| POST | `/api/recruitment_applicants` | `player_id` はサーバー解決。先着は満員・期限切れで 409 |
| POST | `/api/player_availability` | 自分の `player_id` のみ |
| POST | `/api/player_availability/session_block` | 卓メンバー検証後に参加者予定を NG |
| POST | `/api/upload` | multipart。画像 MIME / 5MB / type 制限。任意の `replace_url`（自バケットの旧公開URL）があれば put 成功後に旧オブジェクトを削除（`_default/` は除外）。応答 `{ url, replaced }` |
| PATCH | `/api/player_profiles/external_passed` | 認証不要。対象プレイヤーの部活外通過履歴を追加・削除する共同編集用 |
| GET | `/api/scenario_interests?scenario_id=` | `{ interested, count }`。interested はログイン本人のみ |
| POST | `/api/scenario_interests` | `{ scenario_id }`。新規ON時のみ GM可能者へ Discord DM |
| DELETE | `/api/scenario_interests?scenario_id=` | 本人の気になる解除（通知なし） |
| GET | `/api/me` | ログイン本人の連携状態（下記「プレイヤー自己連携」） |
| POST | `/api/me/link` | 名簿の自分の行へ自己連携（下記） |

本人解決は次の順で行う（Auth UUID と Discord snowflake を直接比較しない）:

1. `players.user_id = auth.users.id`（Auth UUID）
2. 未連携なら `players.discord_id = Discord snowflake` で検索し、見つかれば `user_id` を自動連携

どちらでも解決できない JWT は、所有者必須の API で 403 になる。

---

## プレイヤー自己連携

ホームの未連携バナーなど、ログイン後に名簿へ紐づけるための正本 API。  
Web 実装: [`js/home.js`](../js/home.js) の `resolvePlayerLinkBanner`。

### Discord ID の解決順（Worker）

`resolveDiscordIdForRequest` は次の順で Discord snowflake を求める:

1. Auth ユーザーメタデータ（`user_metadata` / identities）
2. Bearer JWT ペイロード内のメタデータ
3. Supabase Auth Admin API（Service Role）
4. リクエストの `X-Discord-Provider-Token` ヘッダ、または `POST /api/me/link` ボディの `provider_token` で Discord `GET /users/@me`

フロントは OAuth 直後の `session.provider_token` をヘッダ／ボディに渡せる。

### `GET /api/me`

| 項目 | 内容 |
|------|------|
| 認証 | Bearer JWT **必須**（未ログインは 401） |
| 任意ヘッダ | `X-Discord-Provider-Token`（Discord ID 補完用） |

成功レスポンス（200）の例:

```json
{
  "linked": false,
  "player": null,
  "discord_id": "123456789012345678",
  "auth_user_id": "<auth.users.id>",
  "claimable_players": [
    { "player_id": "...", "player_name": "...", "discord_id": "", "user_id": null }
  ]
}
```

- `linked: true` のとき `player` は名簿行、`claimable_players` は空配列
- `linked: false` のとき `claimable_players` は `user_id` 未設定の名簿（Discord 一致行を先頭）
- サーバー側で Discord 一致が見つかれば `resolveCallerPlayerId` により自動で `user_id` 連携しうる

### `POST /api/me/link`

| 項目 | 内容 |
|------|------|
| 認証 | Bearer JWT **必須** |
| ボディ | `{ "player_id": "<必須>", "provider_token": "<任意>" }` |
| 任意ヘッダ | `X-Discord-Provider-Token`（ボディの token と同等） |

成功（200）: `{ "linked": true, "player": { ... } }`

主なエラー:

| HTTP | 条件 |
|------|------|
| 400 | JSON 不正 / `player_id` 欠落 / Discord ID 取得失敗 |
| 401 | 未認証 |
| 403 | 対象行が別 Auth / 別 Discord に既に紐づいている |
| 404 | 対象 `player_id` が存在しない |
| 409 | 自分が別プレイヤーへ既連携、または自分の Discord が別行に登録済み |

---

## 作成通知（管理者向け Discord）

主要リソースの **POST（新規作成）成功時**に、管理者へ Discord 通知する（応答本体は従来どおり。通知は `waitUntil` で非同期）。

| 対象 | 経路 |
|------|------|
| キャラクター | `POST /api/character_full` |
| シナリオ | `POST /api/scenarios` |
| 卓 | `POST /api/runs` |
| セッション | `POST /api/sessions` |
| 募集 | `POST /api/recruitments` |
| なりきりチャット | `POST /api/posts` |
| 感想 | `POST /api/impressions` |

メッセージ内容: 種別・名前（タイトル）・追加者（プレイヤー名と ID）・詳細 URL（ある場合）。

### 感想（impressions）

| Method | Path | 認証 | 内容 |
|--------|------|------|------|
| GET | `/api/impressions?run_id=` | Bearer + 名簿連携 | 卓の感想。参加者は全件、非参加者は自分の投稿のみ |
| GET | `/api/impressions?scenario_id=` | Bearer + 名簿連携 | 参加卓＋自分の投稿＋卓なし分（閲覧可なら）。`runs` メタ付き |
| GET | `/api/impressions/feed` | Bearer + 名簿連携 | 一覧用フィード。任意で `scenario_id` / `author_player_id` / `limit`（最大100） |
| POST | `/api/impressions` | Bearer + 名簿連携 | `{ run_id?, scenario_id?, body, is_spoiler? }`。卓ありは `run_id`、卓なし（部活外等）は `scenario_id` のみ。既定 `is_spoiler=true`。作成通知あり |

閲覧判定は Worker の `hasPassedScenario`（部内: いずれかの卓の GM/PL、所有キャラの `character_scenarios`、部活外: `external_passed_scenarios` の `linked_scenario_id`/`scenario_id` またはタイトル一致）。投稿者本人は常に自分の投稿を閲覧可。画面: `impressions/index.html`。SQL: [`sql/impressions.sql`](./sql/impressions.sql)。

環境変数:

| キー | 内容 |
|------|------|
| `CREATE_NOTIFY_PLAYER_ID` | 通知先 players.player_id（省略時 `p-001`） |
| `CREATE_NOTIFY_ENABLED` | `"false"` / `"0"` で無効化 |
| `DISCORD_USE_TEST_WEBHOOK` | `"true"` のとき実 DM せず `DISCORD_TEST_WEBHOOK_URL` へプレビュー |
| `DISCORD_BOT_TOKEN` | 本番 DM に必要（宛先の `discord_id` は名簿から取得） |

---

## 互換のために残すレガシー入口

`/api/character_skill_list`（Web キャラ詳細）、`/api/character_full`（作成）など。  
`/api/scenario_list`・`/api/session_list`・`/api/character_details` は **410 Gone**。  
一覧ビュー DROP: [`sql/drop-legacy-list-views-2026-07.sql.md`](./sql/drop-legacy-list-views-2026-07.sql.md)。  
キャラ詳細ビュー DROP: [`sql/drop-character-detail-views-2026-07.sql.md`](./sql/drop-character-detail-views-2026-07.sql.md)。

---

## レスポンス方針（Flutter 移行配慮）

- 成功: JSON 配列またはオブジェクト（画面ごとに既存形を維持）
- 失敗: HTTP ステータス + `{ "error": "..." }` または PostgREST 原文
- 一覧は列限定。詳細は `id` 指定時に広い select を許す経路がある
