# DB正規化・API軽量化の段階移行手順

この文書は、Supabase Dashboard の SQL Editor でユーザーが手動実行するための移行手順です。アプリケーションからDBへ直接接続して実行しないでください。

## 0. 適用原則

- 本番適用前にバックアップを取得し、各SQLブロックを**上から1ブロックずつ**実行する。
- 各トランザクションの直後に、そのPhaseの検証SQLを実行する。結果が想定外なら次へ進まない。
- `runs.player_ids` と `runs.characters` は互換期間中は保持した。DROP は [`sql/drop-runs-array-columns-future.sql.md`](./sql/drop-runs-array-columns-future.sql.md)（Worker 再デプロイ後・手動）。
- Phase Aでは配列を正、junctionを同期先とする。APIをjunction読み取りへ切り替えた後に、別変更で正を逆転させる。
- **2026-07 時点**: Worker は junction のみ洗替・読取。配列列は select しない。進捗は [`junction-read-progress.md`](./junction-read-progress.md)。
- A-3より前に、通常書込みのBearer引継ぎ、R2 uploadのAuth API検証、認証済み履歴同期を含むWorker/フロント認証版をデプロイする。
- Phase Cは、実装済みのBearer引継ぎとService Role内部処理をステージング確認するまで絶対に適用しない。
- SQL Editorでの実行者は通常 `postgres` である。RLS検証は別途、匿名キー・ログインJWT・Service Roleの各API経路でも行う。
- `CREATE OR REPLACE VIEW` は同名ビューの列名・順序・型を変えられない。既存ビューと競合した場合は、先に現定義を保存し、メンテナンス時間内で `DROP VIEW` → `CREATE VIEW` を行う。

## 1. 現状ベースライン

### 1.1 確定済みデータ

- `runs.player_ids text[]`: 63 runs、展開後189リンク、invalid 0、duplicate 0。
- `runs.characters text[]`: 53 runs、展開後158リンク。
- `runs.characters` のinvalid 12件はすべて空文字。
- `runs.characters` の重複4組もすべて空文字。正しいIDの重複は0。
- `character_scenarios` の不足は `character_id='c-103' / scenario_id='s-021'` の1件のみ。
- `sessions_without_run=0`、`runs_without_scenario=0`、`players.user_id` の重複=0。
- 主因は、参加者・参加キャラクターが配列に埋め込まれていること、画面が複数の全件APIを取得してブラウザで結合・集計していること、名称解決のために余分なレスポンスを返していること。
- 目標は、順序を保つjunction化、DB側の軽量ビューによる必要列だけの返却、認証済み書込みへの段階移行である。

### 1.2 適用前スナップショット

結果をCSV保存し、適用日時・実行者・環境名と一緒に保管する。

```sql
-- 主要テーブルの行数を一度に記録する。
SELECT 'players' AS relation_name, count(*) AS row_count FROM public.players
UNION ALL SELECT 'player_profiles', count(*) FROM public.player_profiles
UNION ALL SELECT 'characters', count(*) FROM public.characters
UNION ALL SELECT 'scenarios', count(*) FROM public.scenarios
UNION ALL SELECT 'runs', count(*) FROM public.runs
UNION ALL SELECT 'sessions', count(*) FROM public.sessions
UNION ALL SELECT 'character_scenarios', count(*) FROM public.character_scenarios
UNION ALL SELECT 'recruitments', count(*) FROM public.recruitments
UNION ALL SELECT 'recruitment_applicants', count(*) FROM public.recruitment_applicants
UNION ALL SELECT 'comments', count(*) FROM public.comments
UNION ALL SELECT 'posts', count(*) FROM public.posts
ORDER BY relation_name;

-- 配列の行数・リンク数・空文字・正規化後に重複する値を確認する。
WITH player_items AS (
  SELECT r.id AS run_id, u.value, u.ord
  FROM public.runs AS r
  CROSS JOIN LATERAL unnest(coalesce(r.player_ids, ARRAY[]::text[]))
    WITH ORDINALITY AS u(value, ord)
),
character_items AS (
  SELECT r.id AS run_id, u.value, u.ord
  FROM public.runs AS r
  CROSS JOIN LATERAL unnest(coalesce(r.characters, ARRAY[]::text[]))
    WITH ORDINALITY AS u(value, ord)
)
SELECT
  'player_ids' AS source,
  count(DISTINCT run_id) AS runs_with_items,
  count(*) AS raw_links,
  count(*) FILTER (WHERE btrim(value) = '') AS blank_links,
  count(*) FILTER (WHERE btrim(value) <> '')
    - count(DISTINCT (run_id, btrim(value)))
      FILTER (WHERE btrim(value) <> '') AS duplicate_nonblank_links
FROM player_items
UNION ALL
SELECT
  'characters',
  count(DISTINCT run_id),
  count(*),
  count(*) FILTER (WHERE btrim(value) = ''),
  count(*) FILTER (WHERE btrim(value) <> '')
    - count(DISTINCT (run_id, btrim(value)))
      FILTER (WHERE btrim(value) <> '')
FROM character_items;

-- 既存の孤児・不足を確認する。全件0、最後だけ1件が想定値。
SELECT count(*) AS sessions_without_run
FROM public.sessions AS s
LEFT JOIN public.runs AS r ON r.id = s.run_id
WHERE s.run_id IS NOT NULL AND r.id IS NULL;

SELECT count(*) AS runs_without_scenario
FROM public.runs AS r
LEFT JOIN public.scenarios AS s ON s.id = r.scenario_id
WHERE r.scenario_id IS NOT NULL AND s.id IS NULL;

SELECT user_id, count(*) AS duplicate_count
FROM public.players
WHERE user_id IS NOT NULL
GROUP BY user_id
HAVING count(*) > 1;

SELECT r.id AS run_id, r.scenario_id, c.value AS character_id
FROM public.runs AS r
CROSS JOIN LATERAL unnest(coalesce(r.characters, ARRAY[]::text[])) AS c(value)
LEFT JOIN public.character_scenarios AS cs
  ON cs.character_id = btrim(c.value)
 AND cs.scenario_id = r.scenario_id
WHERE r.status::text = 'done'
  AND btrim(c.value) <> ''
  AND r.scenario_id IS NOT NULL
  AND cs.character_id IS NULL
ORDER BY r.id, c.value;
```

### 1.3 API・レスポンス計測

同じブラウザ、同じログイン状態、キャッシュ無効で各画面を3回測り中央値を記録する。

1. Chrome DevToolsのNetworkで「Preserve log」「Disable cache」を有効化する。
2. プレイヤー詳細、募集一覧、シナリオ一覧、トップ、新規キャラクター一覧を各3回再読込する。
3. `DOMContentLoaded`、`Load`、APIリクエスト数、API転送量、最大レスポンス、各APIのTTFBを記録する。
4. Worker Analyticsで同時間帯のリクエスト数、実行時間、エラー率を記録する。
5. Phase B API切替後、同じ条件で再計測する。

curlでもサイズと時間を比較できる。`Authorization` はログインユーザーのJWTを使用し、履歴へ残さない。

```bash
curl -sS -o before.json -w "status=%{http_code} bytes=%{size_download} ttfb=%{time_starttransfer} total=%{time_total}\n" \
  -H "Authorization: Bearer $SUPABASE_USER_JWT" \
  "https://<worker-host>/api/runs"
```

