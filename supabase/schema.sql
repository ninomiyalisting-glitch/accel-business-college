-- =============================================
-- アクセルビジネスカレッジ - Supabase スキーマ
-- =============================================

-- チャンネルテーブル
CREATE TABLE IF NOT EXISTS channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- メッセージテーブル
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL DEFAULT 'ゲスト',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- =============================================
-- Row Level Security (RLS) 設定
-- =============================================

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- チャンネル: 誰でも閲覧可能
CREATE POLICY "channels_select_all"
  ON channels FOR SELECT
  TO anon, authenticated
  USING (true);

-- メッセージ: 誰でも閲覧可能
CREATE POLICY "messages_select_all"
  ON messages FOR SELECT
  TO anon, authenticated
  USING (true);

-- メッセージ: 誰でも投稿可能 (匿名ユーザーも含む)
CREATE POLICY "messages_insert_all"
  ON messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- =============================================
-- Realtime 有効化
-- =============================================

-- Supabase ダッシュボードの "Database > Replication" で
-- messages テーブルの Realtime を有効にしてください。
-- または以下のコマンドを実行:
-- ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- =============================================
-- サンプルデータ
-- =============================================

INSERT INTO channels (name, description) VALUES
  ('general', '一般的な話題・自己紹介など'),
  ('announce', '重要なお知らせ・連絡事項'),
  ('business', 'ビジネス・起業に関する話題'),
  ('marketing', 'マーケティング・集客の話題'),
  ('random', '雑談・気軽に話せる場所')
ON CONFLICT (name) DO NOTHING;
