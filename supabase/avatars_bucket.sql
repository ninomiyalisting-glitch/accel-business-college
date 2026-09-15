-- プロフィール写真の保存先。
-- アップロードはサーバー（service_role）だけが行うので、書き込みポリシーは不要。
-- 公開バケットにして、URL で誰でも閲覧できるようにする。

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- アプリで設定した写真。Slack の写真より優先して表示に使う。
ALTER TABLE member_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