目標値は、対象画面の初期API本数と転送量を減らし、p50 TTFBを悪化させず、5xxを増やさないこと。小規模DBのため、実行時間だけでなく「不要な全件レスポンス削減」を主指標にする。

### 1.4 ホーム画面のデータ取得方針

ホームは単一の巨大JSON集約ビューを作らず、列限定済みの既存一覧APIを並列取得して組み立てる。

- `scenarios` / `runs` / `sessions`: Workerの一覧用select（title・status・日付など表示列のみ）
- `players`: `player_id,player_name,user_id` のみ
- メンバーの募集: `recruitment_list?owner_player_id=...`
- 予定: `player_availability` を表示月の範囲だけで取得

次回予定・進行中卓は日付条件が画面側ロジックに依存するため、現規模（runs数十・sessions百前後）では専用ビューよりこの方式を優先する。将来行数が増えた場合は `home_guest_summary` / `home_member_dashboard` RPCを別フェーズで追加する。

## 2. Phase A: junction作成・backfill・互換同期・FK

### A-0. preflight（読取りのみ）

以下がすべて想定どおりであることを確認する。型が異なる場合は後続SQLを実行しない。

```sql
-- PostgreSQL 15以上と、対象列の実型を確認する。
SELECT current_setting('server_version_num')::integer AS server_version_num;

SELECT
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'runs' AND column_name IN ('id', 'player_ids', 'characters', 'scenario_id', 'user_id'))
    OR (table_name = 'players' AND column_name IN ('player_id', 'user_id'))
    OR (table_name = 'characters' AND column_name IN ('id', 'user_id'))
    OR (table_name = 'sessions' AND column_name IN ('run_id'))
    OR (table_name = 'scenarios' AND column_name IN ('id'))
  )
ORDER BY table_name, ordinal_position;

-- 同名relation・trigger・追加予定constraintの有無を確認する。
SELECT n.nspname AS schema_name, c.relname, c.relkind
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('run_players', 'run_characters');

SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'runs';

SELECT
  conrelid::regclass AS table_name,
  conname,
  pg_get_constraintdef(oid) AS definition,
  convalidated
FROM pg_catalog.pg_constraint
WHERE conrelid IN (
  'public.sessions'::regclass,
  'public.runs'::regclass,
  'public.recruitment_applicants'::regclass
)
ORDER BY conrelid::regclass::text, conname;
```

`recruitment_applicants.recruitment_id` のFKは `ON DELETE CASCADE` であることを確認する。異なる場合、募集主が他人所有の応募行を直接削除できないため、Phase C前にメンテナンス時間内でFKをCASCADEへ変更する。

### A-1. junctionテーブル作成

`sort_order` は元配列の順序で1始まり。複合PKが同一run内の重複を防止し、`UNIQUE(run_id, sort_order)` が表示順の衝突を防ぐ。

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.run_players (
  run_id text NOT NULL,
  player_id text NOT NULL,
  sort_order integer NOT NULL,
  user_id uuid NULL DEFAULT auth.uid(),
  CONSTRAINT run_players_pkey PRIMARY KEY (run_id, player_id),
  CONSTRAINT run_players_run_sort_key UNIQUE (run_id, sort_order),
  CONSTRAINT run_players_sort_order_check CHECK (sort_order > 0),
  CONSTRAINT run_players_run_id_fkey
    FOREIGN KEY (run_id) REFERENCES public.runs(id) ON DELETE CASCADE,
  CONSTRAINT run_players_player_id_fkey
    FOREIGN KEY (player_id) REFERENCES public.players(player_id) ON DELETE RESTRICT,
  CONSTRAINT run_players_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.run_characters (
  run_id text NOT NULL,
  character_id text NOT NULL,
  sort_order integer NOT NULL,
  user_id uuid NULL DEFAULT auth.uid(),
  CONSTRAINT run_characters_pkey PRIMARY KEY (run_id, character_id),
  CONSTRAINT run_characters_run_sort_key UNIQUE (run_id, sort_order),
  CONSTRAINT run_characters_sort_order_check CHECK (sort_order > 0),
  CONSTRAINT run_characters_run_id_fkey
    FOREIGN KEY (run_id) REFERENCES public.runs(id) ON DELETE CASCADE,
  CONSTRAINT run_characters_character_id_fkey
    FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE RESTRICT,
  CONSTRAINT run_characters_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.run_players IS '卓と参加プレイヤーの順序付きjunction。移行中はruns.player_idsから同期する。';
COMMENT ON TABLE public.run_characters IS '卓と参加キャラクターの順序付きjunction。移行中はruns.charactersから同期する。';

-- RLSは権限付与の代わりにならないため、新規テーブルの権限を明示する。
GRANT SELECT ON public.run_players, public.run_characters TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE
  ON public.run_players, public.run_characters
  TO authenticated;
GRANT ALL
  ON public.run_players, public.run_characters
  TO service_role;

COMMIT;
```

`anon` にはjunctionのDML権限を与えない。A-3より前に認証版Worker/フロントをデプロイし、通常run書込みが`authenticated`として実行されることを確認する。

### A-2. 順序維持backfillと不足履歴補完

空文字を除外し、同じ正規化済みIDが複数回あれば最初のordinalityだけを採用する。現在の確定情報では、有効ID重複は0。

```sql
BEGIN;

WITH expanded AS (
  SELECT
    r.id AS run_id,
    btrim(u.player_id) AS player_id,
    u.ord::integer AS sort_order,
    r.user_id,
    row_number() OVER (
      PARTITION BY r.id, btrim(u.player_id)
      ORDER BY u.ord
    ) AS duplicate_rank
  FROM public.runs AS r
  CROSS JOIN LATERAL unnest(coalesce(r.player_ids, ARRAY[]::text[]))
    WITH ORDINALITY AS u(player_id, ord)
  WHERE btrim(u.player_id) <> ''
)
INSERT INTO public.run_players (run_id, player_id, sort_order, user_id)
SELECT run_id, player_id, sort_order, user_id
FROM expanded
WHERE duplicate_rank = 1
ON CONFLICT (run_id, player_id) DO UPDATE
SET sort_order = EXCLUDED.sort_order,
    user_id = EXCLUDED.user_id;

WITH expanded AS (
  SELECT
    r.id AS run_id,
    btrim(u.character_id) AS character_id,
    u.ord::integer AS sort_order,
    r.user_id,
    row_number() OVER (
      PARTITION BY r.id, btrim(u.character_id)
      ORDER BY u.ord
    ) AS duplicate_rank
  FROM public.runs AS r
  CROSS JOIN LATERAL unnest(coalesce(r.characters, ARRAY[]::text[]))
    WITH ORDINALITY AS u(character_id, ord)
  WHERE btrim(u.character_id) <> ''
)
INSERT INTO public.run_characters (run_id, character_id, sort_order, user_id)
SELECT run_id, character_id, sort_order, user_id
FROM expanded
WHERE duplicate_rank = 1
ON CONFLICT (run_id, character_id) DO UPDATE
SET sort_order = EXCLUDED.sort_order,
    user_id = EXCLUDED.user_id;

-- 確定済みの不足1件だけを、未登録時に補完する。
INSERT INTO public.character_scenarios (character_id, scenario_id, user_id)
SELECT 'c-103', 's-021', c.user_id
FROM public.characters AS c
WHERE c.id = 'c-103'
  AND EXISTS (SELECT 1 FROM public.scenarios AS s WHERE s.id = 's-021')
  AND NOT EXISTS (
    SELECT 1
    FROM public.character_scenarios AS cs
    WHERE cs.character_id = 'c-103'
      AND cs.scenario_id = 's-021'
  );

COMMIT;
```

### A-3. 配列INSERT/UPDATEからjunctionへの互換同期

この関数は `SECURITY INVOKER` で、`search_path` を固定する。`runs` 自体を更新しないため再帰しない。配列変更時だけjunctionを洗い替える。

実行前ゲート: 認証版Worker/フロントがデプロイ済みで、通常run INSERT/PATCHが利用者JWTをSupabaseへ引き継いでいること。未デプロイのままtriggerを有効化すると、anonにはjunction DML権限がないためrun保存全体が失敗する。

```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_run_arrays_to_junctions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  -- INSERT時、またはplayer_idsが変わった時だけプレイヤー側を同期する。
  IF TG_OP = 'INSERT'
     OR NEW.player_ids IS DISTINCT FROM OLD.player_ids
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    DELETE FROM public.run_players
    WHERE run_id = NEW.id;

    INSERT INTO public.run_players (run_id, player_id, sort_order, user_id)
    SELECT NEW.id, normalized.player_id, normalized.sort_order, NEW.user_id
    FROM (
      SELECT
        btrim(u.player_id) AS player_id,
        u.ord::integer AS sort_order,
        row_number() OVER (
          PARTITION BY btrim(u.player_id)
          ORDER BY u.ord
        ) AS duplicate_rank
      FROM unnest(coalesce(NEW.player_ids, ARRAY[]::text[]))
        WITH ORDINALITY AS u(player_id, ord)
      WHERE btrim(u.player_id) <> ''
    ) AS normalized
    WHERE normalized.duplicate_rank = 1;
  END IF;

  -- INSERT時、またはcharactersが変わった時だけキャラクター側を同期する。
  IF TG_OP = 'INSERT'
     OR NEW.characters IS DISTINCT FROM OLD.characters
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    DELETE FROM public.run_characters
    WHERE run_id = NEW.id;

    INSERT INTO public.run_characters (run_id, character_id, sort_order, user_id)
    SELECT NEW.id, normalized.character_id, normalized.sort_order, NEW.user_id
    FROM (
      SELECT
        btrim(u.character_id) AS character_id,
        u.ord::integer AS sort_order,
        row_number() OVER (
          PARTITION BY btrim(u.character_id)
          ORDER BY u.ord
        ) AS duplicate_rank
      FROM unnest(coalesce(NEW.characters, ARRAY[]::text[]))
        WITH ORDINALITY AS u(character_id, ord)
      WHERE btrim(u.character_id) <> ''
    ) AS normalized
    WHERE normalized.duplicate_rank = 1;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_runs_sync_arrays_to_junctions ON public.runs;
CREATE TRIGGER trg_runs_sync_arrays_to_junctions
AFTER INSERT OR UPDATE OF player_ids, characters, user_id
ON public.runs
FOR EACH ROW
EXECUTE FUNCTION public.sync_run_arrays_to_junctions();

COMMIT;
```

**後続（2026-07）**: Worker dual-write 後はこのトリガーを DROP してよい。手順は [`sql/disable-array-to-junction-trigger-2026-07.sql.md`](./sql/disable-array-to-junction-trigger-2026-07.sql.md)。

### A-4. 既存孤児0確認後のFK追加

最初に検査を再実行する。どちらかが0でなければ `ROLLBACK` し、孤児を修正してからやり直す。

追加前にA-0のconstraint一覧をCSV保存し、`sessions_run_id_fkey_restrict`と`runs_scenario_id_fkey_restrict`の各行について「移行で作成」または「既存のためskip」を適用記録へ明記する。rollbackで削除できるのは「移行で作成」と記録された移行専用名だけである。

```sql
BEGIN;

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.sessions AS s
    LEFT JOIN public.runs AS r ON r.id = s.run_id
    WHERE s.run_id IS NOT NULL AND r.id IS NULL
  ) THEN
    RAISE EXCEPTION 'sessions.run_id に孤児があるためFKを追加できません';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.runs AS r
    LEFT JOIN public.scenarios AS s ON s.id = r.scenario_id
    WHERE r.scenario_id IS NOT NULL AND s.id IS NULL
  ) THEN
    RAISE EXCEPTION 'runs.scenario_id に孤児があるためFKを追加できません';
  END IF;
