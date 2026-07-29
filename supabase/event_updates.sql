-- =============================================
-- 日程調整機能の拡張 (2026-05-18)
-- =============================================

-- 終了時間カラム
ALTER TABLE event_dates ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;

-- イベントカバー画像URL
ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- 回答者アバターURL (キャッシュ用)
ALTER TABLE event_responses ADD COLUMN IF NOT EXISTS avatar_url TEXT;
