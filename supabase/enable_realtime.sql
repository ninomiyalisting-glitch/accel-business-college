-- messagesテーブルをSupabase Realtimeの対象に追加
-- Supabase ダッシュボード > SQL Editor で実行してください
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