END;
$block$;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.sessions'::regclass
      AND conname = 'sessions_run_id_fkey_restrict'
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_run_id_fkey_restrict
      FOREIGN KEY (run_id) REFERENCES public.runs(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.runs'::regclass
      AND conname = 'runs_scenario_id_fkey_restrict'
  ) THEN
    ALTER TABLE public.runs
      ADD CONSTRAINT runs_scenario_id_fkey_restrict
      FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END;
$block$;

ALTER TABLE public.sessions
  VALIDATE CONSTRAINT sessions_run_id_fkey_restrict;
ALTER TABLE public.runs
  VALIDATE CONSTRAINT runs_scenario_id_fkey_restrict;

COMMIT;
```

既存FKが同じ列に存在する場合、一時的に二重制約になる。新制約の検証後、既存FKの定義を確認し、同じ `ON DELETE RESTRICT` ならメンテナンス時間内に古い方だけを削除する。名前を推測して削除しない。

## 3. Phase B: 軽量ビュー

PostgreSQL 15以上で `security_invoker=true` を指定し、基底テーブルのRLSを迂回しない。ビューは必要列だけを返し、API側でも `select=*` ではなく互換列を明示する。

### B-1. ビュー作成

```sql
BEGIN;

-- 既存API互換列: character_id, last_session_start。
CREATE OR REPLACE VIEW public.character_last_session
WITH (security_invoker = true)
AS
SELECT
  rc.character_id,
  max(s.start) AS last_session_start
FROM public.run_characters AS rc
JOIN public.sessions AS s ON s.run_id = rc.run_id
GROUP BY rc.character_id;

-- 募集一覧カードに必要な列と名称・応募数だけを返す。
CREATE OR REPLACE VIEW public.recruitment_list
WITH (security_invoker = true)
AS
SELECT
  r.id,
  r.owner_player_id,
  p.player_name AS owner_player_name,
  r.scenario_id,
  s.title AS scenario_title,
  s.image_url AS scenario_image_url,
  r.recruit_role,
  r.target_count,
  r.memo,
  r.status,
  r.created_at,
  count(ra.player_id)::integer AS applicant_count
FROM public.recruitments AS r
JOIN public.players AS p ON p.player_id = r.owner_player_id
LEFT JOIN public.scenarios AS s ON s.id = r.scenario_id
LEFT JOIN public.recruitment_applicants AS ra ON ra.recruitment_id = r.id
GROUP BY
  r.id,
  r.owner_player_id,
  p.player_name,
  r.scenario_id,
  s.title,
  s.image_url,
  r.recruit_role,
  r.target_count,
  r.memo,
  r.status,
  r.created_at;

-- シナリオ一覧の現行表示列にrun_countを追加する。
CREATE OR REPLACE VIEW public.scenario_summary
WITH (security_invoker = true)
AS
SELECT
  s.id,
  s.title,
  s.system,
  s.author,
  s.image_url,
  s.updated_at,
  s.trend_story_chaos,
  s.trend_avatar_clear,
  s.trend_harmony_active,
  s.min_players,
  s.max_players,
  s.play_time_minutes,
  s.lost_rate,
  count(r.id)::integer AS run_count
