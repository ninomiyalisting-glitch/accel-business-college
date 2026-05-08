'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, MessageSquare, Video, CalendarDays, Users, BookOpen } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'HOME' },
  { href: '/chat', icon: MessageSquare, label: 'チャット' },
  { href: '/videos', icon: Video, label: '動画' },
  { href: '/events', icon: CalendarDays, label: 'イベント' },
  { href: '/members', icon: Users, label: 'メンバー' },
  { href: '/articles', icon: BookOpen, label: 'ガイド' },
]

const LAST_CHAT_KEY = 'abc_lastChatVisit'
const APP_TITLE = 'アクセルビジネスカレッジ'

function setBadge(n: number) {
  if (typeof navigator === 'undefined') return
  if ('setAppBadge' in navigator) {
    const nav = navigator as Navigator & { setAppBadge: (n?: number) => Promise<void>; clearAppBadge: () => Promise<void> }
    if (n > 0) nav.setAppBadge(n).catch(() => {})
    else nav.clearAppBadge().catch(() => {})
  }
}

export default function BottomNav() {
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)

  // Initialize last-chat-visit on first render
  useEffect(() => {
    if (!localStorage.getItem(LAST_CHAT_KEY)) {
      localStorage.setItem(LAST_CHAT_KEY, new Date().toISOString())
    }
  }, [])

  useEffect(() => {
    // On chat page: reset unread count and record last visit time
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

    return () => { supabase.removeChannel(sub) }
  }, [pathname])

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a1d23] pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-14">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active =
            href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(href)
          const isChat = href === '/chat'
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-[#60a5fa]' : 'text-white/50 hover:text-white/80'
              }`}
            >
              <div className="relative">
                <Icon size={17} strokeWidth={active ? 2.5 : 1.75} />
                {isChat && unread > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-[13px] h-[13px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </div>
              <span className={`text-[9px] font-medium ${active ? 'text-[#60a5fa]' : 'text-white/50'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
