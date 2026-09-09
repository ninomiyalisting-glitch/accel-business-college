'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { MessageSquare, Video, Users, ArrowRight, Hash, ImageIcon, CalendarDays, Sparkles, CheckCircle2, Clock, ChevronRight, BookOpen } from 'lucide-react'
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

      // First batch: all independent queries in parallel
      const [channelsRes, memberCountRes, eventsRes, catsRes, artCountRes, vimeoResult] = await Promise.all([
        supabase.from('channels').select('id, name').eq('is_hidden', false),
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase
          .from('events')
          .select('id, title, deadline, confirmed_date, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('article_categories').select('id, name, color').order('name'),
        supabase.from('articles').select('category_id').eq('published', true),
        fetch('/api/vimeo/videos?project_id=25313251&recursive=1').then((r) => r.json()).catch(() => null),
      ])

      const cmap: Record<string, string> = {}
      for (const c of channelsRes.data ?? []) cmap[c.id] = c.name
      setChannelMap(cmap)

      setMemberCount(memberCountRes.count ?? null)

      const countMap: Record<string, number> = {}
      for (const a of artCountRes.data ?? []) {
        if (a.category_id) countMap[a.category_id] = (countMap[a.category_id] ?? 0) + 1
      }
      const cats = (catsRes.data ?? []) as { id: string; name: string; color: string }[]
      setArticleCategories(cats.map((c) => ({ ...c, count: countMap[c.id] ?? 0 })))

      if (vimeoResult && Array.isArray(vimeoResult.data)) {
        setRecentVideos((vimeoResult.data as VimeoVideo[]).slice(0, 3))
      }

      // Second batch: queries that depend on first-batch results, also in parallel
      const channelIds = Object.keys(cmap)
      const eventsData = eventsRes.data ?? []
      const eventIds = eventsData.map((e) => e.id)

      const [msgsRes, datesRes, responsesRes] = await Promise.all([
        channelIds.length > 0
          ? supabase
              .from('messages')
              .select('*')
              .in('channel_id', channelIds)
              .order('created_at', { ascending: false })
              .limit(3)
          : Promise.resolve({ data: [] as Message[] }),
        eventIds.length > 0
          ? supabase.from('event_dates').select('event_id, id, date').in('event_id', eventIds).order('date')
          : Promise.resolve({ data: [] as { event_id: string; id: string; date: string }[] }),
        eventIds.length > 0
          ? supabase.from('event_responses').select('event_id, responder_name').in('event_id', eventIds)
          : Promise.resolve({ data: [] as { event_id: string; responder_name: string }[] }),
      ])

      setRecentMessages((msgsRes.data ?? []) as Message[])

      if (eventsData.length > 0) {
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
    <div className="min-h-screen bg-[#f7faf2]">
      {/* Header */}

      <main className="max-w-content mx-auto px-4 py-8 pb-bottom-nav">
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
                <CalendarDays size={16} className="text-[#1f7a00]" />
                イベント
              </h2>
              <Link href="/events" className="text-[#1f7a00] text-sm hover:underline flex items-center gap-1">
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
                              <span className="flex items-center gap-1 text-[14px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium flex-shrink-0">
                                <CheckCircle2 size={9} /> 確定
                              </span>
                            ) : isPast ? (
                              <span className="text-[14px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-full font-medium flex-shrink-0">締切済み</span>
                            ) : (
                              <span className="text-[14px] px-1.5 py-0.5 bg-accel-lightest text-accel-active rounded-full font-medium flex-shrink-0">受付中</span>
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
                                  <span key={d.id} className="text-[14px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                                    {format(dt, hasTime ? 'M/d(E) HH:mm' : 'M/d(E)', { locale: ja })}
                                  </span>
                                )
                              })}
                              {ev.dates.length > 3 && (
                                <span className="text-[14px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-full">
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
            className="bg-[#1f7a00] text-white rounded-2xl p-5 flex items-center gap-3 hover:bg-[#145200] transition-colors shadow-sm"
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
            <Video size={24} className="text-[#1f7a00]" />
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
            <ImageIcon size={24} className="text-[#1f7a00]" />
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
            <Users size={24} className="text-[#1f7a00]" />
            <div>
              <div className="font-semibold text-gray-800">メンバー数</div>
              <div className="text-2xl font-bold text-[#1f7a00]">
                {loading ? '...' : memberCount ?? '-'}
              </div>
            </div>
            <ArrowRight size={16} className="ml-auto text-gray-300" />
          </Link>
          <Link
            href="/events"
            className="bg-white text-gray-800 rounded-2xl p-5 flex items-center gap-3 hover:bg-gray-50 transition-colors shadow-sm border border-gray-100"
          >
            <CalendarDays size={24} className="text-[#1f7a00]" />
            <div>
              <div className="font-semibold">日程調整</div>
              <div className="text-gray-400 text-sm">イベント確認</div>
            </div>
            <ArrowRight size={16} className="ml-auto text-gray-300" />
          </Link>
          <Link
            href="/ai-chat"
            className="bg-gradient-to-br from-accel-primary to-accel-primary text-white rounded-2xl p-5 flex items-center gap-3 hover:from-accel-primary hover:to-accel-active transition-colors shadow-sm"
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
                <MessageSquare size={16} className="text-[#1f7a00]" />
                最新の投稿
              </h2>
              <Link href="/chat" className="text-[#1f7a00] text-sm hover:underline flex items-center gap-1">
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
                <Video size={16} className="text-[#1f7a00]" />
                最新の動画
              </h2>
              <Link href="/videos" className="text-[#1f7a00] text-sm hover:underline flex items-center gap-1">
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
                          <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[14px] px-1 rounded font-mono">
                            {formatDuration(video.duration)}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-relaxed">{video.name}</p>
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
                <BookOpen size={16} className="text-[#1f7a00]" />
                ナレッジベース
              </h2>
              <Link href="/articles" className="text-[#1f7a00] text-sm hover:underline flex items-center gap-1">
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
