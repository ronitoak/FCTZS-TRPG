-- 募集機能拡張: 人数レンジ・期限・先着/抽選
-- Supabase Dashboard の SQL Editor で実行してください（エージェントはDBを直接操作しません）。

-- 1. 募集テーブル拡張
ALTER TABLE public.recruitments
  ADD COLUMN IF NOT EXISTS min_count integer NOT NULL DEFAULT 1;

ALTER TABLE public.recruitments
  ADD COLUMN IF NOT EXISTS deadline timestamptz;

ALTER TABLE public.recruitments
  ADD COLUMN IF NOT EXISTS selection_mode text NOT NULL DEFAULT 'first_come';

ALTER TABLE public.recruitments
  ADD COLUMN IF NOT EXISTS lottery_drawn_at timestamptz;

-- 既存行: 期限が空なら作成日から1ヶ月（移行用）
UPDATE public.recruitments
SET deadline = COALESCE(created_at, now()) + interval '1 month'
WHERE deadline IS NULL;

ALTER TABLE public.recruitments
  ALTER COLUMN deadline SET NOT NULL;

-- 下限は上限以下
ALTER TABLE public.recruitments
  DROP CONSTRAINT IF EXISTS recruitments_min_le_target;
ALTER TABLE public.recruitments
  ADD CONSTRAINT recruitments_min_le_target
  CHECK (min_count >= 1 AND min_count <= target_count);

ALTER TABLE public.recruitments
  DROP CONSTRAINT IF EXISTS recruitments_selection_mode_check;
ALTER TABLE public.recruitments
  ADD CONSTRAINT recruitments_selection_mode_check
  CHECK (selection_mode IN ('first_come', 'lottery'));

-- 2. 応募テーブル: 抽選結果
ALTER TABLE public.recruitment_applicants
  ADD COLUMN IF NOT EXISTS is_selected boolean;

-- 3. 一覧ビュー更新
-- CREATE OR REPLACE では列の挿入・並べ替えができないため、一度 DROP して作り直す。
DROP VIEW IF EXISTS public.recruitment_list;

CREATE VIEW public.recruitment_list
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
  r.min_count,
  r.deadline,
  r.selection_mode,
  r.lottery_drawn_at,
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
  r.min_count,
  r.deadline,
  r.selection_mode,
  r.lottery_drawn_at,
  r.memo,
  r.status,
  r.created_at;
