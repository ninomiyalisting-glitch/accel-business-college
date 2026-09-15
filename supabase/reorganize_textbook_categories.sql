-- 「診断士合格後の教科書」の整理。
--  1. 未分類（category_id が NULL）の記事をすべて「診断士合格後の教科書」に入れる
--  2. 「診断士合格後の教科書」の小カテゴリーの記事を親へ移し、小カテゴリーを削除する
-- 記事は 1 件も消えない。実行前後の件数を最後に返す。

BEGIN;

-- 親カテゴリーの ID を名前から取る（ID の貼り間違いを防ぐ）
CREATE TEMP TABLE _parent AS
SELECT id FROM article_categories
WHERE name = '診断士合格後の教科書' AND parent_id IS NULL
LIMIT 1;

-- 1. 未分類 → 教科書
UPDATE articles
SET category_id = (SELECT id FROM _parent)
WHERE category_id IS NULL;

-- 2a. 小カテゴリーの記事 → 教科書
UPDATE articles
SET category_id = (SELECT id FROM _parent)
WHERE category_id IN (
  SELECT id FROM article_categories WHERE parent_id = (SELECT id FROM _parent)
);

-- 2b. 小カテゴリーを削除
DELETE FROM article_categories
WHERE parent_id = (SELECT id FROM _parent);

COMMIT;

-- 確認：教科書の記事数と、残っている未分類の件数（0 のはず）
SELECT
  (SELECT count(*) FROM articles WHERE category_id = (SELECT id FROM article_categories WHERE name = '診断士合格後の教科書' AND parent_id IS NULL)) AS textbook_articles,
  (SELECT count(*) FROM articles WHERE category_id IS NULL) AS uncategorized_left,
  (SELECT count(*) FROM article_categories WHERE parent_id = (SELECT id FROM article_categories WHERE name = '診断士合格後の教科書' AND parent_id IS NULL)) AS children_left;
