'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/**
 * スマホ用の固定フッター。
 *
 * ブルー（#007CB4）に白文字。アイコンは出さない。
 * 白背景だと本文との境界が分からなかったので、面の色で区切る。
 * 指定色 #0097DB は白文字が 3.26:1 で本文サイズの基準に届かないため、
 * 同じ色味で明度を下げた #007CB4（4.62:1）を使っている。明るくしないこと。
 *
 * PC ではヘッダーのグローバルナビが担うので lg 以上で隠す。
 */

const NAV_ITEMS = [
  { href: '/dashboard', label: 'ホーム' },
  { href: '/chat', label: 'チャット' },
  { href: '/videos', label: '動画' },
  { href: '/events', label: 'イベント' },
  { href: '/members', label: 'メンバー' },
  { href: '/articles', label: 'ガイド' },
]

const LAST_CHAT_KEY = 'abc_lastChatVisit'
const APP_TITLE = 'アクセルビジネスカレッジ'

function setBadge(n: number) {
  if (typeof navigator === 'undefined') return
  if ('setAppBadge' in navigator) {
    const nav = navigator as Navigator & {
      setAppBadge: (n?: number) => Promise<void>
      clearAppBadge: () => Promise<void>
    }
    if (n > 0) nav.setAppBadge(n).catch(() => {})
    else nav.clearAppBadge().catch(() => {})
  }
}

export default function BottomNav() {
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!localStorage.getItem(LAST_CHAT_KEY)) {
      localStorage.setItem(LAST_CHAT_KEY, new Date().toISOString())
    }
  }, [])

  useEffect(() => {
    if (pathname.startsWith('/chat')) {
      localStorage.setItem(LAST_CHAT_KEY, new Date().toISOString())
      setUnread(0)
      document.title = APP_TITLE
      setBadge(0)
      return
    }

    const lastVisit = localStorage.getItem(LAST_CHAT_KEY)
    if (!lastVisit) return

    const fetchUnread = async () => {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .gt('created_at', lastVisit)
      const n = Math.min(count ?? 0, 99)
      setUnread(n)
      document.title = n > 0 ? `(${n}) ${APP_TITLE}` : APP_TITLE
      setBadge(n)
    }

    fetchUnread()

    const sub = supabase
      .channel('unread-count')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, fetchUnread)
      .subscribe()

    return () => {
      supabase.removeChannel(sub)
    }
  }, [pathname])

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-footer pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.15)] lg:hidden">
      <div className="flex h-16">
        {NAV_ITEMS.map(({ href, label }) => {
          const active =
            href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)
          const isChat = href === '/chat'
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex-1 flex items-center justify-center transition-colors ${
                active ? 'bg-footer-dark font-bold' : 'active:bg-footer-dark/60'
              }`}
            >
              <span className="text-[15px] text-white tracking-tight whitespace-nowrap">
                {label}
              </span>
              {isChat && unread > 0 && (
                <span className="absolute top-2 right-1/2 translate-x-[2.2rem] min-w-[20px] h-[20px] bg-red-600 text-white text-[11px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
              {active && (
                <span className="absolute top-0 left-0 right-0 h-[3px] bg-white" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
