'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { MessageSquare, Video, Users, ArrowRight, Hash, LogOut, ImageIcon, CalendarDays, Sparkles, CheckCircle2, Clock, ChevronRight, BookOpen } from 'lucide-react'
import { SlackUser, Message, Channel } from '@/types'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

const SLACK_USER_KEY = 'abc_slackUser'
const USER_NAME_KEY = 'abc_userName'

interface VimeoVideo {
  uri: string
  name: string
  duration: number
  created_time: string
  pictures: { sizes: { width: number; link: string }[] }
}

function getThumbnail(pictures: VimeoVideo['pictures']): string {
  const sizes = pictures?.sizes ?? []
  if (sizes.length === 0) return ''
  const suited = sizes.filter((s) => s.width <= 640)
  return (suited.length > 0 ? suited[suited.length - 1] : sizes[sizes.length - 1]).link
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function DashboardPage() {
  const router = useRouter()
  const [slackUser, setSlackUser] = useState<SlackUser | null>(null)
  const [userName, setUserName] = useState<string>('')
  const [recentMessages, setRecentMessages] = useState<(Message & { channel_name?: string })[]>([])
  const [channelMap, setChannelMap] = useState<Record<string, string>>({})
  const [recentVideos, setRecentVideos] = useState<VimeoVideo[]>([])
  const [memberCount, setMemberCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [recentEvents, setRecentEvents] = useState<{
    id: string
    title: string
    deadline: string | null
    confirmed_date: string | null
    created_at: string
    date_count: number
    response_count: number
    dates: { id: string; date: string }[]
  }[]>([])
  const [articleCategories, setArticleCategories] = useState<{
    id: string
    name: string
    color: string
    count: number
  }[]>([])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SLACK_USER_KEY)
      if (saved) {
        const user: SlackUser = JSON.parse(saved)
        setSlackUser(user)
        setUserName(user.display_name)
      } else {
        const name = localStorage.getItem(USER_NAME_KEY) ?? ''
        setUserName(name)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      // Fetch channels for name lookup
      const { data: channels } = await supabase
        .from('channels')
        .select('id, name')
        .eq('is_hidden', false)
      const cmap: Record<string, string> = {}
      for (const c of channels ?? []) cmap[c.id] = c.name
      setChannelMap(cmap)

      // Fetch latest 3 messages across all visible channels
      const channelIds = Object.keys(cmap)
      if (channelIds.length > 0) {
        const { data: msgs } = await supabase
          .from('messages')
          .select('*')
          .in('channel_id', channelIds)
          .order('created_at', { ascending: false })
          .limit(3)
        setRecentMessages(msgs ?? [])
      }

      // Fetch member count
      const { count } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
      setMemberCount(count ?? null)

      // Fetch recent events with date/response counts
      const { data: eventsData } = await supabase
        .from('events')
        .select('id, title, deadline, confirmed_date, created_at')
        .order('created_at', { ascending: false })
        .limit(10)

      if (eventsData && eventsData.length > 0) {
        const eventIds = eventsData.map((e) => e.id)
        const [datesRes, responsesRes] = await Promise.all([
          supabase.from('event_dates').select('event_id, id, date').in('event_id', eventIds).order('date'),
          supabase.from('event_responses').select('event_id, responder_name').in('event_id', eventIds),
        ])
        const datesByEvent: Record<string, { id: string; date: string }[]> = {}
        for (const d of datesRes.data ?? []) {
          if (!datesByEvent[d.event_id]) datesByEvent[d.event_id] = []
          datesByEvent[d.event_id].push({ id: d.id, date: d.date })
        }
        const responderSets: Record<string, Set<string>> = {}
        for (const r of responsesRes.data ?? []) {
          if (!responderSets[r.event_id]) responderSets[r.event_id] = new Set()
          responderSets[r.event_id].add(r.responder_name)
        }
        setRecentEvents(eventsData.map((e) => ({
          ...e,
          dates: datesByEvent[e.id] ?? [],
          date_count: datesByEvent[e.id]?.length ?? 0,
          response_count: responderSets[e.id]?.size ?? 0,
        })))
      }

      // Fetch article categories with counts
      const [catsRes, artCountRes] = await Promise.all([
        supabase.from('article_categories').select('id, name, color').order('name'),
        supabase.from('articles').select('category_id').eq('published', true),
      ])
      const countMap: Record<string, number> = {}
      for (const a of artCountRes.data ?? []) {
        if (a.category_id) countMap[a.category_id] = (countMap[a.category_id] ?? 0) + 1
      }
      const cats = (catsRes.data ?? []) as { id: string; name: string; color: string }[]
      setArticleCategories(cats.map((c) => ({ ...c, count: countMap[c.id] ?? 0 })))

      // Fetch recent videos
      try {
        const res = await fetch('/api/vimeo/videos?project_id=25313251')
        const json = await res.json()
        const videos: VimeoVideo[] = json.data ?? []
        setRecentVideos(videos.slice(0, 3))
      } catch {
        // ignore
      }

      setLoading(false)
    }
    load()
  }, [])

  const handleLogout = () => {
    if (confirm('ログアウトしますか？')) {
      localStorage.removeItem(SLACK_USER_KEY)
      localStorage.removeItem(USER_NAME_KEY)
      router.push('/')
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/icon-192x192.png" alt="ロゴ" width={28} height={28} className="rounded-lg" />
            <span className="font-bold text-gray-900 text-[15px]">アクセルビジネスカレッジ</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/settings" title="設定" className="hover:opacity-80 transition-opacity">
              {slackUser?.avatar_url ? (
                <Image
                  src={slackUser.avatar_url}
                  alt={userName}
                  width={32}
                  height={32}
                  className="rounded-full ring-2 ring-transparent hover:ring-[#2563eb]/30 transition-all"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#2563eb]/10 flex items-center justify-center hover:bg-[#2563eb]/20 transition-colors">
                  <span className="text-[#2563eb] text-sm font-medium">{userName?.[0] ?? '?'}</span>
                </div>
              )}
            </Link>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              title="ログアウト"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 pb-20">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            こんにちは、{userName || 'ゲスト'}さん 👋
          </h1>
          <p className="text-gray-500 mt-1">今日もビジネスの知見を深めましょう。</p>
        </div>

        {/* Recent events */}
        {(loading || recentEvents.length > 0) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <CalendarDays size={16} className="text-[#2563eb]" />
                日程調整
              </h2>
              <Link href="/events" className="text-[#2563eb] text-sm hover:underline flex items-center gap-1">
                すべて見る <ArrowRight size={13} />
              </Link>
            </div>
            {loading ? (
              <div className="divide-y divide-gray-50">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="px-5 py-3.5 animate-pulse flex items-center gap-3">
                    <div className="h-3.5 bg-gray-100 rounded w-1/3" />
                    <div className="h-3 bg-gray-100 rounded w-16 ml-auto" />
                  </div>
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {recentEvents.map((ev) => {
                  const isPast = ev.deadline ? new Date(ev.deadline) < new Date() : false
                  return (
                    <li key={ev.id}>
                      <Link
                        href={`/events/${ev.id}`}
                        className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            {ev.confirmed_date ? (
                              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium flex-shrink-0">
                                <CheckCircle2 size={9} /> 確定
                              </span>
                            ) : isPast ? (
                              <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-full font-medium flex-shrink-0">締切済み</span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium flex-shrink-0">受付中</span>
                            )}
                            <span className="font-medium text-gray-800 text-sm truncate">{ev.title}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                            <span>{ev.response_count}人回答</span>
                            {ev.deadline && !ev.confirmed_date && (
                              <span className={`flex items-center gap-1 ${isPast ? 'text-red-400' : ''}`}>
                                <Clock size={10} />
                                締切 {format(new Date(ev.deadline), 'M/d', { locale: ja })}
                              </span>
                            )}
                            {ev.confirmed_date && (
                              <span className="text-green-600 font-medium">
                                {format(new Date(ev.confirmed_date), 'M/d(E) HH:mm', { locale: ja })}
                              </span>
                            )}
                          </div>
                          {ev.dates.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {ev.dates.slice(0, 3).map((d) => {
                                const dt = new Date(d.date)
                                const hasTime = dt.getHours() !== 0 || dt.getMinutes() !== 0
                                return (
                                  <span key={d.id} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                                    {format(dt, hasTime ? 'M/d(E) HH:mm' : 'M/d(E)', { locale: ja })}
                                  </span>
                                )
                              })}
                              {ev.dates.length > 3 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-full">
                                  他{ev.dates.length - 3}件
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <ChevronRight size={15} className="text-gray-300 flex-shrink-0 group-hover:text-gray-400 transition-colors" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <Link
            href="/chat"
            className="bg-[#2563eb] text-white rounded-2xl p-5 flex items-center gap-3 hover:bg-[#1d4ed8] transition-colors shadow-sm"
          >
            <MessageSquare size={24} />
            <div>
              <div className="font-semibold">チャット</div>
              <div className="text-white/70 text-sm">メッセージを見る</div>
            </div>
            <ArrowRight size={16} className="ml-auto opacity-70" />
          </Link>
          <Link
            href="/videos"
            className="bg-white text-gray-800 rounded-2xl p-5 flex items-center gap-3 hover:bg-gray-50 transition-colors shadow-sm border border-gray-100"
          >
            <Video size={24} className="text-[#2563eb]" />
            <div>
              <div className="font-semibold">動画ライブラリ</div>
              <div className="text-gray-400 text-sm">勉強会を視聴する</div>
            </div>
            <ArrowRight size={16} className="ml-auto text-gray-300" />
          </Link>
          <Link
            href="/gallery"
            className="bg-white text-gray-800 rounded-2xl p-5 flex items-center gap-3 hover:bg-gray-50 transition-colors shadow-sm border border-gray-100"
          >
            <ImageIcon size={24} className="text-[#2563eb]" />
            <div>
              <div className="font-semibold">ギャラリー</div>
              <div className="text-gray-400 text-sm">写真をシェア</div>
            </div>
            <ArrowRight size={16} className="ml-auto text-gray-300" />
          </Link>
          <Link
            href="/members"
            className="bg-white rounded-2xl p-5 flex items-center gap-3 shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors"
          >
            <Users size={24} className="text-[#2563eb]" />
            <div>
              <div className="font-semibold text-gray-800">メンバー数</div>
              <div className="text-2xl font-bold text-[#2563eb]">
                {loading ? '...' : memberCount ?? '-'}
              </div>
            </div>
            <ArrowRight size={16} className="ml-auto text-gray-300" />
          </Link>
          <Link
            href="/events"
            className="bg-white text-gray-800 rounded-2xl p-5 flex items-center gap-3 hover:bg-gray-50 transition-colors shadow-sm border border-gray-100"
          >
            <CalendarDays size={24} className="text-[#2563eb]" />
            <div>
              <div className="font-semibold">日程調整</div>
              <div className="text-gray-400 text-sm">イベント確認</div>
            </div>
            <ArrowRight size={16} className="ml-auto text-gray-300" />
          </Link>
          <Link
            href="/ai-chat"
            className="bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-2xl p-5 flex items-center gap-3 hover:from-violet-600 hover:to-purple-700 transition-colors shadow-sm"
          >
            <Sparkles size={24} />
            <div>
              <div className="font-semibold">AI</div>
              <div className="text-white/70 text-sm">アシスタント</div>
            </div>
            <ArrowRight size={16} className="ml-auto opacity-70" />
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent messages */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <MessageSquare size={16} className="text-[#2563eb]" />
                最新の投稿
              </h2>
              <Link href="/chat" className="text-[#2563eb] text-sm hover:underline flex items-center gap-1">
                もっと見る <ArrowRight size={13} />
              </Link>
            </div>
            {loading ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-3 bg-gray-100 rounded w-1/4 mb-1.5" />
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                  </div>
                ))}
              </div>
            ) : recentMessages.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">投稿がありません</div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {recentMessages.map((msg) => (
                  <li key={msg.id} className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-800 text-sm">{msg.user_name}</span>
                      <span className="text-gray-300 text-xs">·</span>
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Hash size={10} />
                        {channelMap[msg.channel_id] ?? ''}
                      </span>
                      <span className="text-gray-300 text-xs ml-auto">
                        {format(new Date(msg.created_at), 'M/d HH:mm', { locale: ja })}
                      </span>
                    </div>
                    <p className="text-gray-600 text-sm line-clamp-2">{msg.content || '(添付ファイル)'}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent videos */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Video size={16} className="text-[#2563eb]" />
                最新の動画
              </h2>
              <Link href="/videos" className="text-[#2563eb] text-sm hover:underline flex items-center gap-1">
                もっと見る <ArrowRight size={13} />
              </Link>
            </div>
            {loading ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex gap-3">
                    <div className="w-20 h-12 bg-gray-100 rounded-lg flex-shrink-0" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-100 rounded w-3/4 mb-1.5" />
                      <div className="h-3 bg-gray-100 rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentVideos.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">動画がありません</div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {recentVideos.map((video) => {
                  const thumb = getThumbnail(video.pictures)
                  return (
                    <li key={video.uri} className="px-5 py-4">
                      <Link href="/videos" className="flex gap-3 items-center hover:opacity-80 transition-opacity">
                        <div className="w-20 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 relative">
                          {thumb && (
                            <Image src={thumb} alt={video.name} fill className="object-cover" />
                          )}
                          <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1 rounded font-mono">
                            {formatDuration(video.duration)}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-snug">{video.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {format(new Date(video.created_time), 'yyyy/M/d', { locale: ja })}
                          </p>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Article categories */}
        {(loading || articleCategories.length > 0) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-6">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <BookOpen size={16} className="text-[#2563eb]" />
                ナレッジベース
              </h2>
              <Link href="/articles" className="text-[#2563eb] text-sm hover:underline flex items-center gap-1">
                すべて見る <ArrowRight size={13} />
              </Link>
            </div>
            {loading ? (
              <div className="divide-y divide-gray-50">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="px-5 py-3.5 animate-pulse flex items-center gap-3">
                    <div className="w-3 h-3 bg-gray-100 rounded-full" />
                    <div className="h-3.5 bg-gray-100 rounded w-1/3" />
                    <div className="h-3 bg-gray-100 rounded w-10 ml-auto" />
                  </div>
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {articleCategories.map((cat) => (
                  <li key={cat.id}>
                    <Link
                      href={`/articles?category=${cat.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group"
                    >
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-medium text-gray-800 text-sm flex-1">{cat.name}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{cat.count}件</span>
                      <ChevronRight size={15} className="text-gray-300 flex-shrink-0 group-hover:text-gray-400 transition-colors" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
