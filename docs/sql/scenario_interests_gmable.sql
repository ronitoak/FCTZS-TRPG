-- シナリオ「気になる」＋ GM可能シナリオ登録
-- Supabase Dashboard の SQL Editor で実行してください（エージェントはDBを直接操作しません）。

-- 1. プレイヤーが GM 可能なシナリオ ID 配列
ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS gmable_scenario_ids text[] DEFAULT '{}';

-- 2. 気になる（シナリオ × プレイヤー）
CREATE TABLE IF NOT EXISTS public.scenario_interests (
  player_id text NOT NULL REFERENCES public.players(player_id) ON DELETE CASCADE,
  scenario_id text NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, scenario_id)
);

CREATE INDEX IF NOT EXISTS scenario_interests_scenario_id_idx
  ON public.scenario_interests (scenario_id);

ALTER TABLE public.scenario_interests ENABLE ROW LEVEL SECURITY;

-- 件数表示のため SELECT は公開。書込は本人の player 行のみ。
DROP POLICY IF EXISTS fctzs_scenario_interests_public_select ON public.scenario_interests;
CREATE POLICY fctzs_scenario_interests_public_select ON public.scenario_interests
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS fctzs_scenario_interests_owner_insert ON public.scenario_interests;
CREATE POLICY fctzs_scenario_interests_owner_insert ON public.scenario_interests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.players AS p
      WHERE p.player_id = scenario_interests.player_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS fctzs_scenario_interests_owner_delete ON public.scenario_interests;
CREATE POLICY fctzs_scenario_interests_owner_delete ON public.scenario_interests
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players AS p
      WHERE p.player_id = scenario_interests.player_id
        AND p.user_id = auth.uid()
    )
  );

-- Worker の Service Role 経由書込用に、必要なら Grants を確認してください。
GRANT SELECT ON public.scenario_interests TO anon, authenticated;
GRANT INSERT, DELETE ON public.scenario_interests TO authenticated;
