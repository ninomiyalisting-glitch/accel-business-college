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
  BookOpen,
  Heart,
  Compass,
  UserPlus,
  Image as ImageIcon,
  X,
  ListChecks,
  ChevronLeft,
} from 'lucide-react'
import { Message } from '@/types'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Avatar from '@/components/Avatar'
import {
  EVENT_CATEGORY_STYLE as CATEGORY_STYLE,
  toCategory,
} from '@/lib/eventCategories'
import { isOwnerPost } from '@/lib/owner'

const SLACK_USER_KEY = 'abc_slackUser'
const USER_NAME_KEY = 'abc_userName'

/** 実務従事更新ポイントの目標。期限までにこの点数を貯める */
const POINT_TARGET = 30

/** ホームに並べる記事の上限。これを超える分はカテゴリーの一覧へ送る */
const HOME_MAX = 6

/**
 * 「実務ポイント獲得リスト」のポップアップに出す記事のタイトル。
 * 使い方ガイドにこのタイトルで記事を作ると、ポイントブロックから開けるようになる。
 */
const POINT_LIST_TITLE = '実務ポイント獲得リスト'

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

interface Article {
  id: string
  title: string
  cover_image_url: string | null
  author_name: string | null
  author_avatar: string | null
  created_at: string
  category_id: string | null
}

interface PhotoRow {
  id: string
  image_url: string
  caption: string | null
  uploader_name: string
  created_at: string
  category_id: string
}

interface MemberRow {
  slack_user_id: string
  display_name: string
  avatar_url: string | null
  created_at: string
}

/** リアクション数つきの投稿 */
type HotMessage = Message & { reaction_count: number }

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
 * イベントの状態。一覧ページ（events/page.tsx）の phaseOf と同じ規則。
 * 片方だけ直すと同じイベントが 2 画面で違う扱いになるので、変えるときは両方直す。
 */
function phaseOf(ev: DashEvent): 'fixed' | 'adjusting' | 'ended' {
  const now = new Date()
  if (ev.confirmed_date) return new Date(ev.confirmed_date) < now ? 'ended' : 'fixed'
  if (ev.dates.length > 0 && ev.dates.every((d) => new Date(d.end_time ?? d.date) < now)) {
    return 'ended'
  }
  return 'adjusting'
}

function monthsUntil(deadline: string): number {
  const end = new Date(`${deadline}T23:59:59`)
  const now = new Date()
  if (end < now) return 0
  return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86400000 / 30.4))
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'こんばんは'
  if (h < 11) return 'おはようございます'
  if (h < 18) return 'こんにちは'
  return 'こんばんは'
}


/**
 * 画像が無いときの下地色。
 * タイトルから決めるので、同じものは常に同じ色になり、
 * 並べたときに互いに見分けがつく。色は緑系の濃淡に寄せて統一感を保つ。
 */
const PLACEHOLDER_TONES = [
  'bg-accel-lightest text-accel-secondary',
  'bg-[#dff0c4] text-accel-primary',
  'bg-[#e6f2f8] text-[#0097DB]',
  'bg-[#f3f0dc] text-[#8a7f2e]',
  'bg-[#eae7f5] text-[#6b5fa8]',
]
function toneOf(seed: string): string {
  let n = 0
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0
  return PLACEHOLDER_TONES[n % PLACEHOLDER_TONES.length]
}