FROM public.scenarios AS s
LEFT JOIN public.runs AS r ON r.scenario_id = s.id
GROUP BY
  s.id,
  s.title,
  s.system,
  s.author,
  s.image_url,
  s.updated_at,
  s.trend_story_chaos,
  s.trend_avatar_clear,
  s.trend_harmony_active,
  s.min_players,
  s.max_players,
  s.play_time_minutes,
  s.lost_rate;

-- sessionのtarget_idは現行契約どおりrun_idとして解決する。
CREATE OR REPLACE VIEW public.recent_comments_with_names
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.created_at,
  c.target_type,
  c.target_id,
  c.author,
  c.body,
  CASE c.target_type
    WHEN 'run' THEN (
      SELECT r.title FROM public.runs AS r WHERE r.id = c.target_id
    )
    WHEN 'session' THEN (
      SELECT r.title FROM public.runs AS r WHERE r.id = c.target_id
    )
    WHEN 'recruitment' THEN (
      SELECT concat_ws(
        '',
        coalesce(s.title, 'シナリオ未定'),
        '（',
        CASE WHEN r.recruit_role = 'GM' THEN 'GM募集' ELSE 'PL募集' END,
        '）'
      )
      FROM public.recruitments AS r
      LEFT JOIN public.scenarios AS s ON s.id = r.scenario_id
      WHERE r.id = c.target_id
    )
    WHEN 'scenario' THEN (
      SELECT s.title FROM public.scenarios AS s WHERE s.id = c.target_id
    )
    WHEN 'character' THEN (
      SELECT ch.name FROM public.characters AS ch WHERE ch.id = c.target_id
    )
    WHEN 'player' THEN (
      SELECT p.player_name FROM public.players AS p WHERE p.player_id = c.target_id
    )
    WHEN 'post' THEN (
      SELECT '投稿 #' || p.id::text FROM public.posts AS p WHERE p.id::text = c.target_id
    )
    ELSE NULL
  END AS target_name
FROM public.comments AS c;

-- 巨大JSONを作らず、プレイヤー本体・プロフィール・キャラクター数だけを返す。
CREATE OR REPLACE VIEW public.player_detail_summary
WITH (security_invoker = true)
AS
SELECT
  p.player_id,
  p.player_name,
  p.memo,
  pp.icon_url,
  pp.profile_text,
  pp.tier_list_first,
  pp.tier_list_second,
  pp.tier_list_third,
  pp.desire_avatar,
  pp.desire_story,
  pp.desire_clear,
  pp.desire_chaos,
  pp.desire_active,
  pp.desire_harmony,
  count(ch.id)::integer AS character_count
FROM public.players AS p
LEFT JOIN public.player_profiles AS pp ON pp.player_id = p.player_id
LEFT JOIN public.characters AS ch ON ch.player_id = p.player_id
GROUP BY
  p.player_id,
  p.player_name,
  p.memo,
  pp.icon_url,
  pp.profile_text,
  pp.tier_list_first,
  pp.tier_list_second,
  pp.tier_list_third,
  pp.desire_avatar,
  pp.desire_story,
  pp.desire_clear,
  pp.desire_chaos,
  pp.desire_active,
  pp.desire_harmony;

GRANT SELECT ON
  public.character_last_session,
  public.recruitment_list,
  public.scenario_summary,
  public.recent_comments_with_names,
  public.player_detail_summary
TO anon, authenticated, service_role;

COMMIT;
```

### B-2. API互換に必要なフィールド

- `character_last_session`: `character_id`, `last_session_start` を維持する。
- `recruitment_list`: 現行カードの `id`, `owner_player_id`, `scenario_id`, `recruit_role`, `target_count`, `memo`, `status`, `created_at` に加え、`owner_player_name`, `scenario_title`, `scenario_image_url`, `applicant_count` を返す。応募者名一覧が必要な詳細画面は従来APIを維持する。
- `scenario_summary`: 現行 `scenario_list` の一覧表示列と `run_count` を返す。詳細用の `description`, `notes` は一覧レスポンスに含めない。
- `recent_comments_with_names`: 現行コメントの `id`, `created_at`, `target_type`, `target_id`, `author`, `body` と `target_name` を返す。`target_type` は `run/recruitment/scenario/character/player/session/post` を扱い、`session.target_id` はrun IDとして扱う。
- `player_detail_summary`: `player_id`, `player_name`, `memo`、表示に必要なプロフィール列、`character_count` のみ。キャラクター、卓、セッション、予定の巨大JSON集約は行わない。

ビュー切替はDB作成とは別デプロイにし、旧エンドポイントを残したまま新エンドポイントを追加して比較する。PostgRESTのスキーマキャッシュ反映が遅い場合はDashboardからAPI schema reloadを行う。

## 4. 限定index

既存indexとの重複を避けるため、先に定義一覧を確認する。指定された6本以外を「念のため」で追加しない。

```sql
-- 既存indexの列順・WHERE句を確認する。
SELECT schemaname, tablename, indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'sessions',
    'characters',
    'character_scenarios',
    'recruitments',
    'posts',
    'players'
  )
ORDER BY tablename, indexname;
```

同じ先頭列・列順・WHERE句のindexが既にあれば、名前が違っても該当 `CREATE INDEX` は実行しない。

各indexについて、作成前の存在確認結果と「移行で作成」または「既存のためskip」を適用記録へ残す。`IF NOT EXISTS`でskipされた同名indexをrollbackで削除してはならない。

```sql
BEGIN;

CREATE INDEX IF NOT EXISTS idx_sessions_status_start
  ON public.sessions (status, start);

CREATE INDEX IF NOT EXISTS idx_characters_player_id
  ON public.characters (player_id);

CREATE INDEX IF NOT EXISTS idx_character_scenarios_scenario_character
  ON public.character_scenarios (scenario_id, character_id);

