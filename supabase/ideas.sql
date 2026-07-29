-- =============================================
-- ネタ帳機能 (2026-05-19)
-- =============================================

CREATE TABLE IF NOT EXISTS ideas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_slack_user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'ネタ',
  images JSONB,
  ai_column TEXT,
  ai_script TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS idea_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  user_slack_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  reaction TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(idea_id, user_slack_id, reaction)
);

CREATE TABLE IF NOT EXISTS idea_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  author_slack_user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idea_reactions_idea_id ON idea_reactions(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_comments_idea_id ON idea_comments(idea_id);

ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE idea_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE idea_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all" ON ideas;
DROP POLICY IF EXISTS "all" ON idea_reactions;
DROP POLICY IF EXISTS "all" ON idea_comments;

CREATE POLICY "all" ON ideas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "all" ON idea_reactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "all" ON idea_comments FOR ALL USING (true) WITH CHECK (true);

-- Realtime: Add to publication (Supabase Dashboard でも可)
-- ALTER PUBLICATION supabase_realtime ADD TABLE ideas;
-- ALTER PUBLICATION supabase_realtime ADD TABLE idea_reactions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE idea_comments;
