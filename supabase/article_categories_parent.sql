-- article_categories に親カテゴリー参照を追加 (大カテゴリー > 小カテゴリーの階層対応)
-- Supabase ダッシュボードの SQL Editor で実行してください

ALTER TABLE article_categories
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES article_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_article_categories_parent_id
  ON article_categories(parent_id);
