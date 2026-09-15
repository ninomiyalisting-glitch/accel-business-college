import { Globe, Instagram } from 'lucide-react'
import { SOCIAL_SERVICES, toUrl, type SocialFields, type SocialKey } from '@/lib/socialLinks'

/** ボタンの色。Tailwind が走査するこのファイルに置く（lib に書くと CSS が生成されない） */
const TONE: Record<SocialKey, string> = {
  x_url: 'bg-gray-900 text-white hover:bg-gray-700',
  note_url: 'bg-[#41c9b4] text-white hover:bg-[#2fb19d]',
  instagram_url: 'bg-[#d6336c] text-white hover:bg-[#b02a5b]',
  website_url: 'bg-accel-text text-white hover:bg-accel-primary',
}

/**
 * メンバーの SNS・外部リンクをボタンで並べる。
 * リンクが 1 件も無ければ何も出さない。
 * size='sm' はメンバー一覧のカード用、既定はメンバーページ用。
 */
export default function SocialButtons({
  fields,
  size = 'md',
  className = '',
}: {
  fields: SocialFields | null | undefined
  size?: 'sm' | 'md'
  className?: string
}) {
  const links = SOCIAL_SERVICES.map((s) => ({ service: s, url: toUrl(s, fields?.[s.key]) })).filter(
    (l): l is { service: (typeof SOCIAL_SERVICES)[number]; url: string } => l.url !== null
  )
  if (links.length === 0) return null

  const pad = size === 'sm' ? 'h-7 px-2.5 text-xs gap-1' : 'h-9 px-3.5 text-sm gap-1.5'
  const icon = size === 'sm' ? 13 : 15

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {links.map(({ service, url }) => (
        <a
          key={service.key}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={`${service.label} を開く`}
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center rounded-full font-bold transition-colors ${pad} ${TONE[service.key]}`}
        >
          {iconFor(service.key, icon)}
          {service.label}
        </a>
      ))}
    </div>
  )
}

function iconFor(key: SocialKey, size: number) {
  switch (key) {
    case 'instagram_url':
      return <Instagram size={size} />
    case 'website_url':
      return <Globe size={size} />
    default:
      return null
  }
}
