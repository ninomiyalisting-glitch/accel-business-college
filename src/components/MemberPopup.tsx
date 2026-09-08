'use client'

import Image from 'next/image'
import Link from 'next/link'
import { X, MessageCircle, UserCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

const SLACK_TEAM_ID = 'T058E88UB40'

function getAvatarColor(name: string): string {
  const colors = [
    'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500',
    'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500',
    'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500',
    'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export interface MemberInfo {
  displayName: string
  avatarUrl?: string | null
  slackUserId?: string | null
}

interface Props {
  member: MemberInfo
  onClose: () => void
}

export default function MemberPopup({ member, onClose }: Props) {
  const [avatarError, setAvatarError] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const dmLink = member.slackUserId
    ? `slack://user?team=${SLACK_TEAM_ID}&id=${member.slackUserId}`
    : null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />

      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl border border-gray-100 w-64 overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={15} />
        </button>

        <div className="bg-gradient-to-b from-[#279300]/10 to-white pt-8 pb-4 flex justify-center">
          {member.avatarUrl && !avatarError ? (
            <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-md ring-4 ring-white">
              <Image
                src={member.avatarUrl}
                alt={member.displayName}
                width={80}
                height={80}
                className="w-full h-full object-cover"
                onError={() => setAvatarError(true)}
              />
            </div>
          ) : (
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-md ring-4 ring-white ${getAvatarColor(member.displayName)}`}>
              {member.displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 text-center space-y-2">
          <h3 className="font-bold text-gray-900 text-base leading-snug break-words">{member.displayName}</h3>

          {member.slackUserId && (
            <Link
              href={`/members/${member.slackUserId}`}
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 w-full px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-sm font-medium transition-colors border border-gray-200"
            >
              <UserCircle size={14} />
              詳細プロフィール
            </Link>
          )}

          {dmLink ? (
            <a
              href={dmLink}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-slack-brand hover:bg-slack-brandDark text-white rounded-xl text-sm font-medium transition-colors"
            >
              <MessageCircle size={15} />
              Slackでメッセージを送る
            </a>
          ) : (
            <p className="text-xs text-gray-400">Slackユーザー情報なし</p>
          )}
        </div>
      </div>
    </>
  )
}
