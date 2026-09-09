-- =============================================
-- イベント機能の拡張（2026-09-09）
-- =============================================
-- 追加するもの
--   category           勉強会 / 食事会 / レジャー / その他
--   confirmed_date     開催日。すでにカラムはあるので型だけ確認
--   created_by_avatar  作成者のアイコン（毎回 users を引かずに済むよう保持）
--
-- 一覧は「調整中 / 開催日決定 / 終了」の 3 つに分ける。判定は
--   終了       … confirmed_date が過去
--   開催日決定 … confirmed_date が未来
--   調整中     … confirmed_date が null
-- なので confirmed_date に索引を張る。

ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by_avatar TEXT;

-- カテゴリーは 4 つに限定する。表記ゆれが入ると絞り込みが壊れる。
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_category_check;
ALTER TABLE events ADD CONSTRAINT events_category_check
  CHECK (category IS NULL OR category IN ('勉強会', '食事会', 'レジャー', 'その他'));

-- 既存データは「その他」にしておく（null のままだと絞り込みで漏れる）
UPDATE events SET category = 'その他' WHERE category IS NULL;

-- 一覧の 3 分割と並び替えのため
CREATE INDEX IF NOT EXISTS idx_events_confirmed_date ON events (confirmed_date);
CREATE INDEX IF NOT EXISTS idx_events_category ON events (category);

-- 確認
SELECT
  count(*)                                            AS イベント数,
  count(confirmed_date)                               AS 開催日が決まっている数,
  count(*) FILTER (WHERE confirmed_date < NOW())       AS 終了した数,
  count(*) FILTER (WHERE confirmed_date >= NOW())      AS 開催予定の数,
  count(*) FILTER (WHERE confirmed_date IS NULL)       AS 調整中の数;