CREATE INDEX IF NOT EXISTS idx_recruitments_owner_status_created
  ON public.recruitments (owner_player_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc
  ON public.posts (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_players_user_id_not_null
  ON public.players (user_id)
  WHERE user_id IS NOT NULL;

COMMIT;
```

既存indexの `sessions(run_id,status,start)`、`sessions(run_id,start)`、`runs(scenario_id,status)`、`comments(target_type,target_id,created_at desc)`、各複合PKは保持する。小規模DBなので、実クエリで使われない追加indexは禁止する。

## 5. Phase C: RLS強化

### C-0. 適用ゲート（必須）

以下をすべて満たすまでPhase Cを実行しない。

- ブラウザ→Worker→Supabaseで、通常書込みの `Authorization: Bearer <user JWT>` が引き継がれる実装は完了している。ステージングで実JWTによる成功と無効JWTによる失敗を確認する。
- R2 uploadはWorkerがSupabase Auth `/auth/v1/user`でJWTを検証してから書き込む実装済み。Bearer文字列だけでは成功しないことを確認する。
- Workerの汎用POST/PATCH/DELETEに `request` が渡され、匿名キーへ強制フォールバックしていない。
- Discord Interaction、Cron、期限切れ募集削除、満員更新、参加者所有キャラクターだけに限定した履歴同期だけが、設定済みService Role Secretを使用する。
- Service Role Secretはブラウザへ返さず、Worker環境変数だけに存在する。
- anon、ログインユーザー、別ユーザー、Service Roleの4経路でステージング検証済み。

現行Workerでは通常書込みのBearer引継ぎとR2 uploadのJWT検証を実装済みである。Service RoleはRLSをbypassするため、通常ユーザー書込みには使わず、上記の内部処理に限定する。

棚卸し時点で、下記対象テーブルの全`user_id`列には`auth.uid()` defaultが設定済みである。適用直前にも定義を再確認し、1件でも異なる場合はPhase Cを停止する。NULL既存行はdefaultでは補完されず本人が更新できなくなるため、業務上正しいauth userへ手動対応表を作って補完する。推測で一括補完しない。

```sql
SELECT
  table_name,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'user_id'
  AND table_name IN (
    'players',
    'player_availability',
    'characters',
    'character_attributes',
    'character_skills',
    'character_scenarios',
    'scenarios',
    'runs',
    'run_players',
    'run_characters',
    'sessions',
    'recruitments',
    'recruitment_applicants',
    'comments',
    'posts'
  )
ORDER BY table_name;

-- 全対象がauth.uid() defaultであること。0件以外ならPhase Cを停止する。
SELECT table_name, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'user_id'
  AND table_name IN (
    'players', 'player_availability', 'characters', 'character_attributes',
    'character_skills', 'character_scenarios', 'scenarios', 'runs',
    'run_players', 'run_characters', 'sessions', 'recruitments',
    'recruitment_applicants', 'comments', 'posts'
  )
  AND coalesce(column_default, '') NOT IN ('auth.uid()', '(auth.uid())');

-- 各結果が0であること、またはNULL行をService Role管理対象として明示承認すること。
SELECT 'players' AS table_name, count(*) AS null_owner_count FROM public.players WHERE user_id IS NULL
UNION ALL SELECT 'player_availability', count(*) FROM public.player_availability WHERE user_id IS NULL
UNION ALL SELECT 'characters', count(*) FROM public.characters WHERE user_id IS NULL
UNION ALL SELECT 'character_attributes', count(*) FROM public.character_attributes WHERE user_id IS NULL
UNION ALL SELECT 'character_skills', count(*) FROM public.character_skills WHERE user_id IS NULL
UNION ALL SELECT 'character_scenarios', count(*) FROM public.character_scenarios WHERE user_id IS NULL
UNION ALL SELECT 'scenarios', count(*) FROM public.scenarios WHERE user_id IS NULL
UNION ALL SELECT 'runs', count(*) FROM public.runs WHERE user_id IS NULL
UNION ALL SELECT 'run_players', count(*) FROM public.run_players WHERE user_id IS NULL
UNION ALL SELECT 'run_characters', count(*) FROM public.run_characters WHERE user_id IS NULL
UNION ALL SELECT 'sessions', count(*) FROM public.sessions WHERE user_id IS NULL
UNION ALL SELECT 'recruitments', count(*) FROM public.recruitments WHERE user_id IS NULL
UNION ALL SELECT 'recruitment_applicants', count(*) FROM public.recruitment_applicants WHERE user_id IS NULL
UNION ALL SELECT 'comments', count(*) FROM public.comments WHERE user_id IS NULL
UNION ALL SELECT 'posts', count(*) FROM public.posts WHERE user_id IS NULL
ORDER BY table_name;
```

通常INSERTの`user_id`はDBの`auth.uid()` defaultを使用する。クライアントが送った任意の`user_id`は信頼せず、RLSの`WITH CHECK`でも論理的な親所有者を検証する。

### C-1. 対象テーブルのRLS有効化とcanonical policy

SELECTはpublicを維持し、INSERT/UPDATE/DELETEはログイン必須かつ所有者だけに限定する。`player_profiles`と`player_availability`と応募は対応する`players.user_id`、character子テーブルは`characters.user_id`、sessionsと新junctionは親`runs.user_id`で判定する。応募の通常操作は応募player本人だけに許可し、募集主による募集削除時は`recruitments`削除のFK `ON DELETE CASCADE`へ任せる。

適用前に、RLS有効状態と旧policyをCSV保存し、生成した`rollback_ddl`も別ファイルへ保存する。この保存物がない場合はC-1/C-2を実行しない。

```sql
SELECT
  n.nspname AS schemaname,
  c.relname AS tablename,
  c.relrowsecurity,
  c.relforcerowsecurity
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'players', 'player_profiles', 'player_availability', 'characters',
    'character_attributes', 'character_skills', 'character_scenarios',
    'scenarios', 'runs', 'run_players', 'run_characters', 'sessions',
    'recruitments', 'recruitment_applicants', 'comments', 'posts'
  )
ORDER BY c.relname;

SELECT
  schemaname,
  tablename,
  policyname,
  format(
    'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
    policyname,
    schemaname,
    tablename,
    permissive,
    cmd,
    array_to_string(
      ARRAY(SELECT quote_ident(role_name) FROM unnest(roles) AS role_name),
      ', '
    ),
    CASE WHEN qual IS NULL THEN '' ELSE format(' USING (%s)', qual) END,
    CASE WHEN with_check IS NULL THEN '' ELSE format(' WITH CHECK (%s)', with_check) END
  ) AS rollback_ddl
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND policyname NOT LIKE 'fctzs\_%' ESCAPE '\'
ORDER BY tablename, policyname;
```

```sql
BEGIN;

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- 再実行可能にするため、この移行専用名だけを先に削除する。
DO $block$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'fctzs\_%' ESCAPE '\'
      AND tablename IN (
        'players',
        'player_profiles',
        'player_availability',
        'characters',
        'character_attributes',
        'character_skills',
        'character_scenarios',
        'scenarios',
        'runs',
        'run_players',
        'run_characters',
        'sessions',
        'recruitments',
        'recruitment_applicants',
        'comments',
        'posts'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END;
$block$;

-- 公開SELECT。対象テーブルごとに固有名を使う。
CREATE POLICY fctzs_players_public_select ON public.players
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fctzs_player_profiles_public_select ON public.player_profiles
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fctzs_availability_public_select ON public.player_availability
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fctzs_characters_public_select ON public.characters
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fctzs_character_attributes_public_select ON public.character_attributes
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fctzs_character_skills_public_select ON public.character_skills
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fctzs_character_scenarios_public_select ON public.character_scenarios
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fctzs_scenarios_public_select ON public.scenarios
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fctzs_runs_public_select ON public.runs
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fctzs_run_players_public_select ON public.run_players
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fctzs_run_characters_public_select ON public.run_characters
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fctzs_sessions_public_select ON public.sessions
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fctzs_recruitments_public_select ON public.recruitments
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fctzs_applicants_public_select ON public.recruitment_applicants
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fctzs_comments_public_select ON public.comments
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fctzs_posts_public_select ON public.posts
  FOR SELECT TO anon, authenticated USING (true);

-- 独立した所有対象だけをuser_idで直接判定する。
-- 対象: players / characters / scenarios / runs / recruitments / comments / posts。
CREATE POLICY fctzs_players_owner_insert ON public.players
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY fctzs_players_owner_update ON public.players
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY fctzs_players_owner_delete ON public.players
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 予定は指定player本人だけが操作できる。
CREATE POLICY fctzs_availability_owner_insert ON public.player_availability
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.players AS p
      WHERE p.player_id = player_availability.player_id
        AND p.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_availability_owner_update ON public.player_availability
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players AS p
      WHERE p.player_id = player_availability.player_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.players AS p
      WHERE p.player_id = player_availability.player_id
        AND p.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_availability_owner_delete ON public.player_availability
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players AS p
      WHERE p.player_id = player_availability.player_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY fctzs_characters_owner_insert ON public.characters
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY fctzs_characters_owner_update ON public.characters
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY fctzs_characters_owner_delete ON public.characters
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY fctzs_character_attributes_owner_insert ON public.character_attributes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.characters AS c
      WHERE c.id = character_attributes.character_id
        AND c.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_character_attributes_owner_update ON public.character_attributes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.characters AS c
      WHERE c.id = character_attributes.character_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.characters AS c
      WHERE c.id = character_attributes.character_id
        AND c.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_character_attributes_owner_delete ON public.character_attributes
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.characters AS c
      WHERE c.id = character_attributes.character_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY fctzs_character_skills_owner_insert ON public.character_skills
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.characters AS c
      WHERE c.id = character_skills.character_id
        AND c.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_character_skills_owner_update ON public.character_skills
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.characters AS c
      WHERE c.id = character_skills.character_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.characters AS c
      WHERE c.id = character_skills.character_id
        AND c.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_character_skills_owner_delete ON public.character_skills
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.characters AS c
      WHERE c.id = character_skills.character_id
        AND c.user_id = auth.uid()
    )
  );

