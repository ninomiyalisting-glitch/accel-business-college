'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  MessageSquare,
  Video,
  ArrowRight,
  Hash,
  CalendarDays,
  CheckCircle2,
  Clock,
  ChevronRight,
  Award,
  Users,
  Target,
} from 'lucide-react'
import { Message } from '@/types'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Avatar from '@/components/Avatar'
import {
  EVENT_CATEGORY_STYLE as CATEGORY_STYLE,
  toCategory,
} from '@/lib/eventCategories'

const SLACK_USER_KEY = 'abc_slackUser'
const USER_NAME_KEY = 'abc_userName'

/** 実務従事更新ポイントの目標。期限までにこの点数を貯める */
const POINT_TARGET = 30

interface VimeoVideo {
  uri: string
  name: string
  duration: number
  created_time: string
  pictures: { sizes: { width: number; link: string }[] }
}

interface EventDate {
  id: string
  date: string
  end_time?: string | null
}

interface DashEvent {
  id: string
  title: string
  category: string | null
  cover_image_url: string | null
  created_by: string
  created_by_avatar: string | null
  deadline: string | null
  confirmed_date: string | null
  created_at: string
  dates: EventDate[]
  response_count: number
}

interface PointRow {
  id: string
  worked_on: string
  points: number
  activity: string
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

/**
 * イベントを「開催日決定」「調整中」「終了」に分ける。
 * 判定は一覧ページ（events/page.tsx）の phaseOf と同じ規則にしている。
 * 片方だけ直すと同じイベントが 2 つの画面で違う扱いになるので、
 * 規則を変えるときは両方を直すこと。
 */
function phaseOf(ev: DashEvent): 'fixed' | 'adjusting' | 'ended' {
  const now = new Date()
  if (ev.confirmed_date) {
    return new Date(ev.confirmed_date) < now ? 'ended' : 'fixed'
  }
  if (ev.dates.length > 0 && ev.dates.every((d) => new Date(d.end_time ?? d.date) < now)) {
    return 'ended'
  }
  return 'adjusting'
}

/** 期限までの残り月数（切り上げ）。過ぎていたら 0 */
function monthsUntil(deadline: string): number {
  const end = new Date(`${deadline}T23:59:59`)
  const now = new Date()
  if (end < now) return 0
  const days = (end.getTime() - now.getTime()) / 86400000
  return Math.max(1, Math.ceil(days / 30.4))
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'こんばんは'
  if (h < 11) return 'おはようございます'
  if (h < 18) return 'こんにちは'
  return 'こんばんは'
}

/** 見出しつきのカード。ブロックを増やすときはこれで包む */
function Panel({
  icon,
  title,
  href,
  linkLabel = 'すべて見る',
  children,
  className = '',
}: {
  icon: React.ReactNode
  title: string
  href?: string
  linkLabel?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden ${className}`}>
      <div className="flex items-center gap-3 px-6 pt-6 pb-4">
        <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-accel-lightest text-accel-text flex-shrink-0">
          {icon}
        </span>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {href && (
          <Link
            href={href}
            className="ml-auto text-accel-active text-sm font-semibold hover:underline flex items-center gap-1 flex-shrink-0"
          >
            {linkLabel} <ArrowRight size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="px-6 pb-8 pt-2 text-gray-400">{children}</div>
}

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="px-6 pb-6 space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse flex items-center gap-3">
          <div className="h-4 bg-gray-100 rounded w-2/5" />
          <div className="h-3 bg-gray-100 rounded w-16 ml-auto" />
        </div>
      ))}
    </div>
  )
}

/** イベント 1 件。決定・調整中どちらでも使う */
function EventRow({ ev, phase }: { ev: DashEvent; phase: 'fixed' | 'adjusting' }) {
  const category = toCategory(ev.category)
  const upcoming = ev.dates.filter((d) => new Date(d.end_time ?? d.date) >= new Date())
  const deadlinePassed = ev.deadline ? new Date(ev.deadline) < new Date() : false

  return (
    <Link
      href={`/events/${ev.id}`}
      className="flex gap-4 px-6 py-4 hover:bg-surface-muted transition-colors group"
    >
      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-accel-lightest overflow-hidden flex-shrink-0">
        {ev.cover_image_url ? (
          // next/image は登録外ドメインで例外を投げてページごと落ちるので img を使う
          <img src={ev.cover_image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-accel-secondary">
            <CalendarDays size={28} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_STYLE[category]}`}>
            {category}
          </span>
          {phase === 'fixed' ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-accel-primary text-white">
              <CheckCircle2 size={12} /> 開催日決定
            </span>
          ) : deadlinePassed ? (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
              締切済み
            </span>
          ) : (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
              回答受付中
            </span>
          )}
        </div>

