-- 部活外の通過シナリオ（個人履歴）
-- Supabase Dashboard の SQL Editor で実行してください。

ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS external_passed_scenarios jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.player_profiles.external_passed_scenarios IS
  '部活外で通過したシナリオの個人履歴 [{id,title,system,note}, ...]（scenarios マスタには載せない）';
