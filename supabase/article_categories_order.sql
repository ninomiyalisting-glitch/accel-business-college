-- =====================================================================
-- ビジカレnote：カテゴリーの並び順と、用途の指定
-- 何度実行しても安全です。
-- =====================================================================

-- ── 並び順 ────────────────────────────────────────────────────
-- 名前順だと運用側で順番を決められない。管理画面の上下ボタンで
-- 入れ替えた結果をここに持つ。
ALTER TABLE article_categories
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 既存行は現在の見え方（名前順）をそのまま初期値にする。
-- これをしないと全部 0 になり、並びが不定になる。
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY COALESCE(parent_id::text, '')
    ORDER BY name
  ) AS rn
  FROM article_categories
)
UPDATE article_categories c
SET sort_order = n.rn * 10
FROM numbered n
WHERE c.id = n.id AND c.sort_order = 0;

CREATE INDEX IF NOT EXISTS idx_article_categories_sort
  ON article_categories(parent_id, sort_order);

-- ── 用途 ──────────────────────────────────────────────────────
-- ダッシュボードの「メンバーコンテンツ」「使い方ガイド」を
-- どのカテゴリーから出すかを、コードではなく運用側で決められるようにする。
-- 値は 'member' / 'guide' / NULL のいずれか。
ALTER TABLE article_categories
  ADD COLUMN IF NOT EXISTS role TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'article_categories_role_check'
  ) THEN
    ALTER TABLE article_categories
      ADD CONSTRAINT article_categories_role_check
      CHECK (role IS NULL OR role IN ('member', 'guide'));
  END IF;
END $$;

-- 同じ用途を2つのカテゴリーに割り当てると、どちらを出すか決まらない。
-- 部分索引で「用途ごとに1つまで」を保証する。
CREATE UNIQUE INDEX IF NOT EXISTS idx_article_categories_role_unique
  ON article_categories(role) WHERE role IS NOT NULL;