-- 通過履歴の通常操作はcharacter所有者だけ。Service Role同期はWorkerで卓参加者のcharacterだけに検証済み。
CREATE POLICY fctzs_character_scenarios_owner_insert ON public.character_scenarios
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.characters AS c
      WHERE c.id = character_scenarios.character_id
        AND c.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_character_scenarios_owner_update ON public.character_scenarios
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.characters AS c
      WHERE c.id = character_scenarios.character_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.characters AS c
      WHERE c.id = character_scenarios.character_id
        AND c.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_character_scenarios_owner_delete ON public.character_scenarios
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.characters AS c
      WHERE c.id = character_scenarios.character_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY fctzs_scenarios_owner_insert ON public.scenarios
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY fctzs_scenarios_owner_update ON public.scenarios
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY fctzs_scenarios_owner_delete ON public.scenarios
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY fctzs_runs_owner_insert ON public.runs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY fctzs_runs_owner_update ON public.runs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY fctzs_runs_owner_delete ON public.runs
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY fctzs_sessions_owner_insert ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.runs AS r
      WHERE r.id = sessions.run_id
        AND r.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_sessions_owner_update ON public.sessions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.runs AS r
      WHERE r.id = sessions.run_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.runs AS r
      WHERE r.id = sessions.run_id
        AND r.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_sessions_owner_delete ON public.sessions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.runs AS r
      WHERE r.id = sessions.run_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY fctzs_recruitments_owner_insert ON public.recruitments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY fctzs_recruitments_owner_update ON public.recruitments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY fctzs_recruitments_owner_delete ON public.recruitments
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY fctzs_applicants_owner_insert ON public.recruitment_applicants
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.players AS p
      WHERE p.player_id = recruitment_applicants.player_id
        AND p.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_applicants_owner_update ON public.recruitment_applicants
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players AS p
      WHERE p.player_id = recruitment_applicants.player_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.players AS p
      WHERE p.player_id = recruitment_applicants.player_id
        AND p.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_applicants_owner_delete ON public.recruitment_applicants
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players AS p
      WHERE p.player_id = recruitment_applicants.player_id
        AND p.user_id = auth.uid()
    )
  );

-- 募集主は応募行を直接削除しない。recruitmentsの本人DELETEとFK ON DELETE CASCADEで削除する。

-- commentsも匿名書込みを許可しない。
CREATE POLICY fctzs_comments_owner_insert ON public.comments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY fctzs_comments_owner_update ON public.comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY fctzs_comments_owner_delete ON public.comments
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY fctzs_posts_owner_insert ON public.posts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY fctzs_posts_owner_update ON public.posts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY fctzs_posts_owner_delete ON public.posts
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- player_profilesはplayers.user_idを所有者として扱う。
CREATE POLICY fctzs_player_profiles_owner_insert ON public.player_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.players AS p
      WHERE p.player_id = player_profiles.player_id
        AND p.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_player_profiles_owner_update ON public.player_profiles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players AS p
      WHERE p.player_id = player_profiles.player_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.players AS p
      WHERE p.player_id = player_profiles.player_id
        AND p.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_player_profiles_owner_delete ON public.player_profiles
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players AS p
      WHERE p.player_id = player_profiles.player_id
        AND p.user_id = auth.uid()
    )
  );

-- junctionはコピーされたuser_idではなく、親runの所有者で常に判定する。
CREATE POLICY fctzs_run_players_parent_insert ON public.run_players
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.runs AS r
      WHERE r.id = run_players.run_id
        AND r.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_run_players_parent_update ON public.run_players
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.runs AS r
      WHERE r.id = run_players.run_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.runs AS r
      WHERE r.id = run_players.run_id
        AND r.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_run_players_parent_delete ON public.run_players
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.runs AS r
      WHERE r.id = run_players.run_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY fctzs_run_characters_parent_insert ON public.run_characters
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.runs AS r
      WHERE r.id = run_characters.run_id
        AND r.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_run_characters_parent_update ON public.run_characters
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.runs AS r
      WHERE r.id = run_characters.run_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.runs AS r
      WHERE r.id = run_characters.run_id
        AND r.user_id = auth.uid()
    )
  );
CREATE POLICY fctzs_run_characters_parent_delete ON public.run_characters
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.runs AS r
      WHERE r.id = run_characters.run_id
        AND r.user_id = auth.uid()
    )
  );

COMMIT;
```

### C-2. `dev_anon_access` と旧重複policyの段階削除

まず一覧をCSV保存する。

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;
```

次の削除は、C-1後のanon SELECT、本人CRUD、Service Role内部処理が成功した後だけ行う。対象テーブル上の `fctzs_` 以外の旧policyを削除するため、`dev_anon_access` と重複policyも含まれる。

```sql
BEGIN;

DO $block$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'players',
        'player_profiles',
        'player_availability',
        'characters',
        'character_attributes',
        'character_skills',
        'character_scenarios',
        'scenarios',
        'runs',
        'run_players',
        'run_characters',
        'sessions',
        'recruitments',
        'recruitment_applicants',
        'comments',
        'posts'
      )
      AND policyname NOT LIKE 'fctzs\_%' ESCAPE '\'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END;
$block$;

COMMIT;
```

## 6. 検証SQL

### 6.1 行数・配列とjunctionの一致

