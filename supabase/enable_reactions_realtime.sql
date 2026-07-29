-- message_reactions テーブルを Supabase Realtime の対象に追加
-- DELETE イベントで完全な旧行データを取得するため REPLICA IDENTITY FULL を設定

ALTER TABLE message_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
  END IF;
END $$;
