-- 卓・シナリオ向け「感想」テーブル
-- Supabase Dashboard の SQL Editor で実行してください（エージェントはDBを直接操作しません）。
-- 閲覧の参加者判定は Worker が行い、公開 SELECT は付けません。
-- run_id は任意（NULL = 特定卓なし／部活外などシナリオ単位の感想）。

CREATE TABLE IF NOT EXISTS public.impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NULL,
  scenario_id text NOT NULL,
  user_id uuid NOT NULL,
  author_player_id text NOT NULL,
  author text NOT NULL,
  body text NOT NULL,
  is_spoiler boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT impressions_body_not_blank CHECK (char_length(trim(body)) > 0)
);

-- 既に NOT NULL で作済みの場合の移行
ALTER TABLE public.impressions
  ALTER COLUMN run_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS impressions_run_id_created_at_idx
  ON public.impressions (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS impressions_scenario_id_created_at_idx
  ON public.impressions (scenario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS impressions_author_player_id_idx
  ON public.impressions (author_player_id);

CREATE INDEX IF NOT EXISTS impressions_scenario_null_run_idx
  ON public.impressions (scenario_id, created_at DESC)
  WHERE run_id IS NULL;

ALTER TABLE public.impressions ENABLE ROW LEVEL SECURITY;

-- 直接クライアント向け: 本人の行のみ（一覧の参加者分は Worker + Service Role）
DROP POLICY IF EXISTS fctzs_impressions_select_own ON public.impressions;
CREATE POLICY fctzs_impressions_select_own ON public.impressions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS fctzs_impressions_insert_own ON public.impressions;
CREATE POLICY fctzs_impressions_insert_own ON public.impressions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS fctzs_impressions_delete_own ON public.impressions;
CREATE POLICY fctzs_impressions_delete_own ON public.impressions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.impressions TO authenticated;
GRANT ALL ON public.impressions TO service_role;