```sql
SELECT 'run_players' AS relation_name, count(*) AS row_count
FROM public.run_players
UNION ALL
SELECT 'run_characters', count(*)
FROM public.run_characters;

-- いずれも0件が合格。空文字と同一run内重複は比較対象から除外済み。
WITH expected AS (
  SELECT r.id AS run_id, btrim(u.player_id) AS player_id, min(u.ord)::integer AS sort_order
  FROM public.runs AS r
  CROSS JOIN LATERAL unnest(coalesce(r.player_ids, ARRAY[]::text[]))
    WITH ORDINALITY AS u(player_id, ord)
  WHERE btrim(u.player_id) <> ''
  GROUP BY r.id, btrim(u.player_id)
)
SELECT 'array_only' AS mismatch, e.run_id, e.player_id, e.sort_order
FROM expected AS e
LEFT JOIN public.run_players AS rp
  ON rp.run_id = e.run_id
 AND rp.player_id = e.player_id
 AND rp.sort_order = e.sort_order
WHERE rp.run_id IS NULL
UNION ALL
SELECT 'junction_only', rp.run_id, rp.player_id, rp.sort_order
FROM public.run_players AS rp
LEFT JOIN expected AS e
  ON e.run_id = rp.run_id
 AND e.player_id = rp.player_id
 AND e.sort_order = rp.sort_order
WHERE e.run_id IS NULL;

WITH expected AS (
  SELECT r.id AS run_id, btrim(u.character_id) AS character_id, min(u.ord)::integer AS sort_order
  FROM public.runs AS r
  CROSS JOIN LATERAL unnest(coalesce(r.characters, ARRAY[]::text[]))
    WITH ORDINALITY AS u(character_id, ord)
  WHERE btrim(u.character_id) <> ''
  GROUP BY r.id, btrim(u.character_id)
)
SELECT 'array_only' AS mismatch, e.run_id, e.character_id, e.sort_order
FROM expected AS e
LEFT JOIN public.run_characters AS rc
  ON rc.run_id = e.run_id
 AND rc.character_id = e.character_id
 AND rc.sort_order = e.sort_order
WHERE rc.run_id IS NULL
UNION ALL
SELECT 'junction_only', rc.run_id, rc.character_id, rc.sort_order
FROM public.run_characters AS rc
LEFT JOIN expected AS e
  ON e.run_id = rc.run_id
 AND e.character_id = rc.character_id
 AND e.sort_order = rc.sort_order
WHERE e.run_id IS NULL;
```

### 6.2 orphan・duplicate・FK

```sql
-- すべて0件が合格。
SELECT rp.*
FROM public.run_players AS rp
LEFT JOIN public.runs AS r ON r.id = rp.run_id
LEFT JOIN public.players AS p ON p.player_id = rp.player_id
WHERE r.id IS NULL OR p.player_id IS NULL;

SELECT rc.*
FROM public.run_characters AS rc
LEFT JOIN public.runs AS r ON r.id = rc.run_id
LEFT JOIN public.characters AS c ON c.id = rc.character_id
WHERE r.id IS NULL OR c.id IS NULL;

SELECT run_id, player_id, count(*)
FROM public.run_players
GROUP BY run_id, player_id
HAVING count(*) > 1;

SELECT run_id, character_id, count(*)
FROM public.run_characters
GROUP BY run_id, character_id
HAVING count(*) > 1;

SELECT run_id, sort_order, count(*)
FROM public.run_players
GROUP BY run_id, sort_order
HAVING count(*) > 1;

SELECT run_id, sort_order, count(*)
FROM public.run_characters
GROUP BY run_id, sort_order
HAVING count(*) > 1;

SELECT conrelid::regclass AS table_name, conname, convalidated,
       pg_get_constraintdef(oid) AS definition
FROM pg_catalog.pg_constraint
WHERE conname IN (
  'sessions_run_id_fkey_restrict',
  'runs_scenario_id_fkey_restrict'
);
```

### 6.3 view結果

```sql
SELECT * FROM public.character_last_session
ORDER BY last_session_start DESC NULLS LAST
LIMIT 10;

SELECT * FROM public.recruitment_list
ORDER BY created_at DESC NULLS LAST
LIMIT 10;

SELECT * FROM public.scenario_summary
ORDER BY run_count DESC, id
LIMIT 10;

SELECT * FROM public.recent_comments_with_names
ORDER BY created_at DESC
LIMIT 20;

SELECT * FROM public.player_detail_summary
ORDER BY player_id
LIMIT 10;

-- security_invoker設定を確認する。
SELECT
  n.nspname AS schema_name,
  c.relname AS view_name,
  c.reloptions
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'character_last_session',
    'recruitment_list',
    'scenario_summary',
    'recent_comments_with_names',
    'player_detail_summary'
  );
```

### 6.4 indexes・policy一覧

```sql
SELECT schemaname, tablename, indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_sessions_status_start',
    'idx_characters_player_id',
    'idx_character_scenarios_scenario_character',
    'idx_recruitments_owner_status_created',
    'idx_posts_created_at_desc',
    'uq_players_user_id_not_null'
  )
ORDER BY indexname;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- Phase C完了後は0件が合格。
SELECT schemaname, tablename, policyname
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND (
    policyname = 'dev_anon_access'
    OR (
      tablename IN (
        'players', 'player_profiles', 'player_availability', 'characters',
        'character_attributes', 'character_skills', 'character_scenarios',
        'scenarios', 'runs', 'run_players', 'run_characters', 'sessions',
        'recruitments', 'recruitment_applicants', 'comments', 'posts'
      )
      AND policyname NOT LIKE 'fctzs\_%' ESCAPE '\'
    )
  );
```

## 7. EXPLAIN before/after

`EXPLAIN (ANALYZE, BUFFERS)` は実際にクエリを実行する。以下はSELECTだけに限定し、同じ条件値でbefore/afterを保存する。小規模DBではSeq Scanが正しい場合があるため、Index Scanの有無だけで合否を決めない。

```sql
-- Before: 配列内のキャラクターから最終セッションを求める例。
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
  c.id AS character_id,
  max(s.start) AS last_session_start
FROM public.characters AS c
JOIN public.runs AS r ON c.id = ANY (r.characters)
JOIN public.sessions AS s ON s.run_id = r.id
GROUP BY c.id;

-- After: junctionから同じ結果を求める。
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
  rc.character_id,
  max(s.start) AS last_session_start
FROM public.run_characters AS rc
JOIN public.sessions AS s ON s.run_id = rc.run_id
GROUP BY rc.character_id;

-- Before: 募集、応募数、名称を個別取得する元になるクエリ。
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT r.id
FROM public.recruitments AS r
WHERE r.status IN ('open', 'fulfilled')
ORDER BY r.created_at DESC;

-- After: 一覧用ビューから必要列だけ取得する。
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
  id,
  owner_player_name,
  scenario_title,
  applicant_count,
  target_count,
  status,
  created_at
FROM public.recruitment_list
WHERE status IN ('open', 'fulfilled')
ORDER BY created_at DESC;
```

確認項目はPlanning Time、Execution Time、Buffers、返却行数、不要な全表取得の消滅。件数が増えた時に再計測し、その時点でのみ追加indexを検討する。

## 8. 手動スモーク

### Phase A後

- 既存UIから卓を新規作成し、`runs` 配列と両junctionのID・順序が一致する。
- 卓の参加者・キャラクターを更新し、削除・追加・並べ替えがjunctionへ反映される。
- 空配列/nullへ更新した時に、対応junctionが0件になる。
- 同じ有効IDを配列へ重複指定した時、junctionには先頭1件だけ入る。
- 存在しないplayer/character IDを指定した時、FKエラーになり卓更新全体が失敗することを確認する。
- `c-103/s-021` が1件だけ存在する。

### Phase B/API切替後

- キャラクター一覧の最終セッション順が旧画面と一致する。
- 募集一覧の募集主、シナリオ、画像、応募数、定員、状態が一致する。
- シナリオ一覧の検索・相性表示とrun数が一致する。
- 新着コメントで全target_typeの名称・リンクが正しい。特にsessionはrun詳細へ遷移する。
- プレイヤー詳細の基本プロフィールとキャラクター数が一致する。
- 旧APIと新APIのJSON型（IDはtext、countはinteger、日時はISO文字列）が互換である。

### Phase C後