        <p className="font-bold text-gray-900 text-base sm:text-lg leading-snug line-clamp-2">
          {ev.title}
        </p>

        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2 text-sm text-gray-500">
          {ev.confirmed_date ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-accel-text">
              <CalendarDays size={15} />
              {format(new Date(ev.confirmed_date), 'M月d日(E) HH:mm', { locale: ja })}
            </span>
          ) : upcoming.length > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={15} />
              候補 {upcoming.length}日（
              {format(new Date(upcoming[0].date), 'M/d(E)', { locale: ja })} 〜）
            </span>
          ) : null}

          <span className="inline-flex items-center gap-1.5">
            <Users size={15} />
            {ev.response_count}人回答
          </span>

          {ev.deadline && !ev.confirmed_date && (
            <span className={`inline-flex items-center gap-1.5 ${deadlinePassed ? 'text-red-500' : ''}`}>
              <Clock size={15} />
              締切 {format(new Date(ev.deadline), 'M/d', { locale: ja })}
            </span>
          )}
        </div>
      </div>

      <ChevronRight
        size={20}
        className="text-gray-300 flex-shrink-0 self-center group-hover:text-accel-secondary transition-colors"
      />
    </Link>
  )
}

export default function DashboardPage() {
  const [userName, setUserName] = useState<string>('')
  const [slackUserId, setSlackUserId] = useState<string | null>(null)

  const [events, setEvents] = useState<DashEvent[]>([])
  const [recentMessages, setRecentMessages] = useState<Message[]>([])
  const [channelMap, setChannelMap] = useState<Record<string, string>>({})
  const [recentVideos, setRecentVideos] = useState<VimeoVideo[]>([])
  const [loading, setLoading] = useState(true)

  const [points, setPoints] = useState<PointRow[]>([])
  const [renewalDeadline, setRenewalDeadline] = useState<string | null>(null)
  const [pointsLoading, setPointsLoading] = useState(true)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SLACK_USER_KEY)
      if (saved) {
        const user = JSON.parse(saved) as { display_name?: string; slack_user_id?: string }
        setUserName(user.display_name ?? '')
        setSlackUserId(user.slack_user_id ?? null)
      } else {
        setUserName(localStorage.getItem(USER_NAME_KEY) ?? '')
      }
    } catch {
      // 壊れた localStorage は無視してゲスト表示にする
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const [channelsRes, eventsRes, vimeoResult] = await Promise.all([
        supabase.from('channels').select('id, name').eq('is_hidden', false),
        supabase
          .from('events')
          .select(
            'id, title, category, cover_image_url, created_by, created_by_avatar, deadline, confirmed_date, created_at'
          )
          .order('created_at', { ascending: false })
          .limit(40),
        fetch('/api/vimeo/videos?project_id=25313251&recursive=1')
          .then((r) => r.json())
          .catch(() => null),
      ])

      const cmap: Record<string, string> = {}
      for (const c of channelsRes.data ?? []) cmap[c.id] = c.name
      setChannelMap(cmap)

      if (vimeoResult && Array.isArray(vimeoResult.data)) {
        setRecentVideos((vimeoResult.data as VimeoVideo[]).slice(0, 4))
      }

      const eventsData = (eventsRes.data ?? []) as Omit<DashEvent, 'dates' | 'response_count'>[]
      const eventIds = eventsData.map((e) => e.id)
      const channelIds = Object.keys(cmap)

      const [msgsRes, datesRes, responsesRes] = await Promise.all([
        channelIds.length > 0
          ? supabase
              .from('messages')
              .select('*')
              .in('channel_id', channelIds)
              .order('created_at', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] as Message[] }),
        eventIds.length > 0
          ? supabase
              .from('event_dates')
              .select('event_id, id, date, end_time')
              .in('event_id', eventIds)
              .order('date')
          : Promise.resolve({ data: [] as (EventDate & { event_id: string })[] }),
        eventIds.length > 0
          ? supabase.from('event_responses').select('event_id, responder_name').in('event_id', eventIds)
          : Promise.resolve({ data: [] as { event_id: string; responder_name: string }[] }),
      ])

      setRecentMessages((msgsRes.data ?? []) as Message[])

      const datesByEvent: Record<string, EventDate[]> = {}
      for (const d of (datesRes.data ?? []) as (EventDate & { event_id: string })[]) {
        if (!datesByEvent[d.event_id]) datesByEvent[d.event_id] = []
        datesByEvent[d.event_id].push({ id: d.id, date: d.date, end_time: d.end_time })
      }
      const responderSets: Record<string, Set<string>> = {}
      for (const r of responsesRes.data ?? []) {
        if (!responderSets[r.event_id]) responderSets[r.event_id] = new Set()
        responderSets[r.event_id].add(r.responder_name)
      }

      setEvents(
        eventsData.map((e) => ({
          ...e,
          dates: datesByEvent[e.id] ?? [],
          response_count: responderSets[e.id]?.size ?? 0,
        }))
      )

      setLoading(false)
    }
    load()
  }, [])

  // ポイントと期限は本人が分かってから読む
  useEffect(() => {
    if (!slackUserId) {
      setPointsLoading(false)
      return
    }
    const load = async () => {
      setPointsLoading(true)
      const [pointsRes, settingsRes] = await Promise.all([
        supabase
          .from('practice_points')
          .select('id, worked_on, points, activity')
          .eq('slack_user_id', slackUserId)
          .order('worked_on', { ascending: false }),
        supabase
          .from('user_settings')
          .select('renewal_deadline')
          .eq('slack_user_id', slackUserId)
          .maybeSingle(),
      ])
      setPoints((pointsRes.data ?? []) as PointRow[])
      setRenewalDeadline(settingsRes.data?.renewal_deadline ?? null)
      setPointsLoading(false)
    }
    load()
  }, [slackUserId])

  const fixedEvents = useMemo(
    () =>
      events
        .filter((e) => phaseOf(e) === 'fixed')
        .sort((a, b) => (a.confirmed_date ?? '').localeCompare(b.confirmed_date ?? ''))
        .slice(0, 3),
    [events]
  )

  const adjustingEvents = useMemo(
    () =>
      events
        .filter((e) => phaseOf(e) === 'adjusting')
        .sort((a, b) => (b.deadline ?? b.created_at).localeCompare(a.deadline ?? a.created_at))
        .slice(0, 3),
    [events]
  )

  /**
   * 期限までの累計。
   * 期限が未登録なら全期間の合計を出す（0 を見せても意味がないため）。
   */
  const pointSummary = useMemo(() => {
    const inRange = renewalDeadline
      ? points.filter((p) => p.worked_on <= renewalDeadline)
      : points
    const total = inRange.reduce((sum, p) => sum + p.points, 0)
    return {
      total,
      remaining: Math.max(0, POINT_TARGET - total),
      percent: Math.min(100, Math.round((total / POINT_TARGET) * 100)),
      months: renewalDeadline ? monthsUntil(renewalDeadline) : null,
      count: inRange.length,
      latest: inRange[0] ?? null,
    }
  }, [points, renewalDeadline])

  return (
    <div className="min-h-screen bg-surface-muted">
      <main className="max-w-content mx-auto px-4 py-8 pb-bottom-nav">
        {/* あいさつ */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            {greeting()}、{userName || 'ゲスト'}さん
          </h1>
          <p className="text-gray-500 mt-2">
            {format(new Date(), 'yyyy年M月d日(E)', { locale: ja })} ・ 今日もビジネスの知見を深めましょう。
          </p>
        </div>

        {/* ① 開催決定イベント */}
        <Panel
          icon={<CheckCircle2 size={20} />}
          title="開催が決まったイベント"
          href="/events"
          className="mb-6"
        >
          {loading ? (
            <SkeletonRows count={2} />
          ) : fixedEvents.length === 0 ? (
            <EmptyNote>開催日が決まったイベントはまだありません。</EmptyNote>
          ) : (
            <div className="divide-y divide-gray-50 border-t border-gray-50">
              {fixedEvents.map((ev) => (
                <EventRow key={ev.id} ev={ev} phase="fixed" />
              ))}
            </div>
          )}
        </Panel>

        {/* ② 調整中イベント */}
        <Panel
          icon={<Clock size={20} />}
          title="日程調整中のイベント"
          href="/events"
          className="mb-6"
        >
          {loading ? (
            <SkeletonRows count={2} />
          ) : adjustingEvents.length === 0 ? (
            <EmptyNote>調整中のイベントはありません。</EmptyNote>
          ) : (
            <div className="divide-y divide-gray-50 border-t border-gray-50">
              {adjustingEvents.map((ev) => (
                <EventRow key={ev.id} ev={ev} phase="adjusting" />
              ))}
            </div>
          )}
        </Panel>

        {/* ③ 実務従事更新ポイント */}
        <section className="bg-gradient-to-br from-accel-text to-accel-primary text-white rounded-3xl shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-6 sm:px-8 sm:py-7">
            <div className="flex items-center gap-3 mb-6">
              <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/15 flex-shrink-0">
                <Award size={20} />
              </span>
              <h2 className="text-lg font-bold">実務従事更新ポイント</h2>
              <Link
                href={slackUserId ? `/members/${slackUserId}` : '/members'}
                className="ml-auto text-white/90 text-sm font-semibold hover:text-white hover:underline flex items-center gap-1 flex-shrink-0"
              >
                履歴を見る <ArrowRight size={14} />
              </Link>
            </div>

            {pointsLoading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-10 bg-white/15 rounded w-40" />
                <div className="h-3 bg-white/15 rounded-full" />
              </div>
            ) : !slackUserId ? (
              <p className="text-white/80">
                Slack アカウントでログインすると、あなたのポイント状況が表示されます。
              </p>
            ) : (
              <>
                <div className="flex items-end gap-2 flex-wrap">
                  <span className="text-5xl font-bold tabular-nums leading-none">{pointSummary.total}</span>
                  <span className="text-xl text-white/70 font-semibold">/ {POINT_TARGET} ポイント</span>
                  {pointSummary.remaining === 0 && (
                    <span className="ml-2 mb-1 text-sm font-bold px-3 py-1 rounded-full bg-white text-accel-text">
                      目標達成
                    </span>
                  )}
                </div>

                <div className="h-3 rounded-full bg-white/20 overflow-hidden mt-5">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-700"
                    style={{ width: `${pointSummary.percent}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
                  <div>
                    <div className="text-white/60 text-sm">残りポイント</div>
                    <div className="text-2xl font-bold tabular-nums">{pointSummary.remaining}</div>
                  </div>
                  <div>
                    <div className="text-white/60 text-sm">期限</div>
                    <div className="text-2xl font-bold">
                      {renewalDeadline
                        ? format(new Date(`${renewalDeadline}T00:00:00`), 'yyyy/M/d')
                        : '未設定'}
                    </div>
                  </div>
                  <div>
                    <div className="text-white/60 text-sm">残り期間</div>
                    <div className="text-2xl font-bold">
                      {pointSummary.months === null
                        ? '—'
                        : pointSummary.months === 0
                          ? '期限切れ'
                          : `約${pointSummary.months}ヶ月`}
                    </div>
                  </div>
                </div>

                {!renewalDeadline && (
                  <p className="mt-6 text-white/80 text-sm">
                    <Link href="/settings" className="underline font-semibold hover:text-white">
                      設定ページ
                    </Link>
                    で更新の期限日を登録すると、期限までの進捗が出ます。
                  </p>
                )}

                {renewalDeadline && pointSummary.remaining > 0 && (
                  <p className="mt-6 text-white/80 text-sm inline-flex items-center gap-2">
                    <Target size={16} className="flex-shrink-0" />
                    期限まであと {pointSummary.remaining} ポイント
                    {pointSummary.months !== null && pointSummary.months > 0 && (
                      <>（月あたり約 {Math.ceil(pointSummary.remaining / pointSummary.months)} ポイント）</>
                    )}
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ④ 新規投稿 */}
          <Panel icon={<MessageSquare size={20} />} title="新規の投稿" href="/chat" linkLabel="チャットへ">
            {loading ? (
              <SkeletonRows />
            ) : recentMessages.length === 0 ? (
              <EmptyNote>投稿がありません。</EmptyNote>
            ) : (
              <ul className="divide-y divide-gray-50 border-t border-gray-50">
                {recentMessages.map((msg) => (
                  <li key={msg.id} className="px-6 py-4">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <Avatar
                        src={msg.avatar_url ?? null}
                        name={msg.user_name}
                        size={32}
                        className="flex-shrink-0"
                      />
                      <span className="font-bold text-gray-900">{msg.user_name}</span>
                      <span className="inline-flex items-center gap-0.5 text-sm text-gray-400">
                        <Hash size={13} />
                        {channelMap[msg.channel_id] ?? ''}
                      </span>
                      <span className="text-sm text-gray-400 ml-auto flex-shrink-0">
                        {format(new Date(msg.created_at), 'M/d HH:mm', { locale: ja })}
                      </span>
                    </div>
                    <p className="text-gray-600 line-clamp-2 pl-[42px]">
                      {msg.content || '(添付ファイル)'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* ⑤ 最新動画 */}
          <Panel icon={<Video size={20} />} title="最新の動画" href="/videos" linkLabel="動画ライブラリ">
            {loading ? (
              <SkeletonRows />
            ) : recentVideos.length === 0 ? (
              <EmptyNote>動画がありません。</EmptyNote>
            ) : (
              <ul className="divide-y divide-gray-50 border-t border-gray-50">
                {recentVideos.map((video) => {
                  const thumb = getThumbnail(video.pictures)
                  return (
                    <li key={video.uri}>
                      <Link
                        href="/videos"
                        className="flex gap-4 px-6 py-4 hover:bg-surface-muted transition-colors"
                      >
                        <div className="w-28 h-16 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0 relative">
                          {thumb && (
                            // Vimeo のサムネイルはドメインが変わることがあるため img で描く
                            <img src={thumb} alt="" className="w-full h-full object-cover" />
                          )}
                          <span className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 rounded font-mono">
                            {formatDuration(video.duration)}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-gray-900 line-clamp-2 leading-snug">{video.name}</p>
                          <p className="text-sm text-gray-400 mt-1">
                            {format(new Date(video.created_time), 'yyyy/M/d', { locale: ja })}
                          </p>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>
      </main>
    </div>
  )
}
