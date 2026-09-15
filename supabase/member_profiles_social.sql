-- メンバープロフィールに SNS・外部リンクの列を足す。
-- 何度実行しても壊れない（IF NOT EXISTS）。
-- 列を増やすときは src/lib/socialLinks.ts の SOCIAL_SERVICES も揃えること。

ALTER TABLE member_profiles ADD COLUMN IF NOT EXISTS x_url TEXT;
ALTER TABLE member_profiles ADD COLUMN IF NOT EXISTS note_url TEXT;
ALTER TABLE member_profiles ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE member_profiles ADD COLUMN IF NOT EXISTS website_url TEXT;
