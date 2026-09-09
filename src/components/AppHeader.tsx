'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, X, LogOut, Settings, Sparkles, Search } from 'lucide-react'
import Avatar from './Avatar'

/**
 * 全ページ共通のヘッダー。
 *
 * 1 行目 … ハンバーガー（スマホのみ）／ アイコン＋サイト名（ホームへ）
 *          ／ グローバルナビ（PC のみ）／ 右端にユーザーアイコンとログアウト
 * 2 行目 … 画面の見出し。薄いグレーの帯。1 行目と同じ横幅に揃える
 *
 * 各ページが持っていた独自ヘッダー（戻るリンク＋17px の見出し）は
 * この 2 行目に統合したので、ページ側では出さないこと。
 */

const SLACK_USER_KEY = 'abc_slackUser'
const USER_NAME_KEY = 'abc_userName'

// PC のグローバルナビ（GLOBAL_NAV）と、スマホの全画面メニュー（NAV）。
// 「ホーム」は入れない。左のアイコンとサイト名がホームへのリンクなので重複する。
// 「AI に聞く」は他と性質が違うので一番右に置く。
const GLOBAL_NAV = [
  { href: '/chat', label: 'チャット' },
  { href: '/videos', label: '動画' },
  { href: '/events', label: 'イベント' },
  { href: '/members', label: 'メンバー' },
  { href: '/articles', label: 'ガイド' },
  { href: '/ai-chat', label: 'AI に聞く' },
]

// スマホのメニューは一覧性が要るので、ホームと残りも並べる
const NAV = [
  { href: '/dashboard', label: 'ホーム' },
  { href: '/chat', label: 'チャット' },
  { href: '/videos', label: '動画' },
  { href: '/events', label: 'イベント' },
  { href: '/members', label: 'メンバー' },
  { href: '/articles', label: 'ガイド' },
  { href: '/ideas', label: 'アイデア' },
  { href: '/gallery', label: 'ギャラリー' },
  { href: '/ai-chat', label: 'AI に聞く' },
  { href: '/settings', label: '設定' },
]

/**
 * 見出し。長いプレフィックスを先に置く（/videos/manage が /videos より先）。
 * action を持つ画面は、見出しの右にそのリンクが出る。
 */
const TITLES: { prefix: string; title: string; action?: { href: string; label: string } }[] = [
  { prefix: '/dashboard', title: 'ホーム' },
  { prefix: '/videos/manage', title: '動画の管理' },
  { prefix: '/videos', title: '動画ライブラリ', action: { href: '/videos/manage', label: '管理' } },
  { prefix: '/events/new', title: 'イベントの作成' },
  { prefix: '/events', title: '日程調整' },
  { prefix: '/members/edit', title: 'プロフィールの編集' },
  { prefix: '/members', title: 'メンバー' },
  { prefix: '/articles/new', title: '記事の作成' },
  { prefix: '/articles', title: 'ナレッジベース' },
  { prefix: '/ideas', title: 'アイデア' },
  { prefix: '/gallery', title: 'ギャラリー' },
  { prefix: '/ai-chat', title: 'AI に聞く' },
  { prefix: '/settings', title: '設定' },
  { prefix: '/admin', title: '管理画面' },
]

// ランディングだけ独自の作りなので出さない。
// チャットにも出す。h-full で高さを使う画面なので、
// globals.css 側でヘッダーとフッターの分を差し引いている。
const HIDE_ON = ['/', '/auth/error']

type SlackUser = { avatar_url?: string | null }