- anon: 全対象のSELECT成功、全INSERT/PATCH/DELETE失敗。
- ログイン本人: 自分のデータのINSERT/PATCH/DELETE成功。
- 別ログインユーザー: 他人のデータのPATCH/DELETE失敗。
- 関連所有権: 他人のplayer予定・応募、他人のcharacter属性/技能/履歴、他人のrun sessionをINSERT/PATCH/DELETEできない。
- 応募本人は自分の応募だけ取消可能。募集主は応募行を直接削除せず、募集削除のFK CASCADEで全応募も削除される。
- comments: ログイン時だけ投稿成功し、`user_id=auth.uid()` になる。
- runs更新時のSECURITY INVOKER triggerが、親run所有者としてjunctionを同期できる。
- 履歴同期はGM/参加者所有characterだけ追加し、許可外・不明characterを除外する。
- Discord応募、満員更新、Cron通知、期限切れ募集削除、検証済み履歴同期がService Role経路で成功する。
- Service Role: 必要な内部処理だけ成功し、ブラウザNetworkにService Role Secretが出ない。

## 9. rollback

rollback前に書込みを止め、対象Phaseより後の変更を先に戻す。

### Phase C rollback

canonical policyを削除して保存済み旧policyへ戻す。RLSは無条件に無効化しない。適用前スナップショットで`relrowsecurity=true`だったテーブルは、rollback中も必ず`ENABLE ROW LEVEL SECURITY`を維持する。

1. C-2未実行なら旧policyは残っているため、保存DDLを再実行せず`fctzs_` policyだけ削除する。
2. C-2実行済みなら、下記トランザクションの`COMMIT`前に保存済み`rollback_ddl`を貼り付けて旧policyを復元する。
3. 保存済みRLS状態・旧policyと一致しない場合は`ROLLBACK`する。適用前にRLS無効だったテーブルも自動で`DISABLE`へ戻さず、影響確認後の別作業とする。

```sql
BEGIN;

DO $block$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'fctzs\_%' ESCAPE '\'
      AND tablename IN (
        'players',
        'player_profiles',
        'player_availability',
        'characters',
        'character_attributes',
        'character_skills',
        'character_scenarios',
        'scenarios',
        'runs',
        'run_players',
        'run_characters',
        'sessions',
        'recruitments',
        'recruitment_applicants',
        'comments',
        'posts'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END;
$block$;

-- C-2実行済みの場合のみ、ここへ保存済みrollback_ddlを貼り付ける。
-- 保存DDL以外を推測で作成しない。

-- 既存RLS有効環境では全行がtrueであること。想定外ならCOMMITせずROLLBACKする。
SELECT
  n.nspname AS schemaname,
  c.relname AS tablename,
  c.relrowsecurity,
  c.relforcerowsecurity
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'players', 'player_profiles', 'player_availability', 'characters',
    'character_attributes', 'character_skills', 'character_scenarios',
    'scenarios', 'runs', 'run_players', 'run_characters', 'sessions',
    'recruitments', 'recruitment_applicants', 'comments', 'posts'
  )
ORDER BY c.relname;

COMMIT;
```

### 限定index rollback

作成前の適用記録で「移行で作成」となっているindexだけを、次の候補から1文ずつ実行する。「既存のためskip」または記録不明のindexは削除禁止。以下を一括実行しない。

```sql
-- 例: idx_sessions_status_startが「移行で作成」の場合だけ実行する。
DROP INDEX IF EXISTS public.idx_sessions_status_start;

-- 同じ手順で、適用記録が「移行で作成」のものだけ個別実行する。
DROP INDEX IF EXISTS public.idx_characters_player_id;
DROP INDEX IF EXISTS public.idx_character_scenarios_scenario_character;
DROP INDEX IF EXISTS public.idx_recruitments_owner_status_created;
DROP INDEX IF EXISTS public.idx_posts_created_at_desc;
DROP INDEX IF EXISTS public.uq_players_user_id_not_null;
```

### Phase B rollback

APIを旧エンドポイントへ戻してから実行する。`character_last_session` は配列ベースの互換定義へ戻し、他の新規ビューを削除する。

```sql
BEGIN;

DROP VIEW IF EXISTS public.player_detail_summary;
DROP VIEW IF EXISTS public.recent_comments_with_names;
DROP VIEW IF EXISTS public.scenario_summary;
DROP VIEW IF EXISTS public.recruitment_list;

CREATE OR REPLACE VIEW public.character_last_session
WITH (security_invoker = true)
AS
SELECT
  btrim(u.character_id) AS character_id,
  max(s.start) AS last_session_start
FROM public.runs AS r
CROSS JOIN LATERAL unnest(coalesce(r.characters, ARRAY[]::text[]))
  AS u(character_id)
JOIN public.sessions AS s ON s.run_id = r.id
WHERE btrim(u.character_id) <> ''
GROUP BY btrim(u.character_id);

COMMIT;
```

Phase B適用前の `character_last_session` 定義を保存している場合は、上記一般互換定義ではなく保存済み定義を復元する。

### Phase A rollback

先にAPI読み取りを配列へ戻す。配列列は削除しない。junctionを正として更新したデータが存在する場合は、削除前に必ずjunctionから配列へ再同期する。FKは適用記録が「移行で作成」の移行専用名だけを削除し、「既存のためskip」または記録不明ならDROP文を実行しない。

```sql
BEGIN;

DROP TRIGGER IF EXISTS trg_runs_sync_arrays_to_junctions ON public.runs;
DROP FUNCTION IF EXISTS public.sync_run_arrays_to_junctions();

-- 次の各文は、そのconstraintが「移行で作成」と記録されている場合だけ個別実行する。
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_run_id_fkey_restrict;
ALTER TABLE public.runs
  DROP CONSTRAINT IF EXISTS runs_scenario_id_fkey_restrict;

DROP TABLE IF EXISTS public.run_characters;
DROP TABLE IF EXISTS public.run_players;

COMMIT;
```

`c-103/s-021` は正しい履歴データなので通常はrollbackでも保持する。A-2実行時に「INSERT 0 1」で追加され、業務上も取り消す必要がある場合だけ、次を別途実行する。

```sql
DELETE FROM public.character_scenarios
WHERE character_id = 'c-103'
  AND scenario_id = 's-021';
```

## 10. 推奨適用順序

1. ベースライン取得とバックアップ。
2. A-0 preflight。
3. A-1 junction作成 → 検証。
4. A-2 backfill・不足補完 → 配列一致検証。
5. 実装済みの認証版Worker/フロントをデプロイし、通常Bearer、R2 JWT検証、Service Role限定経路をステージング確認。
6. A-3互換trigger → 認証済みrun INSERT/PATCHとjunction同期をUIスモーク。
7. A-4 FK `NOT VALID`追加・`VALIDATE` → constraint確認。作成/skipを適用記録へ保存。
8. Phase Bビュー作成 → 旧APIと新APIの比較。
9. Worker/APIを小さい単位で新ビュー・junction読取りへ切替 → API再計測。
10. 既存index定義を確認後、重複しない限定indexだけ追加 → EXPLAIN比較。作成/skipを適用記録へ保存。
11. RLS状態・旧policy・rollback DDLを保存後、Phase C C-1 canonical policy → 関連所有権を含む4経路スモーク。
12. 問題がないことを確認後、C-2で `dev_anon_access` と旧重複policyを削除。

配列からjunctionへの同期は一方向である（A-3）。Worker が junction を明示洗替する現行では、A-3 トリガーは冗長であり無効化済み。配列列へのミラーは行わない。列 DROP は [`sql/drop-runs-array-columns-future.sql.md`](./sql/drop-runs-array-columns-future.sql.md)。
