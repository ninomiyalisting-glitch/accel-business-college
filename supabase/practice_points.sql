-- =============================================
-- 実務従事更新ポイント獲得履歴
-- =============================================
-- 各メンバーが自分の実務従事を記録し、年ごとの獲得ポイントを集計する。
--
-- 【重要】このアプリはブラウザから anon キーで Supabase を直接読んでいる。
-- Supabase Auth を使っていないため RLS の中で auth.uid() が使えず、
-- 「本人かどうか」を RLS で判定できない。
-- そのため書き込みは service_role のみに許可し、本人判定は
-- /api/practice-points（署名済み Cookie を検証）で行う。
-- ここを anon に開けると、誰でも他人の履歴を書き換えられるので開けないこと。

CREATE TABLE IF NOT EXISTS practice_points (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slack_user_id TEXT NOT NULL,

  activity     TEXT NOT NULL,               -- 活動内容
  worked_on    DATE NOT NULL,               -- 稼働日
  worked_note  TEXT,                        -- 稼働日の補足（「6/1〜6/3」等）
  points       SMALLINT NOT NULL,           -- 獲得ポイント数 1〜30

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 記入日（自動）
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT practice_points_points_range CHECK (points BETWEEN 1 AND 30),
  CONSTRAINT practice_points_activity_len CHECK (char_length(activity) BETWEEN 1 AND 500),
  CONSTRAINT practice_points_note_len CHECK (worked_note IS NULL OR char_length(worked_note) <= 200)
);

-- 一覧は「本人の履歴を稼働日の新しい順」で引くのでこの順で並べる
CREATE INDEX IF NOT EXISTS idx_practice_points_user_worked
  ON practice_points (slack_user_id, worked_on DESC);

-- 年間集計用
CREATE INDEX IF NOT EXISTS idx_practice_points_user_year
  ON practice_points (slack_user_id, (EXTRACT(YEAR FROM worked_on)));

-- updated_at の自動更新
CREATE OR REPLACE FUNCTION set_practice_points_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_practice_points_updated_at ON practice_points;
CREATE TRIGGER trg_practice_points_updated_at
  BEFORE UPDATE ON practice_points
  FOR EACH ROW EXECUTE FUNCTION set_practice_points_updated_at();

-- =============================================
-- RLS
-- =============================================
ALTER TABLE practice_points ENABLE ROW LEVEL SECURITY;

-- 閲覧はメンバー全員に開ける（詳細ページに表として出す）
DROP POLICY IF EXISTS "practice_points_select_all" ON practice_points;
CREATE POLICY "practice_points_select_all"
  ON practice_points FOR SELECT
  TO anon, authenticated
  USING (true);

-- 書き込みは service_role だけ。本人判定は API 側で行う。
DROP POLICY IF EXISTS "practice_points_insert_service" ON practice_points;
CREATE POLICY "practice_points_insert_service"
  ON practice_points FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "practice_points_update_service" ON practice_points;
CREATE POLICY "practice_points_update_service"
  ON practice_points FOR UPDATE
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "practice_points_delete_service" ON practice_points;
CREATE POLICY "practice_points_delete_service"
  ON practice_points FOR DELETE
  TO service_role
  USING (true);
