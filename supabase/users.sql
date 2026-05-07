-- =============================================
-- users テーブル (Slack OAuth ログイン用)
-- =============================================

CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slack_user_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  slack_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_slack_user_id ON users(slack_user_id);
CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name);

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 誰でも閲覧可能（アバター表示に使用）
CREATE POLICY "users_select_all"
  ON users FOR SELECT
  TO anon, authenticated
  USING (true);

-- service_role のみ INSERT/UPDATE 可能（OAuth コールバックで使用）
CREATE POLICY "users_insert_service"
  ON users FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "users_update_service"
  ON users FOR UPDATE
  TO service_role
  USING (true);