/** 節の見出し。右端に一覧へのリンクを置く */
/** 投稿ブロック。新着順がデフォルトで、タブで人気順（リアクション数）に切り替える */
function PostBlock({
  title,
  loading,
  messages,
  channelMap,
  emptyText,
}: {
  title: string
  loading: boolean
  messages: HotMessage[]
  channelMap: Record<string, string>
  emptyText: string
}) {
  const [tab, setTab] = useState<'new' | 'popular'>('new')
  const shown = useMemo(() => {
    const list = [...messages]
    if (tab === 'popular') {
      list.sort(
        (a, b) =>
          b.reaction_count - a.reaction_count ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    } else {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
    return list.slice(0, 5)
  }, [messages, tab])

  const tabBtn = (key: 'new' | 'popular', label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
        tab === key
          ? 'bg-accel-text text-white'
          : 'bg-white text-gray-500 hover:bg-surface-muted'
      }`}
    >
      {label}
    </button>
  )

  return (
    <section className="mb-10">
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <span className="text-accel-text">
          <MessageSquare size={20} />
        </span>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white p-0.5">
          {tabBtn('new', '新着')}
          {tabBtn('popular', '人気')}
        </div>
        <Link
          href="/chat"
          className="ml-auto flex shrink-0 items-center gap-1 text-sm font-semibold text-accel-active hover:underline"
        >
          チャットへ <ArrowRight size={14} />
        </Link>
      </div>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyNote>{emptyText}</EmptyNote>
      ) : (
        <ul className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          {shown.map((msg) => (
            <li key={msg.id} className="border-b border-gray-50 last:border-b-0">
              <Link
                href={`/chat?channel=${msg.channel_id}`}
                className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-surface-muted"
              >
                <Avatar
                  src={msg.avatar_url ?? null}
                  name={msg.user_name}
                  size={40}
                  className="mt-0.5 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 leading-relaxed text-gray-800">
                    {msg.content || '(添付ファイル)'}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
                    <span className="font-medium text-gray-500">{msg.user_name}</span>
                    {msg.reaction_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-accel-active">
                        <Heart size={13} />
                        {msg.reaction_count}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-muted px-2 py-0.5 text-xs">
                      <Hash size={11} />
                      {channelMap[msg.channel_id] ?? ''}
                    </span>
                    <span>{format(new Date(msg.created_at), 'M/d', { locale: ja })}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SectionHead({
  icon,
  title,
  href,
  linkLabel,
}: {
  icon: React.ReactNode
  title: string
  href?: string
  linkLabel?: string
}) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="text-accel-text">{icon}</span>
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      {href && (
        <Link
          href={href}
          className="ml-auto flex shrink-0 items-center gap-1 text-sm font-semibold text-accel-active hover:underline"
        >
          {linkLabel ?? 'すべて見る'} <ArrowRight size={14} />
        </Link>
      )}
    </div>
  )
}

/** 横スクロールの並び。スマホでも同じ形で見せる */
function Rail({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex gap-4">{children}</div>
    </div>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-gray-200 px-5 py-8 text-center text-gray-400">
      {children}
    </p>
  )
}

export default function DashboardPage() {
  const [userName, setUserName] = useState('')
  const [slackUserId, setSlackUserId] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  const [events, setEvents] = useState<DashEvent[]>([])
  const [recentMessages, setRecentMessages] = useState<HotMessage[]>([])
  /** 実務ポイント獲得リストのポップアップ */
  const [pointListOpen, setPointListOpen] = useState(false)
  const [pointListLoading, setPointListLoading] = useState(false)
  const [pointListArticle, setPointListArticle] = useState<
    { id: string; title: string; content: string } | null | undefined
  >(undefined)
  const [channelMap, setChannelMap] = useState<Record<string, string>>({})
  const [videos, setVideos] = useState<VimeoVideo[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [categories, setCategories] = useState<
    { id: string; name: string; color: string; role: string | null; parent_id: string | null }[]
  >([])
  /** 「使い方ガイド」に割り当てられたカテゴリーの記事 */
  const [guideArticles, setGuideArticles] = useState<Article[]>([])
  const [newMembers, setNewMembers] = useState<MemberRow[]>([])
  const [photos, setPhotos] = useState<PhotoRow[]>([])
  /** 活動写真の拡大表示。開いている写真の添字。null で閉じる */
  const [photoIndex, setPhotoIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const [points, setPoints] = useState<PointRow[]>([])
  const [renewalDeadline, setRenewalDeadline] = useState<string | null>(null)
  const [pointsLoading, setPointsLoading] = useState(true)

  /**
   * OAuth から戻ってきたときのログイン情報を localStorage に保存する。
   *
   * 以前はチャットにだけこの処理があり、ログイン後の着地もチャットだった。
   * 着地をホームに変えたので、ここにも同じ処理が要る。
   * これが無いと名前もポイントも出ない状態でホームが開く。
   */
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('login') !== 'success') return

    const id = url.searchParams.get('slack_user_id') ?? ''
    const name = url.searchParams.get('display_name') ?? ''
    const avatar = url.searchParams.get('avatar_url') ?? ''
    if (id && name) {
      try {
        localStorage.setItem(SLACK_USER_KEY, JSON.stringify({
          slack_user_id: id, display_name: name, avatar_url: avatar,
        }))
        localStorage.setItem(USER_NAME_KEY, name)
      } catch {
        // 保存できなくても画面は出す
      }
      setSlackUserId(id)
      setUserName(name)
      setAvatarUrl(avatar || null)
    }
    // URL からログイン情報を消す。共有やリロードで残らないように
    window.history.replaceState({}, '', '/dashboard')
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SLACK_USER_KEY)
      if (saved) {
        const u = JSON.parse(saved) as {
          display_name?: string
          slack_user_id?: string
          avatar_url?: string
        }
        setUserName(u.display_name ?? '')
        setSlackUserId(u.slack_user_id ?? null)
        setAvatarUrl(u.avatar_url ?? null)
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

      const [channelsRes, eventsRes, catsRes, membersRes, photosRes, vimeoResult] =
        await Promise.all([
          supabase.from('channels').select('id, name').eq('is_hidden', false),
          supabase
            .from('events')
            .select(
              'id, title, category, cover_image_url, created_by, created_by_avatar, deadline, confirmed_date, created_at'
            )
            .order('created_at', { ascending: false })
            .limit(60),
          supabase
            .from('article_categories')
            .select('id, name, color, role, sort_order, parent_id')
            .order('sort_order'),
          supabase
            .from('users')
            .select('slack_user_id, display_name, avatar_url, created_at')
            .order('created_at', { ascending: false })
            .limit(10),
          supabase
            .from('photos')
            .select('id, image_url, caption, uploader_name, created_at, category_id')
            .order('created_at', { ascending: false })
            // カテゴリーごとに3枚へ絞るので、多めに取ってから間引く
            .limit(60),
          fetch('/api/vimeo/videos?project_id=25313251&recursive=1')
            .then((r) => r.json())
            .catch(() => null),
        ])

      const cmap: Record<string, string> = {}
      for (const c of channelsRes.data ?? []) cmap[c.id] = c.name
      setChannelMap(cmap)

      const cats = (catsRes.data ?? []) as {
        id: string
        name: string
        color: string
        role: string | null
        parent_id: string | null
      }[]
      setCategories(cats)

      /**
       * どのカテゴリーをどのブロックに出すかは、note のカテゴリー管理の役割で決める。
       * 未割り当てなら同名のカテゴリーで代用する（memberCategory / guideCategory と同じ規則）。
       */
      const idsOf = (role: string, fallbackName: string) => {
        const root =
          cats.find((c) => c.role === role) ??
          cats.find((c) => !c.parent_id && c.name === fallbackName)
        if (!root) return null
        // 小カテゴリーの記事も親の割り当てに含める
        const childIds = cats.filter((c) => c.parent_id === root.id).map((c) => c.id)
        return new Set([root.id, ...childIds])
      }
      const memberIds = idsOf('member', 'メンバーコンテンツ')
      const guideIds = idsOf('guide', '使い方ガイド')

      /**
       * カテゴリーを指定して記事を取る。
       * 以前は「新着 40 件を取ってから絞る」だったため、古いガイド記事が
       * 新しい記事に押し出されて消えていた。記事が増えても消えないよう、
       * カテゴリーで絞ったクエリを投げる。
       */
      const articlesIn = async (ids: Set<string> | null): Promise<Article[]> => {
        if (!ids || ids.size === 0) return []
        const { data } = await supabase
          .from('articles')
          .select('id, title, cover_image_url, author_name, author_avatar, created_at, category_id')
          .eq('published', true)
          .in('category_id', [...ids])
          .order('created_at', { ascending: false })
          .limit(HOME_MAX)
        return (data ?? []) as Article[]
      }
      const [memberArticles, guideArticleRows] = await Promise.all([
        articlesIn(memberIds),
        articlesIn(guideIds),
      ])
      setArticles(memberArticles)
      setGuideArticles(guideArticleRows)
      setNewMembers((membersRes.data ?? []) as MemberRow[])
      /**
       * 同じカテゴリーの写真ばかりが並ばないよう、1カテゴリー3枚までにする。
       * 1つのアルバムに大量に上げると、ホームがそれだけで埋まってしまうため。
       */
      const perCategory = new Map<string, number>()
      const picked: PhotoRow[] = []
      for (const ph of (photosRes.data ?? []) as PhotoRow[]) {
        const key = ph.category_id ?? ''
        const n = perCategory.get(key) ?? 0
        if (n >= 3) continue
        perCategory.set(key, n + 1)
        picked.push(ph)
        if (picked.length >= 12) break
      }
      setPhotos(picked)

      if (vimeoResult && Array.isArray(vimeoResult.data)) {
        setVideos((vimeoResult.data as VimeoVideo[]).slice(0, 4))
      }

      const eventsData = (eventsRes.data ?? []) as Omit<DashEvent, 'dates' | 'response_count'>[]
      const eventIds = eventsData.map((e) => e.id)
      const channelIds = Object.keys(cmap)

      const [msgsRes, datesRes, responsesRes] = await Promise.all([
        // 直近の投稿を多めに取り、ここから新着順／人気順それぞれを作る。
        // 「人気」を全期間で見ると古い投稿が居座るので、直近に限る。
        channelIds.length > 0
          ? supabase
              .from('messages')
              .select('*')
              .in('channel_id', channelIds)
              .order('created_at', { ascending: false })
              .limit(60)
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

      // リアクション数を数える。
      // message_reactions は messages の id ではなく
      // channel_id + メッセージ時刻で紐づくので、その組で数える。
      const recent = (msgsRes.data ?? []) as Message[]
      if (recent.length > 0) {
        const oldest = recent[recent.length - 1].created_at
        const { data: reactions } = await supabase
          .from('message_reactions')
          .select('channel_id, message_created_at')
          .in('channel_id', channelIds)
          .gte('message_created_at', oldest)

        const countBy = new Map<string, number>()
        for (const r of reactions ?? []) {
          const key = `${r.channel_id}__${r.message_created_at}`
          countBy.set(key, (countBy.get(key) ?? 0) + 1)
        }
        const withCount: HotMessage[] = recent.map((m) => ({
          ...m,
          reaction_count: countBy.get(`${m.channel_id}__${m.created_at}`) ?? 0,
        }))
        setRecentMessages(withCount)
      }

      setLoading(false)
    }
    load()
  }, [])

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

  /**
   * ブロックに出すカテゴリー。note のカテゴリー管理で役割を割り当てたものを優先し、
   * 未割り当てなら同名のカテゴリー（「メンバーコンテンツ」「使い方ガイド」）を使う。
   */
  const memberCategory = useMemo(
    () =>
      categories.find((c) => c.role === 'member') ??
      categories.find((c) => !c.parent_id && c.name === 'メンバーコンテンツ') ??
      null,
    [categories]
  )
  const guideCategory = useMemo(
    () =>
      categories.find((c) => c.role === 'guide') ??
      categories.find((c) => !c.parent_id && c.name === '使い方ガイド') ??
      null,
    [categories]
  )
  /** 拡大表示中のキー操作。← → で移動、Esc で閉じる */
  useEffect(() => {
    if (photoIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPhotoIndex(null)
      if (e.key === 'ArrowRight') setPhotoIndex((i) => (i === null ? null : (i + 1) % photos.length))
      if (e.key === 'ArrowLeft') setPhotoIndex((i) => (i === null ? null : (i - 1 + photos.length) % photos.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photoIndex, photos.length])

  /** ポップアップを開く。記事は初回だけ読む */
  async function openPointList() {
    setPointListOpen(true)
    if (pointListArticle !== undefined) return
    setPointListLoading(true)
    const { data } = await supabase
      .from('articles')
      .select('id, title, content')
      .eq('published', true)
      .ilike('title', `%${POINT_LIST_TITLE}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setPointListArticle((data as { id: string; title: string; content: string } | null) ?? null)
    setPointListLoading(false)
  }

  /** 投稿を「にのみー」と「それ以外」に分ける。並び順は各ブロックのタブで決める */
  const ownerMessages = useMemo(
    () => recentMessages.filter((m) => isOwnerPost(m.slack_user_id, m.user_name)),
    [recentMessages]
  )
  const memberMessages = useMemo(
    () => recentMessages.filter((m) => !isOwnerPost(m.slack_user_id, m.user_name)),
    [recentMessages]
  )

  /** 専用ブロックを持つカテゴリーは「学びのコンテンツ」に出さない（同じものが二度並ぶため） */
  const otherCategories = useMemo(() => categories.filter((c) => !c.role), [categories])

  /** 開催決定を先に、その後ろに調整中。終了は出さない */
  const shownEvents = useMemo(() => {
    const fixed = events
      .filter((e) => phaseOf(e) === 'fixed')
      .sort((a, b) => (a.confirmed_date ?? '').localeCompare(b.confirmed_date ?? ''))
    const adjusting = events
      .filter((e) => phaseOf(e) === 'adjusting')
      .sort((a, b) => (b.deadline ?? b.created_at).localeCompare(a.deadline ?? a.created_at))
    return [...fixed, ...adjusting].slice(0, 8)
  }, [events])

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
    }
  }, [points, renewalDeadline])

  return (
    <div className="min-h-screen bg-surface-muted">
      <main className="max-w-content mx-auto px-4 py-8 pb-bottom-nav">
        {/* ── プロフィール ── */}
        <div className="mb-9 flex items-center gap-4 rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm">
          <Avatar src={avatarUrl} name={userName || 'ゲスト'} size={56} className="flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-500">{greeting()}</p>
            {/* 長い名前でも切れないよう、幅は名前に譲る */}
            <p className="truncate text-xl font-bold text-gray-900 sm:text-2xl">
              {userName || 'ゲスト'}
              <span className="ml-1 text-base font-normal text-gray-500">さん</span>
            </p>
          </div>
          {slackUserId && (
            <Link
              href={`/members/${slackUserId}`}
              aria-label="プロフィールページへ"
              className="flex shrink-0 items-center gap-1 rounded-xl border-2 border-border-soft px-3 py-2 text-sm font-semibold text-accel-active hover:border-accel-secondary"
            >
              <span className="hidden sm:inline">プロフィール</span>
              <ArrowRight size={14} />
            </Link>
          )}
        </div>

        {/* ── イベント・勉強会 ── */}
        <section className="mb-10">
          <SectionHead
            icon={<CalendarDays size={20} />}
            title="イベント・勉強会"
            href="/events"
          />
          {loading ? (
            <Rail>
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-64 shrink-0 animate-pulse">
                  <div className="mb-2 h-36 rounded-2xl bg-gray-100" />
                  <div className="h-4 w-3/4 rounded bg-gray-100" />
                </div>
              ))}
            </Rail>
          ) : shownEvents.length === 0 ? (
            <EmptyNote>予定されているイベントはありません。</EmptyNote>
          ) : (
            <Rail>
              {shownEvents.map((ev) => {
                const fixed = phaseOf(ev) === 'fixed'
                const category = toCategory(ev.category)
                const upcoming = ev.dates.filter(
                  (d) => new Date(d.end_time ?? d.date) >= new Date()
                )
                return (
                  <Link
                    key={ev.id}
                    href={`/events/${ev.id}`}
                    className="group w-64 shrink-0 sm:w-72"
                  >
                    <div
                      className={`relative mb-3 aspect-[16/10] overflow-hidden rounded-2xl ${toneOf(ev.title)}`}
                    >
                      {ev.cover_image_url ? (
                        // next/image は未登録ドメインで例外を投げページごと落とすので img を使う
                        <img
                          src={ev.cover_image_url}
                          alt=""
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1.5 px-3">
                          <CalendarDays size={26} />
                          <span className="line-clamp-2 text-center text-xs font-semibold opacity-70">
                            {ev.title}
                          </span>
                        </div>
                      )}
                      <span
                        className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          fixed
                            ? 'bg-accel-primary text-white'
                            : 'bg-white/95 text-amber-800'
                        }`}
                      >
                        {fixed ? '開催決定' : '日程調整中'}
                      </span>
                    </div>
                    <span
                      className={`mb-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${CATEGORY_STYLE[category]}`}
                    >
                      {category}
                    </span>
                    <p className="line-clamp-2 font-bold leading-snug text-gray-900">
                      {ev.title}
                    </p>
                    <p className="mt-1.5 flex items-center gap-1.5 text-sm text-gray-500">
                      {ev.confirmed_date ? (
                        <>
                          <CheckCircle2 size={14} className="text-accel-primary" />
                          {(() => {
                            const d = new Date(ev.confirmed_date!)
                            // 時刻未設定（0:00）のイベントに「00:00」と出すと誤解を招く
                            const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0
                            return format(d, hasTime ? 'M月d日(E) HH:mm' : 'M月d日(E)', { locale: ja })
                          })()}
                        </>
                      ) : (
                        <>
                          <Clock size={14} />
                          候補 {upcoming.length}日 ・ {ev.response_count}人回答
                        </>
                      )}
                    </p>
                  </Link>
                )
              })}
            </Rail>
          )}
        </section>

        {/* ── 投稿（にのみー／メンバー） ── */}
        <PostBlock
          title="にのみーの投稿"
          loading={loading}
          messages={ownerMessages}
          channelMap={channelMap}
          emptyText="にのみーの投稿はまだありません。"
        />
        <PostBlock
          title="メンバーの投稿"
          loading={loading}
          messages={memberMessages}
          channelMap={channelMap}
          emptyText="メンバーの投稿はまだありません。"
        />

        {/* ── 動画 ── */}
        <section className="mb-10">
          <SectionHead
            icon={<Video size={20} />}
            title="動画"
            href="/videos"
            linkLabel="動画ライブラリ"
          />
          {loading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="mb-2 aspect-video rounded-2xl bg-gray-100" />
                  <div className="h-4 w-3/4 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          ) : videos.length === 0 ? (
            <EmptyNote>動画がありません。</EmptyNote>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {videos.map((v) => {
                const thumb = getThumbnail(v.pictures)
                return (
                  <Link key={v.uri} href="/videos" className="group">
                    <div className="relative mb-2 aspect-video overflow-hidden rounded-2xl bg-gray-100">
                      {thumb && (
                        <img
                          src={thumb}
                          alt=""
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      )}
                      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 font-mono text-xs text-white">
                        {formatDuration(v.duration)}
                      </span>
                    </div>
                    <p className="line-clamp-2 font-bold leading-snug text-gray-900">{v.name}</p>
                    <p className="mt-1 text-sm text-gray-400">
                      {format(new Date(v.created_time), 'yyyy/M/d', { locale: ja })}
                    </p>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* ── メンバーコンテンツ ── */}
        <section className="mb-10">
          <SectionHead
            icon={<BookOpen size={20} />}
            title={memberCategory?.name ?? 'メンバーコンテンツ'}
            href={memberCategory ? `/articles/category/${memberCategory.id}` : '/articles'}
            linkLabel="一覧へ"
          />
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />
              ))}
            </div>
          ) : articles.length === 0 ? (
            <EmptyNote>
              {memberCategory
                ? 'このカテゴリーにはまだ記事がありません。'
                : 'ビジカレnote のカテゴリー編集で「メンバーコンテンツ」に出すカテゴリーを選んでください。'}
            </EmptyNote>
          ) : (
            <ul className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
              {articles.map((a) => (
                <li key={a.id} className="border-b border-gray-50 last:border-b-0">
                  <Link
                    href={`/articles/${a.id}`}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-muted"
                  >
                    <div
                      className={`h-16 w-24 flex-shrink-0 overflow-hidden rounded-xl ${toneOf(a.title)}`}
                    >
                      {a.cover_image_url ? (
                        <img src={a.cover_image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <BookOpen size={20} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-bold leading-snug text-gray-900">{a.title}</p>
                      <div className="mt-1.5 flex items-center gap-2 text-sm text-gray-400">
                        {a.author_name && (
                          <>
                            <Avatar src={a.author_avatar} name={a.author_name} size={20} />
                            <span>{a.author_name}</span>
                          </>
                        )}
                        <span>{format(new Date(a.created_at), 'M/d', { locale: ja })}</span>
                      </div>
                    </div>
                    <ChevronRight size={18} className="flex-shrink-0 text-gray-300" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── 実務従事更新ポイント ── */}
        <section className="mb-10 overflow-hidden rounded-3xl bg-gradient-to-br from-accel-text to-accel-primary text-white shadow-sm">
          <div className="px-6 py-6 sm:px-8 sm:py-7">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15">
                <Award size={20} />
              </span>
              <h2 className="text-lg font-bold">実務従事更新ポイント</h2>
              <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-x-4 gap-y-1">
                <button
                  type="button"
                  onClick={openPointList}
                  className="flex items-center gap-1 text-sm font-semibold text-white/90 hover:text-white hover:underline"
                >
                  <ListChecks size={15} /> {POINT_LIST_TITLE}
                </button>
                <Link
                  href={slackUserId ? `/members/${slackUserId}` : '/members'}
                  className="flex items-center gap-1 text-sm font-semibold text-white/90 hover:text-white hover:underline"
                >
                  履歴を見る <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            {pointsLoading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-10 w-40 rounded bg-white/15" />
                <div className="h-3 rounded-full bg-white/15" />
              </div>
            ) : !slackUserId ? (
              <p className="text-white/80">
                Slack アカウントでログインすると、あなたのポイント状況が表示されます。
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <span className="text-5xl font-bold leading-none tabular-nums">
                    {pointSummary.total}
                  </span>
                  <span className="text-xl font-semibold text-white/70">
                    / {POINT_TARGET} ポイント
                  </span>
                  {pointSummary.remaining === 0 && (
                    <span className="mb-1 ml-2 rounded-full bg-white px-3 py-1 text-sm font-bold text-accel-text">
                      目標達成
                    </span>
                  )}
                </div>

                <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-700"
                    style={{ width: `${pointSummary.percent}%` }}
                  />
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div>
                    <div className="text-sm text-white/60">残りポイント</div>
                    <div className="text-2xl font-bold tabular-nums">{pointSummary.remaining}</div>
                  </div>
                  <div>
                    <div className="text-sm text-white/60">期限</div>
                    <div className="text-2xl font-bold">
                      {renewalDeadline
                        ? format(new Date(`${renewalDeadline}T00:00:00`), 'yyyy/M/d')
                        : '未設定'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-white/60">残り期間</div>
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
                  <p className="mt-6 text-sm text-white/80">
                    <Link href="/settings" className="font-semibold underline hover:text-white">
                      設定ページ
                    </Link>
                    で更新の期限日を登録すると、期限までの進捗が出ます。
                  </p>
                )}

                {renewalDeadline && pointSummary.remaining > 0 && (
                  <p className="mt-6 inline-flex items-center gap-2 text-sm text-white/80">
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

        {/* ── 新メンバー紹介 ── */}
        <section className="mb-10">
          <SectionHead
            icon={<UserPlus size={20} />}
            title="新しいメンバー"
            href="/members"
            linkLabel="メンバー一覧"
          />
          {loading ? (
            <Rail>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="w-32 shrink-0 animate-pulse text-center">
                  <div className="mx-auto mb-2 h-20 w-20 rounded-full bg-gray-100" />
                  <div className="mx-auto h-4 w-16 rounded bg-gray-100" />
                </div>
              ))}
            </Rail>
          ) : newMembers.length === 0 ? (
            <EmptyNote>メンバーがいません。</EmptyNote>
          ) : (
            <Rail>
              {newMembers.slice(0, 8).map((m) => (
                <Link
                  key={m.slack_user_id}
                  href={`/members/${m.slack_user_id}`}
                  className="group w-32 shrink-0 text-center"
                >
                  <div className="mx-auto mb-2.5 transition-transform group-hover:scale-105">
                    <Avatar
                      src={m.avatar_url}
                      name={m.display_name}
                      size={80}
                      className="mx-auto ring-2 ring-white"
                    />
                  </div>
                  <p className="truncate font-bold text-gray-900">{m.display_name}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {format(new Date(m.created_at), 'yyyy/M月〜', { locale: ja })}
                  </p>
                </Link>
              ))}
            </Rail>
          )}
        </section>

        {/* ── 活動写真 ── */}
        <section className="mb-10">
          <SectionHead
            icon={<ImageIcon size={20} />}
            title="活動写真"
            href="/gallery"
            linkLabel="すべて見る"
          />
          {loading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="aspect-square animate-pulse rounded-2xl bg-gray-100" />
              ))}
            </div>
          ) : photos.length === 0 ? (
            <EmptyNote>まだ写真がありません。</EmptyNote>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {photos.map((ph, i) => (
                <button
                  key={ph.id}
                  type="button"
                  onClick={() => setPhotoIndex(i)}
                  title={ph.caption ?? `${ph.uploader_name} さんの写真`}
                  className="group relative aspect-square overflow-hidden rounded-2xl bg-gray-100"
                >
                  {/* next/image は未登録ドメインで例外を投げページごと落とすので img を使う。
                      読み込めない写真（壊れたファイル・未対応形式）は枠ごと外す */}
                  <img
                    src={ph.image_url}
                    alt={ph.caption ?? ''}
                    loading="lazy"
                    decoding="async"
                    onError={() => setPhotos((prev) => prev.filter((p) => p.id !== ph.id))}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  {ph.caption && (
                    <span className="absolute inset-x-0 bottom-0 line-clamp-1 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {ph.caption}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ── 学びのコンテンツ ── */}
        {otherCategories.length > 0 && (
          <section className="mb-10">
            <SectionHead
              icon={<Compass size={20} />}
              title="学びのコンテンツ"
              href="/articles"
              linkLabel="すべて見る"
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {otherCategories.map((c) => (
                <Link
                  key={c.id}
                  href={`/articles/category/${c.id}`}
                  className="flex items-center gap-2.5 rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm transition-colors hover:border-accel-secondary"
                >
                  <span
                    className="h-3 w-3 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="truncate font-semibold text-gray-800">{c.name}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── 使い方ガイド ──
            note のカテゴリー管理で「使い方ガイド」に割り当てたカテゴリーの記事を出す。
            割り当てが無ければ、note への入口だけを見せる。 */}
        <section className="mb-4">
          <SectionHead
            icon={<Users size={20} />}
            title="使い方ガイド"
            href={guideCategory ? `/articles/category/${guideCategory.id}` : '/articles'}
            linkLabel={guideCategory ? 'すべて見る' : 'ビジカレnote'}
          />
          {guideArticles.length > 0 ? (
            /* 著者や日付は出さず、1行ずつのコンパクトな並びにする */
            <ul className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
              {guideArticles.map((a) => (
                <li key={a.id} className="border-b border-gray-50 last:border-b-0">
                  <Link
                    href={`/articles/${a.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-muted"
                  >
                    <span
                      className={`flex h-10 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg ${toneOf(a.title)}`}
                    >
                      {a.cover_image_url ? (
                        <img src={a.cover_image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <BookOpen size={16} />
                      )}
                    </span>
                    <p className="min-w-0 flex-1 truncate font-semibold text-gray-900">{a.title}</p>
                    <ChevronRight size={16} className="flex-shrink-0 text-gray-300" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Link
              href="/articles"
              className="flex items-center gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-5 shadow-sm transition-colors hover:border-accel-secondary"
            >
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-accel-lightest text-accel-text">
                <Users size={22} />
              </span>
              <div className="min-w-0">
                <p className="font-bold text-gray-900">ビジカレnote</p>
                <p className="text-sm text-gray-500">
                  記事とガイドをまとめています。使い方ガイドに出す記事は、note のカテゴリー管理で選べます。
                </p>
              </div>
              <ChevronRight size={20} className="ml-auto flex-shrink-0 text-gray-300" />
            </Link>
          )}
        </section>

      {/* 活動写真の拡大表示 */}
      {photoIndex !== null && photos[photoIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setPhotoIndex(null)}
        >
          <button
            type="button"
            onClick={() => setPhotoIndex(null)}
            aria-label="閉じる"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X size={22} />
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setPhotoIndex((photoIndex - 1 + photos.length) % photos.length)
                }}
                aria-label="前の写真"
                className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-4"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setPhotoIndex((photoIndex + 1) % photos.length)
                }}
                aria-label="次の写真"
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-4"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}
          <div
            className="flex max-h-full w-full max-w-5xl flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={photos[photoIndex].image_url}
              alt={photos[photoIndex].caption ?? ''}
              className="max-h-[calc(100vh-120px)] max-w-full rounded-lg object-contain"
            />
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-sm text-white/70">
              {photos[photoIndex].caption && (
                <span className="text-white">{photos[photoIndex].caption}</span>
              )}
              <span>{photos[photoIndex].uploader_name}</span>
              <span className="text-white/40">
                {photoIndex + 1} / {photos.length}
              </span>
              <Link
                href="/gallery"
                className="font-semibold text-white/90 underline hover:text-white"
              >
                活動写真をすべて見る
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 実務ポイント獲得リストのポップアップ */}
      {pointListOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setPointListOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={POINT_LIST_TITLE}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
          >
            <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accel-lightest text-accel-text">
                <ListChecks size={18} />
              </span>
              <h2 className="min-w-0 flex-1 truncate text-lg font-bold text-gray-900">
                {pointListArticle?.title ?? POINT_LIST_TITLE}
              </h2>
              <button
                type="button"
                onClick={() => setPointListOpen(false)}
                aria-label="閉じる"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {pointListLoading || pointListArticle === undefined ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-4 w-3/4 rounded bg-gray-100" />
                  <div className="h-4 w-full rounded bg-gray-100" />
                  <div className="h-4 w-5/6 rounded bg-gray-100" />
                </div>
              ) : pointListArticle === null ? (
                <div className="py-6 text-center text-sm text-gray-500">
                  <p>「{POINT_LIST_TITLE}」の記事がまだありません。</p>
                  <p className="mt-2 text-gray-400">
                    ビジカレnote の「使い方ガイド」に、このタイトルで記事を作成するとここに表示されます。
                  </p>
                </div>
              ) : (
                <div
                  className="article-content"
                  dangerouslySetInnerHTML={{ __html: pointListArticle.content }}
                />
              )}
            </div>
            {pointListArticle && (
              <div className="border-t border-gray-100 px-5 py-3 text-right">
                <Link
                  href={`/articles/${pointListArticle.id}`}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-accel-active hover:underline"
                >
                  記事ページで開く <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
      </main>
    </div>
  )
}
