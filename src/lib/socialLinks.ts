/**
 * メンバープロフィールの SNS・外部リンク。
 *
 * member_profiles の x_url / note_url / instagram_url / website_url を扱う。
 * 入力は URL でも ID（@付き可）でもよく、toUrl() でリンク先に直す。
 * 列を足すときはここに 1 行足して、supabase/member_profiles_social.sql にも列を追加する。
 * ボタンの色は components/SocialButtons.tsx 側に置く（Tailwind が src/lib を走査しないため、
 * ここにクラス名を書いても CSS が生成されない）。
 */

export type SocialKey = 'x_url' | 'note_url' | 'instagram_url' | 'website_url'

export interface SocialService {
  key: SocialKey
  label: string
  placeholder: string
  /** ID だけ入力されたときに付ける URL の先頭 */
  base: string | null
}

export const SOCIAL_SERVICES: SocialService[] = [
  {
    key: 'x_url',
    label: 'X',
    placeholder: '例：https://x.com/xxxx または @xxxx',
    base: 'https://x.com/',
  },
  {
    key: 'note_url',
    label: 'note',
    placeholder: '例：https://note.com/xxxx',
    base: 'https://note.com/',
  },
  {
    key: 'instagram_url',
    label: 'Instagram',
    placeholder: '例：https://www.instagram.com/xxxx または @xxxx',
    base: 'https://www.instagram.com/',
  },
  {
    key: 'website_url',
    label: 'Web',
    placeholder: '例：https://example.com',
    base: null,
  },
]

export type SocialFields = Partial<Record<SocialKey, string | null>>

/** 入力値をリンク先 URL に直す。空なら null */
export function toUrl(service: SocialService, raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  // 「x.com/xxxx」のようにスキームだけ無いもの
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return `https://${v}`
  if (service.base) return service.base + v.replace(/^@/, '')
  return `https://${v}`
}

/** 1 件でもリンクが入っているか */
export function hasAnySocial(fields: SocialFields | null | undefined): boolean {
  if (!fields) return false
  return SOCIAL_SERVICES.some((s) => toUrl(s, fields[s.key]) !== null)
}