export default function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [name, setName] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SLACK_USER_KEY)
      if (raw) setAvatar((JSON.parse(raw) as SlackUser).avatar_url ?? null)
      setName(localStorage.getItem(USER_NAME_KEY) ?? '')
    } catch {
      /* 表示だけなので失敗しても無視 */
    }
  }, [])

  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (HIDE_ON.some((p) => (p === '/' ? pathname === '/' : pathname.startsWith(p)))) {
    return null
  }

  const entry = TITLES.find((t) => pathname.startsWith(t.prefix))
  const heading = entry?.title ?? ''
  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

  function logout() {
    try {
      localStorage.removeItem(SLACK_USER_KEY)
      localStorage.removeItem(USER_NAME_KEY)
    } catch { /* ignore */ }
    router.push('/')
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 app-header-safe">
        <div className="max-w-content mx-auto px-3 sm:px-4 h-16 flex items-center gap-2">
          <button
            onClick={() => setOpen(true)}
            aria-label="メニューを開く"
            className="lg:hidden flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-accel-dark hover:bg-accel-lightest transition-colors"
          >
            <Menu size={26} />
          </button>

          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0 group">
            <Image src="/icon-192x192.png" alt="" width={36} height={36} className="rounded-xl flex-shrink-0" />
            <span className="text-[16px] sm:text-[17px] font-bold text-accel-dark group-hover:text-accel-active transition-colors truncate">
              アクセルビジネスカレッジ
            </span>
          </Link>

          <nav className="ml-auto hidden lg:flex items-center gap-0.5">
            {GLOBAL_NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-2 rounded-xl text-[15px] transition-colors whitespace-nowrap ${
                  isActive(href)
                    ? 'bg-accel-lightest text-accel-active font-bold'
                    : 'text-gray-600 font-medium hover:bg-accel-lightest/60 hover:text-accel-active'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* チャットの操作。スマホではチャンネル帯に入り切らないので
              ここに置く。検索はチャット画面の状態を開くため、
              カスタムイベントで知らせる（props で渡せない位置にあるため）。 */}
          {pathname.startsWith('/chat') && (
            <div className="ml-auto lg:ml-3 flex items-center gap-0.5 flex-shrink-0">
              <Link
                href="/ai-chat"
                title="AIアシスタント"
                className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-500 hover:text-accel-active hover:bg-accel-lightest transition-colors"
              >
                <Sparkles size={20} />
              </Link>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('abc:open-chat-search'))}
                title="検索"
                aria-label="検索"
                className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-500 hover:text-accel-active hover:bg-accel-lightest transition-colors"
              >
                <Search size={20} />
              </button>
            </div>
          )}

          {/* ユーザーアイコンとログアウト。各ページのヘッダーから 1 行目に移した */}
          <div className={`flex items-center gap-1 flex-shrink-0 ${pathname.startsWith('/chat') ? 'ml-1' : 'ml-auto lg:ml-3'}`}>
            <Link href="/settings" title="設定" className="block hover:opacity-80 transition-opacity">
              <Avatar src={avatar} name={name} size={36} className="ring-2 ring-transparent hover:ring-accel-light transition-all" />
            </Link>
            <button
              onClick={logout}
              title="ログアウト"
              aria-label="ログアウト"
              className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* 見出しの帯。薄いグレー。横幅はヘッダーと揃える */}
        {heading && (
          <div className="bg-gray-50 border-t border-gray-100">
            <div className="max-w-content mx-auto px-4 py-4 flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>
              {entry?.action && (
                <Link
                  href={entry.action.href}
                  className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-bold hover:bg-accel-lightest hover:border-accel-light hover:text-accel-active transition-colors"
                >
                  <Settings size={15} />
                  {entry.action.label}
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      {open && (
        <div className="fixed inset-0 z-[60] bg-white flex flex-col lg:hidden pb-[env(safe-area-inset-bottom)]">
          <div className="app-header-safe border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center gap-2 px-3 h-16">
            <button
              onClick={() => setOpen(false)}
              aria-label="メニューを閉じる"
              className="w-11 h-11 rounded-xl flex items-center justify-center text-accel-dark hover:bg-accel-lightest transition-colors"
            >
              <X size={26} />
              </button>
              <span className="text-[17px] font-bold text-accel-dark">メニュー</span>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto py-2">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center px-6 py-4 text-lg border-b border-gray-50 transition-colors ${
                  isActive(href)
                    ? 'bg-accel-lightest text-accel-active font-bold'
                    : 'text-gray-800 font-medium active:bg-accel-lightest/50'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  )
}
