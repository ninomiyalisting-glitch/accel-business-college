'use client'

import { use, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays, Clock, CheckCircle2, Copy, Check, Plus, Trash2, UserPlus, ChevronDown, ChevronUp, CalendarCog, X, Image as ImageIcon, Sparkles, Save, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { EVENT_CATEGORIES, toCategory, type EventCategory } from '@/lib/eventCategories'
import { GalleryPicker } from '@/components/GalleryPicker'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

const SLACK_USER_KEY = 'abc_slackUser'
const ADMIN_SLACK_USER_ID = 'U058FM3EFE0'
/**
 * 説明文が HTML かどうかを判定する。
 *
 * エディタで作ったものは <p> や <h2> を含む。
 * 既存イベントは素のテキストで、HTML として描くと改行が消えてしまう。
 * タグらしきものが無ければテキストとして扱う。
 */
function looksLikeHtml(text: string): boolean {
  return /<(p|div|h[1-6]|ul|ol|li|br|img|a|strong|em)\b[^>]*>/i.test(text)
}

const RESPONSES = ['○', '△', '×'] as const
type ResponseType = typeof RESPONSES[number]

const RESPONSE_STYLES: Record<ResponseType, string> = {
  '○': 'bg-green-100 text-green-700 border-green-200 font-bold',
  '△': 'bg-yellow-100 text-yellow-700 border-yellow-200 font-bold',
  '×': 'bg-red-100 text-red-400 border-red-200',
}
const RESPONSE_SELECTED: Record<ResponseType, string> = {
  '○': 'ring-2 ring-green-400 bg-green-500 text-white border-green-500',
  '△': 'ring-2 ring-yellow-400 bg-yellow-400 text-white border-yellow-400',
  '×': 'ring-2 ring-red-400 bg-red-400 text-white border-red-400',
}

interface EventData {
  id: string
  title: string
  description: string | null
  created_by: string
  deadline: string | null
  confirmed_date: string | null
  category?: string | null
  created_at: string
  cover_image_url?: string | null
}

interface EventDate {
  id: string
  event_id: string
  date: string
  end_time?: string | null
}

interface EventResponse {
  id: string
  event_id: string
  event_date_id: string
  responder_name: string
  response: ResponseType
  avatar_url?: string | null
}

interface ProxyEntry {
  name: string
  draft: Record<string, ResponseType>
}

const escapeIlike = (s: string) => s.replace(/[\\%_]/g, (m) => '\\' + m)

const firstSegment = (name: string): string => {
  const m = name.match(/^([^\s\/_,，、・\-|]+)/)
  return m ? m[1] : name
}

async function resolveAvatarsForNames(names: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {}
  for (const n of names) result[n] = null
  if (names.length === 0) return result

  const [byIdRes, byNameRes] = await Promise.all([
    supabase.from('users').select('slack_user_id, display_name, avatar_url').in('slack_user_id', names),
    supabase.from('users').select('slack_user_id, display_name, avatar_url').in('display_name', names),
  ])
  for (const u of byIdRes.data ?? []) {
    if (u.avatar_url && names.includes(u.slack_user_id)) result[u.slack_user_id] = u.avatar_url
  }
  for (const u of byNameRes.data ?? []) {
    if (u.avatar_url && names.includes(u.display_name) && !result[u.display_name]) {
      result[u.display_name] = u.avatar_url
    }
  }

  const unresolved = names.filter((n) => !result[n])
  if (unresolved.length === 0) return result

  await Promise.all(
    unresolved.map(async (n) => {
      const seg = firstSegment(n)
      // 1. Try users.display_name ILIKE %seg%  (covers "にのみー" matching responder "にのみー/...")
      const r1 = await supabase
        .from('users')
        .select('avatar_url, display_name')
        .ilike('display_name', `%${escapeIlike(seg)}%`)
        .not('avatar_url', 'is', null)
        .limit(1)
      if (r1.data?.[0]?.avatar_url) { result[n] = r1.data[0].avatar_url; return }

      // 2. Try reverse: users.display_name LIKE n% (responder contains user's display_name as prefix)
      const r2 = await supabase
        .from('users')
        .select('avatar_url, display_name')
        .ilike('display_name', `${escapeIlike(seg)}%`)
        .not('avatar_url', 'is', null)
        .limit(1)
      if (r2.data?.[0]?.avatar_url) result[n] = r2.data[0].avatar_url
    })
  )
  return result
}

function formatDateRange(date: string, endTime: string | null | undefined): { dateLabel: string; timeLabel: string | null } {
  const dt = new Date(date)
  const hasTime = dt.getHours() !== 0 || dt.getMinutes() !== 0
  const dateLabel = format(dt, 'M/d(E)', { locale: ja })
  if (!hasTime) return { dateLabel, timeLabel: null }
  const start = format(dt, 'HH:mm')
  if (!endTime) return { dateLabel, timeLabel: start }
  return { dateLabel, timeLabel: `${start}〜${format(new Date(endTime), 'HH:mm')}` }
}

function gradientFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const a = h % 360
  const b = (a + 60) % 360
  return `linear-gradient(135deg, hsl(${a},70%,55%), hsl(${b},70%,45%))`
}

function initialOf(name: string): string {
  const n = name.trim()
  if (!n) return '?'
  return n.charAt(0).toUpperCase()
}

function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return `hsl(${h % 360}, 65%, 55%)`
}

function scoreColor(okCount: number, total: number): string {
  if (total === 0) return 'bg-gray-100 text-gray-400'
  const ratio = okCount / total
  if (ratio >= 0.8) return 'bg-green-500 text-white'
  if (ratio >= 0.5) return 'bg-green-200 text-green-800'
  if (ratio >= 0.3) return 'bg-yellow-100 text-yellow-700'
  return 'bg-gray-100 text-gray-500'
}

function ResponseButtons({
  dateId,
  value,
  onChange,
}: {
  dateId: string
  value: ResponseType | undefined
  onChange: (dateId: string, res: ResponseType) => void
}) {
  return (
    <div className="flex gap-2">
      {RESPONSES.map((res) => (
        <button
          key={res}
          type="button"
          onClick={() => onChange(dateId, res)}
          aria-label={res === '○' ? '参加できる' : res === '△' ? '未定' : '参加できない'}
          // 40px だと押しづらく、記号も小さくて読み取りにくかった。
          // 56px にして記号も 24px に上げる。
          className={`w-14 h-14 rounded-2xl text-2xl leading-none border-2 transition-all active:scale-95 ${
            value === res
              ? RESPONSE_SELECTED[res]
              : 'border-gray-200 text-gray-400 hover:border-accel-light hover:text-accel-active hover:bg-accel-lightest/50'
          }`}
        >
          {res}
        </button>
      ))}
    </div>
  )
}

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [event, setEvent] = useState<EventData | null>(null)
  const [dates, setDates] = useState<EventDate[]>([])
  const [responses, setResponses] = useState<EventResponse[]>([])
  const [myName, setMyName] = useState('')
  const [mySlackUserId, setMySlackUserId] = useState<string | null>(null)
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, ResponseType>>({})
  const [nameEditing, setNameEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Proxy response state
  const [showProxy, setShowProxy] = useState(false)
  const [proxyEntries, setProxyEntries] = useState<ProxyEntry[]>([{ name: '', draft: {} }])
  const [proxySaving, setProxySaving] = useState(false)

  // Admin delete state
  const [deletingName, setDeletingName] = useState<string | null>(null)

  // Date edit modal
  const [showDateEditor, setShowDateEditor] = useState(false)
  const [savingDate, setSavingDate] = useState(false)
  const [confirmedInput, setConfirmedInput] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)

  // Cover image edit
  const [showCoverEdit, setShowCoverEdit] = useState(false)

  // Avatars map: responder_name -> avatar_url
  const [avatars, setAvatars] = useState<Record<string, string | null>>({})

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SLACK_USER_KEY)
      if (saved) {
        const u = JSON.parse(saved)
        setMyName(u.display_name ?? '')
        setMySlackUserId(u.slack_user_id ?? null)
        setMyAvatarUrl(u.avatar_url ?? null)
      }
    } catch { /* ignore */ }
  }, [])

  const loadData = useCallback(async () => {
    const [evRes, datesRes, respRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', id).single(),
      supabase.from('event_dates').select('*').eq('event_id', id).order('date'),
      supabase.from('event_responses').select('*').eq('event_id', id),
    ])
    if (evRes.data) setEvent(evRes.data as EventData)
    setDates((datesRes.data ?? []) as EventDate[])
    setResponses((respRes.data ?? []) as EventResponse[])
    setLoading(false)
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const sub = supabase
      .channel(`event-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_responses', filter: `event_id=eq.${id}` }, () => {
        loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_dates', filter: `event_id=eq.${id}` }, () => {
        loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `id=eq.${id}` }, () => {
        loadData()
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [id, loadData])

  useEffect(() => {
    const names = [...new Set(responses.map((r) => r.responder_name))]
    if (names.length === 0) return

    // Harvest already-cached avatar_url from event_responses
    const cached: Record<string, string> = {}
    for (const r of responses) {
      if (r.avatar_url && !cached[r.responder_name]) cached[r.responder_name] = r.avatar_url
    }

    const toFetch = names.filter((n) => !(n in avatars) && !cached[n])
    const cachedToApply = Object.entries(cached).filter(([n, v]) => v && avatars[n] !== v)

    if (toFetch.length === 0 && cachedToApply.length === 0) return

    const run = async () => {
      const next: Record<string, string | null> = {}
      for (const n of toFetch) next[n] = null
      for (const [n, v] of cachedToApply) next[n] = v
      if (toFetch.length > 0) {
        const found = await resolveAvatarsForNames(toFetch)
        for (const [n, v] of Object.entries(found)) if (v) next[n] = v
      }
      setAvatars((prev) => ({ ...prev, ...next }))
    }
    run()
  }, [responses, avatars])

  useEffect(() => {
    if (!myName) return
    const myResponses = responses.filter((r) => r.responder_name === myName)
    if (myResponses.length > 0) {
      const d: Record<string, ResponseType> = {}
      for (const r of myResponses) d[r.event_date_id] = r.response
      setDraft(d)
    }
  }, [myName, responses])

  const handleSubmit = async () => {
    if (!myName.trim()) return alert('名前を入力してください')
    if (dates.some((d) => !draft[d.id])) return alert('すべての日程に回答してください')
    setSaving(true)

    // Resolve avatar: localStorage first, otherwise look up by slack_user_id, then by display_name
    let avatarUrl: string | null = myAvatarUrl
    if (!avatarUrl) {
      if (mySlackUserId) {
        const { data } = await supabase.from('users').select('avatar_url').eq('slack_user_id', mySlackUserId).maybeSingle()
        avatarUrl = data?.avatar_url ?? null
      }
      if (!avatarUrl) {
        const { data } = await supabase.from('users').select('avatar_url').eq('display_name', myName.trim()).maybeSingle()
        avatarUrl = data?.avatar_url ?? null
      }
      if (avatarUrl) setMyAvatarUrl(avatarUrl)
    }

    const upsertRows = dates.map((d) => ({
      event_id: id,
      event_date_id: d.id,
      responder_name: myName.trim(),
      response: draft[d.id],
      avatar_url: avatarUrl,
    }))
    const { error } = await supabase.from('event_responses').upsert(upsertRows, { onConflict: 'event_date_id,responder_name' })
    setSaving(false)
    if (error) alert(`保存に失敗しました: ${error.message}`)
    else await loadData()
  }

  const handleProxySubmit = async () => {
    const valid = proxyEntries.filter((e) => e.name.trim())
    if (valid.length === 0) return alert('名前を入力してください')
    for (const entry of valid) {
      if (dates.some((d) => !entry.draft[d.id])) {
        return alert(`「${entry.name}」さんのすべての日程に回答してください`)
      }
    }
    setProxySaving(true)

    // Look up avatar for each proxy responder
    const avatarByName = await resolveAvatarsForNames(valid.map((e) => e.name.trim()))

    const rows = valid.flatMap((entry) =>
      dates.map((d) => ({
        event_id: id,
        event_date_id: d.id,
        responder_name: entry.name.trim(),
        response: entry.draft[d.id],
        avatar_url: avatarByName[entry.name.trim()] ?? null,
      }))
    )
    const { error } = await supabase.from('event_responses').upsert(rows, { onConflict: 'event_date_id,responder_name' })
    setProxySaving(false)
    if (error) {
      alert(`保存に失敗しました: ${error.message}`)
    } else {
      setProxyEntries([{ name: '', draft: {} }])
      setShowProxy(false)
      await loadData()
    }
  }

  const addProxyEntry = () =>
    setProxyEntries((prev) => [...prev, { name: '', draft: {} }])

  const removeProxyEntry = (i: number) =>
    setProxyEntries((prev) => prev.filter((_, idx) => idx !== i))

  const updateProxyName = (i: number, name: string) =>
    setProxyEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, name } : e))

  const updateProxyDraft = (i: number, dateId: string, res: ResponseType) =>
    setProxyEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, draft: { ...e.draft, [dateId]: res } } : e))

  const handleAdminDelete = async (responderName: string) => {
    if (!confirm(`「${responderName}」さんの全回答を削除しますか？`)) return
    setDeletingName(responderName)
    await supabase.from('event_responses').delete().eq('event_id', id).eq('responder_name', responderName)
    setDeletingName(null)
    await loadData()
  }

  /**
   * カテゴリーを保存する。
   * 誰でも、終了したイベントでも後から変更できる（整理のため）。
   * DB 側に CHECK 制約があるので、4 つ以外は保存時に弾かれる。
   */
  const saveCategory = async (next: EventCategory) => {
    if (savingCategory) return
    setSavingCategory(true)
    const { error } = await supabase.from('events').update({ category: next }).eq('id', id)
    setSavingCategory(false)

    if (error) {
      alert(`カテゴリーを保存できませんでした：${error.message}`)
      return
    }
    setEvent((cur) => (cur ? { ...cur, category: next } : cur))
  }

  /**
   * 開催日を保存する。null を渡すと取り消して調整中に戻る。
   * 一覧の 3 分割（調整中 / 開催日決定 / 終了）はこの値で決まる。
   * 誰でも変更できる（本人確認は localStorage なので厳密ではない）。
   */
  const saveConfirmedDate = async (iso: string | null) => {
    if (savingDate) return
    if (iso !== null && Number.isNaN(new Date(iso).getTime())) {
      alert('日時が正しくありません')
      return
    }

    setSavingDate(true)
    const { error } = await supabase
      .from('events')
      .update({ confirmed_date: iso })
      .eq('id', id)
    setSavingDate(false)

    if (error) {
      alert(`開催日を保存できませんでした：${error.message}`)
      return
    }
    setEvent((cur) => (cur ? { ...cur, confirmed_date: iso } : cur))
  }

  const handleEventDelete = async () => {
    if (!confirm(`「${event?.title}」を削除しますか？\nこの操作は取り消せません。`)) return
    setDeleting(true)
    await supabase.from('event_responses').delete().eq('event_id', id)
    await supabase.from('event_dates').delete().eq('event_id', id)
    await supabase.from('events').delete().eq('id', id)
    router.push('/events')
  }

  const copyUrl = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const isAdmin = mySlackUserId === ADMIN_SLACK_USER_ID
  const canDelete = isAdmin || (myName && event?.created_by === myName)
  const respondents = useMemo(
    () => [...new Set(responses.map((r) => r.responder_name))].sort(),
    [responses]
  )
  // Pre-aggregate response counts: { [event_date_id]: { '○': n, '△': n, '×': n } }
  const countsByDate = useMemo(() => {
    const map: Record<string, Record<ResponseType, number>> = {}
    for (const r of responses) {
      if (!map[r.event_date_id]) map[r.event_date_id] = { '○': 0, '△': 0, '×': 0 }
      map[r.event_date_id][r.response] = (map[r.event_date_id][r.response] ?? 0) + 1
    }
    return map
  }, [responses])
  const countByDate = (dateId: string, res: ResponseType) => countsByDate[dateId]?.[res] ?? 0

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7faf2] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#279300]/30 border-t-[#279300] rounded-full animate-spin" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-[#f7faf2] flex items-center justify-center">
        <div className="text-center text-gray-400">
          <p>イベントが見つかりません</p>
          <Link href="/events" className="mt-4 inline-block text-[#1f7a00] text-sm hover:underline">一覧に戻る</Link>
        </div>
      </div>
    )
  }

  const isPast = event.deadline ? new Date(event.deadline) < new Date() : false

  return (
    <div className="min-h-screen bg-[#f7faf2]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-content mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/events" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm hidden sm:inline">一覧</span>
          </Link>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="font-bold text-gray-900 text-[17px] flex-1 truncate">{event.title}</h1>
          <button
            onClick={copyUrl}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0"
          >
            {copied ? <><Check size={12} className="text-green-500" /> コピー済み</> : <><Copy size={12} /> URLをコピー</>}
          </button>
          {canDelete && (
            <button
              onClick={handleEventDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-300 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0 disabled:opacity-50"
            >
              {deleting
                ? <div className="w-3 h-3 border border-red-300 border-t-transparent rounded-full animate-spin" />
                : <Trash2 size={12} />}
              削除
            </button>
          )}
        </div>
      </header>

      <main className="max-w-content mx-auto px-4 py-6 pb-bottom-nav space-y-4">
        {/* Cover image */}
        <div className="relative rounded-2xl overflow-hidden aspect-[16/6] shadow-sm border border-gray-100 bg-gray-100">
          {event.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.cover_image_url} alt={event.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" style={{ background: gradientFor(event.title) }}>
              <div className="w-full h-full flex items-center justify-center">
                <CalendarDays size={56} className="text-white/40" />
              </div>
            </div>
          )}
          {canDelete && (
            <button
              onClick={() => setShowCoverEdit(true)}
              className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white/90 backdrop-blur text-gray-700 hover:bg-white rounded-lg shadow-sm transition-colors"
            >
              <ImageIcon size={12} /> 画像を変更
            </button>
          )}
        </div>

        {/* Event info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            {event.confirmed_date ? (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                <CheckCircle2 size={11} /> 日程確定
              </span>
            ) : (
              <span className="text-xs px-2.5 py-1 bg-accel-lightest text-accel-active rounded-full font-medium">回答受付中</span>
            )}
            {isPast && !event.confirmed_date && (
              <span className="text-xs px-2.5 py-1 bg-red-50 text-red-500 rounded-full font-medium">締切済み</span>
            )}
          </div>
          <h2 className="text-xl font-bold text-gray-900 leading-relaxed">{event.title}</h2>
          {event.description && (
            // 新しいイベントはエディタで作るので HTML が入る。
            // 既存の 23 件は素のテキストなので、HTML タグを含まない場合は
            // 改行を生かして表示する（そのまま HTML として描くと改行が消える）。
            looksLikeHtml(event.description) ? (
              <div
                className="article-content mt-3"
                dangerouslySetInnerHTML={{ __html: event.description }}
              />
            ) : (
              <p className="mt-3 text-gray-700 leading-relaxed whitespace-pre-wrap">
                {event.description}
              </p>
            )
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-400">
            <span>作成者: {event.created_by}</span>
            <span>作成日: {format(new Date(event.created_at), 'yyyy/M/d', { locale: ja })}</span>
            {event.deadline && (
              <span className={`flex items-center gap-1 ${isPast ? 'text-red-400' : ''}`}>
                <Clock size={10} /> 回答締切: {format(new Date(event.deadline), 'M/d(E) HH:mm', { locale: ja })}
              </span>
            )}
            {event.confirmed_date && (
              <span className="text-green-600 font-semibold flex items-center gap-1">
                <CalendarDays size={10} /> 確定日: {format(new Date(event.confirmed_date), 'M/d(E) HH:mm', { locale: ja })}
              </span>
            )}
          </div>
        </div>

        {/* カテゴリー。誰でも、終了後でも変更できる。
            過去のイベントを整理するために後から付けられる必要がある。 */}
        {myName && (
          <div className="bg-white rounded-2xl border border-accel-lightest shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
              <h3 className="font-bold text-gray-900">カテゴリー</h3>
              <span className="ml-auto text-sm font-bold text-accel-active">
                {toCategory(event.category)}
              </span>
            </div>
            <div className="p-5 flex flex-wrap gap-2">
              {EVENT_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => saveCategory(c)}
                  disabled={savingCategory}
                  className={`px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors disabled:opacity-60 ${
                    toCategory(event.category) === c
                      ? 'bg-accel-active border-accel-active text-white'
                      : 'bg-white border-border-soft text-gray-700 hover:bg-accel-lightest hover:border-accel-light'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 開催日の設定。
            これまで confirmed_date は表示するだけで、決める手段が無かった。
            候補日から選ぶか、任意の日時を入れられるようにする。
            誰でも変更できる（ログイン判定は localStorage なので厳密ではない）。 */}
        {myName && (
          <div className="bg-white rounded-2xl border border-accel-lightest shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
              <CalendarDays size={16} className="text-accel-active" />
              <h3 className="font-bold text-gray-900">開催日</h3>
              {event.confirmed_date && (
                <span className="ml-auto text-sm font-bold text-accel-active">
                  {format(new Date(event.confirmed_date), 'M月d日(E) HH:mm', { locale: ja })}
                </span>
              )}
            </div>

            <div className="p-5 space-y-4">
              {dates.length > 0 && (
                <div>
                  <p className="text-sm font-bold text-gray-700 mb-2">候補日から選ぶ</p>
                  <div className="flex flex-wrap gap-2">
                    {dates.map((d) => {
                      const dt = new Date(d.date)
                      const hasTime = dt.getHours() !== 0 || dt.getMinutes() !== 0
                      const label = format(dt, hasTime ? 'M/d(E) HH:mm' : 'M/d(E)', { locale: ja })
                      const isSet = event.confirmed_date === d.date
                      return (
                        <button
                          key={d.id}
                          onClick={() => saveConfirmedDate(d.date)}
                          disabled={savingDate}
                          className={`px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors disabled:opacity-60 ${
                            isSet
                              ? 'bg-accel-active border-accel-active text-white'
                              : 'bg-white border-border-soft text-gray-700 hover:bg-accel-lightest hover:border-accel-light'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="confirmed-input" className="block text-sm font-bold text-gray-700 mb-2">
                  日時を直接入力
                </label>
                <div className="flex flex-wrap gap-2.5">
                  <input
                    id="confirmed-input"
                    type="datetime-local"
                    value={confirmedInput}
                    onChange={(e) => setConfirmedInput(e.target.value)}
                    className="flex-1 min-w-[16rem] px-4 py-3 bg-white border-2 border-border-soft rounded-xl focus:outline-none focus:border-accel-primary"
                  />
                  <button
                    onClick={() => saveConfirmedDate(new Date(confirmedInput).toISOString())}
                    disabled={savingDate || !confirmedInput}
                    className="btn-primary disabled:opacity-60"
                  >
                    <Save size={18} /> 開催日にする
                  </button>
                </div>
              </div>

              {event.confirmed_date && (
                <button
                  onClick={() => saveConfirmedDate(null)}
                  disabled={savingDate}
                  className="text-sm text-gray-500 hover:text-red-600 underline disabled:opacity-60"
                >
                  開催日を取り消して調整中に戻す
                </button>
              )}
            </div>
          </div>
        )}

        {/* Response table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
            <span className="font-semibold text-gray-900 text-sm">回答状況</span>
            <div className="flex items-center gap-2">
              {canDelete && (
                <button
                  onClick={() => setShowDateEditor(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#1f7a00] border border-[#279300]/30 rounded-lg hover:bg-accel-lightest transition-colors"
                >
                  <CalendarCog size={12} /> 候補日時を編集
                </button>
              )}
              <span className="text-xs text-gray-400">{respondents.length}人回答</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ minWidth: Math.max(400, 200 + respondents.length * 64) }}>
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 sticky left-0 bg-gray-50/80 z-10 min-w-[140px]">日程</th>
                  {respondents.map((name) => {
                    const av = avatars[name]
                    return (
                      <th key={name} className="text-center text-xs font-medium text-gray-600 px-2 py-2.5 min-w-[56px]">
                        <div className="flex flex-col items-center gap-1">
                          {av ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={av} alt={name} loading="lazy" decoding="async" width={24} height={24} className="w-6 h-6 rounded-full object-cover border border-gray-200" />
                          ) : (
                            <span
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[14px] font-bold text-white"
                              style={{ background: avatarColor(name) }}
                              aria-hidden
                            >
                              {initialOf(name)}
                            </span>
                          )}
                          <span className="block truncate max-w-[56px]" title={name}>{name.slice(0, 4)}</span>
                          {isAdmin && (
                            <button
                              onClick={() => handleAdminDelete(name)}
                              disabled={deletingName === name}
                              className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40"
                              title={`${name}の回答を削除`}
                            >
                              {deletingName === name
                                ? <div className="w-3 h-3 border border-red-300 border-t-transparent rounded-full animate-spin" />
                                : <Trash2 size={11} />}
                            </button>
                          )}
                        </div>
                      </th>
                    )
                  })}
                  <th className="text-center text-xs font-semibold text-gray-500 px-2 py-2.5 min-w-[40px]">○</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-2 py-2.5 min-w-[40px]">△</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-2 py-2.5 min-w-[40px]">×</th>
                </tr>
              </thead>
              <tbody>
                {dates.map((d) => {
                  const okCount = countByDate(d.id, '○')
                  const { dateLabel, timeLabel } = formatDateRange(d.date, d.end_time)
                  return (
                    <tr key={d.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 sticky left-0 bg-white hover:bg-gray-50/50 z-10">
                        <div className="font-medium text-gray-900 text-xs leading-relaxed">{dateLabel}</div>
                        {timeLabel && <div className="text-[14px] text-gray-400">{timeLabel}</div>}
                        <div className={`mt-1 inline-block text-[14px] px-1.5 py-0.5 rounded font-medium ${scoreColor(okCount, respondents.length)}`}>
                          ○ {okCount}/{respondents.length}
                        </div>
                      </td>
                      {respondents.map((name) => {
                        const r = responses.find((x) => x.event_date_id === d.id && x.responder_name === name)
                        return (
                          <td key={name} className="text-center px-2 py-3">
                            {r ? (
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm border ${RESPONSE_STYLES[r.response]}`}>
                                {r.response}
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs text-gray-300 border border-dashed border-gray-200">-</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="text-center px-2 py-3 text-sm font-semibold text-green-600">{okCount}</td>
                      <td className="text-center px-2 py-3 text-sm font-semibold text-yellow-500">{countByDate(d.id, '△')}</td>
                      <td className="text-center px-2 py-3 text-sm text-gray-400">{countByDate(d.id, '×')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* My response form */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 text-sm mb-4">回答する</h3>

          {/* Name */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">お名前</label>
            {nameEditing ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={myName}
                  onChange={(e) => setMyName(e.target.value)}
                  placeholder="名前を入力"
                  className="flex-1 text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#279300]/20 focus:border-[#279300]"
                />
                <button onClick={() => setNameEditing(false)} className="text-xs text-[#1f7a00] px-3 py-2.5 border border-[#279300]/30 rounded-xl hover:bg-accel-lightest transition-colors">
                  確定
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-800 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 flex-1">
                  {myName || '（未入力）'}
                </span>
                <button onClick={() => setNameEditing(true)} className="text-xs text-gray-400 hover:text-gray-600 px-3 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                  変更
                </button>
              </div>
            )}
          </div>

          {/* Date responses */}
          <div className="space-y-2 mb-5">
            {dates.map((d) => {
              const { dateLabel, timeLabel } = formatDateRange(d.date, d.end_time)
              return (
                <div key={d.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-800 font-medium">
                      {dateLabel}
                      {timeLabel && <span className="text-gray-400 ml-1 text-xs">{timeLabel}</span>}
                    </span>
                  </div>
                  <ResponseButtons
                    dateId={d.id}
                    value={draft[d.id]}
                    onChange={(dateId, res) => setDraft((prev) => ({ ...prev, [dateId]: res }))}
                  />
                </div>
              )
            })}
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving || !myName.trim()}
            className="w-full py-3 bg-[#1f7a00] hover:bg-[#145200] disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {saving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saving ? '保存中...' : '回答を送信する'}
          </button>
          <p className="text-center text-xs text-gray-400 mt-2">回答は後から変更できます</p>
        </div>

        {/* Proxy response section */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowProxy((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <UserPlus size={16} className="text-gray-400" />
              <span className="font-semibold text-gray-900 text-sm">代理回答を追加</span>
              <span className="text-xs text-gray-400">（他のメンバーの代わりに回答）</span>
            </div>
            {showProxy ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </button>

          {showProxy && (
            <div className="px-5 pb-5 border-t border-gray-100">
              <div className="space-y-5 mt-4">
                {proxyEntries.map((entry, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="text"
                        value={entry.name}
                        onChange={(e) => updateProxyName(i, e.target.value)}
                        placeholder={`代理回答者 ${i + 1} の名前`}
                        className="flex-1 text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#279300]/20 focus:border-[#279300] bg-white"
                      />
                      {proxyEntries.length > 1 && (
                        <button
                          onClick={() => removeProxyEntry(i)}
                          className="text-gray-300 hover:text-red-400 transition-colors p-1.5"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {dates.map((d) => {
                        const { dateLabel, timeLabel } = formatDateRange(d.date, d.end_time)
                        return (
                          <div key={d.id} className="flex items-center gap-3">
                            <div className="flex-1 min-w-0 text-xs text-gray-600 font-medium">
                              {dateLabel}
                              {timeLabel && <span className="text-gray-400 ml-1">{timeLabel}</span>}
                            </div>
                            <ResponseButtons
                              dateId={d.id}
                              value={entry.draft[d.id]}
                              onChange={(dateId, res) => updateProxyDraft(i, dateId, res)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={addProxyEntry}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-dashed border-gray-300 rounded-xl hover:border-gray-400 transition-colors"
                >
                  <Plus size={14} /> もう一人追加
                </button>
                <button
                  onClick={handleProxySubmit}
                  disabled={proxySaving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-700 hover:bg-gray-800 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  {proxySaving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  {proxySaving ? '保存中...' : '代理回答を送信する'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {showDateEditor && (
        <DateEditorModal
          eventId={id}
          dates={dates}
          onClose={() => setShowDateEditor(false)}
          onSaved={loadData}
        />
      )}

      {showCoverEdit && event && (
        <CoverEditorModal
          eventId={id}
          title={event.title}
          currentUrl={event.cover_image_url ?? ''}
          onClose={() => setShowCoverEdit(false)}
          onSaved={loadData}
        />
      )}
    </div>
  )
}

interface DraftDate {
  id?: string
  date: string
  time: string
  endTime: string
  _deleted?: boolean
  _new?: boolean
}

function DateEditorModal({
  eventId,
  dates,
  onClose,
  onSaved,
}: {
  eventId: string
  dates: EventDate[]
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const toLocal = (iso: string) => {
    const d = new Date(iso)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return { date: `${yyyy}-${mm}-${dd}`, time: hh === '00' && mi === '00' ? '' : `${hh}:${mi}` }
  }
  const toTimeOnly = (iso: string | null | undefined) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const [drafts, setDrafts] = useState<DraftDate[]>(() =>
    dates.map((d) => {
      const { date, time } = toLocal(d.date)
      return { id: d.id, date, time, endTime: toTimeOnly(d.end_time) }
    })
  )
  const [saving, setSaving] = useState(false)

  const update = (i: number, field: 'date' | 'time' | 'endTime', v: string) =>
    setDrafts((prev) => prev.map((d, idx) => idx === i ? { ...d, [field]: v } : d))

  const remove = (i: number) =>
    setDrafts((prev) => prev.map((d, idx) => idx === i ? { ...d, _deleted: true } : d))

  const undo = (i: number) =>
    setDrafts((prev) => prev.map((d, idx) => idx === i ? { ...d, _deleted: false } : d))

  const addNew = () =>
    setDrafts((prev) => [...prev, { date: '', time: '', endTime: '', _new: true }])

  const save = async () => {
    const toBuildIso = (d: DraftDate) => {
      const startStr = d.time ? `${d.date}T${d.time}:00` : `${d.date}T00:00:00`
      const endIso = d.time && d.endTime ? new Date(`${d.date}T${d.endTime}:00`).toISOString() : null
      return { startIso: new Date(startStr).toISOString(), endIso }
    }
    const visible = drafts.filter((d) => !d._deleted)
    if (visible.length === 0) return alert('少なくとも1件の候補が必要です')
    for (const d of visible) {
      if (!d.date) return alert('すべての候補に日付を入力してください')
    }
    setSaving(true)
    try {
      const toDelete = drafts.filter((d) => d._deleted && d.id).map((d) => d.id as string)
      if (toDelete.length > 0) {
        await supabase.from('event_responses').delete().in('event_date_id', toDelete)
        await supabase.from('event_dates').delete().in('id', toDelete)
      }
      const toInsert = drafts.filter((d) => d._new && !d._deleted).map((d) => {
        const { startIso, endIso } = toBuildIso(d)
        return { event_id: eventId, date: startIso, end_time: endIso }
      })
      if (toInsert.length > 0) {
        await supabase.from('event_dates').insert(toInsert)
      }
      const toUpdate = drafts.filter((d) => !d._new && !d._deleted && d.id)
      for (const d of toUpdate) {
        const orig = dates.find((x) => x.id === d.id)
        if (!orig) continue
        const { startIso, endIso } = toBuildIso(d)
        const origEndIso = orig.end_time ? new Date(orig.end_time).toISOString() : null
        if (orig.date !== startIso || origEndIso !== endIso) {
          await supabase.from('event_dates').update({ date: startIso, end_time: endIso }).eq('id', d.id as string)
        }
      }
      await onSaved()
      onClose()
    } catch (e) {
      alert(`保存に失敗しました: ${e}`)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <CalendarCog size={16} className="text-[#1f7a00]" />
            <h3 className="font-semibold text-gray-900 text-sm">候補日時を編集</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {drafts.map((d, i) => (
            <div key={i} className={`flex items-center gap-2 flex-wrap p-2 rounded-xl ${d._deleted ? 'bg-red-50 opacity-60' : 'bg-gray-50'}`}>
              <span className="text-xs text-gray-400 w-4 text-center">{i + 1}</span>
              <input
                type="date"
                value={d.date}
                disabled={d._deleted}
                onChange={(e) => update(i, 'date', e.target.value)}
                className="flex-1 min-w-[120px] text-sm text-gray-800 border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:bg-gray-100"
              />
              <input
                type="time"
                value={d.time}
                disabled={d._deleted}
                onChange={(e) => update(i, 'time', e.target.value)}
                className="w-20 text-sm text-gray-800 border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:bg-gray-100"
              />
              <span className="text-xs text-gray-400">〜</span>
              <input
                type="time"
                value={d.endTime}
                disabled={d._deleted || !d.time}
                onChange={(e) => update(i, 'endTime', e.target.value)}
                className="w-20 text-sm text-gray-800 border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:bg-gray-100"
              />
              {d._deleted ? (
                <button onClick={() => undo(i)} className="text-xs text-accel-active hover:text-accel-active px-2">戻す</button>
              ) : (
                <button onClick={() => remove(i)} className="text-gray-300 hover:text-red-400 transition-colors">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addNew}
            className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2.5 border border-dashed border-gray-300 rounded-xl hover:border-gray-400 transition-colors"
          >
            <Plus size={14} /> 候補を追加
          </button>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            キャンセル
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#1f7a00] hover:bg-[#145200] disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
            保存する
          </button>
        </div>
      </div>
    </div>
  )
}

type CoverTab = 'url' | 'ai' | 'gallery'

function CoverEditorModal({
  eventId,
  title,
  currentUrl,
  onClose,
  onSaved,
}: {
  eventId: string
  title: string
  currentUrl: string
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [url, setUrl] = useState(currentUrl)
  const [saving, setSaving] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [tab, setTab] = useState<CoverTab>('url')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [aiInfo, setAiInfo] = useState<{ keyword?: string; source?: string; note?: string } | null>(null)

  const aiFetch = async () => {
    setFetching(true)
    setAiInfo(null)
    try {
      const res = await fetch('/api/events/cover-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const json = await res.json()
      if (json.url) {
        setUrl(json.url)
        setAiInfo({ keyword: json.keyword, source: json.source, note: json.note })
      } else alert('取得に失敗しました')
    } catch {
      alert('取得に失敗しました')
    }
    setFetching(false)
  }

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/events/upload-cover', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error ?? 'アップロードに失敗しました')
      } else if (json.url) {
        setUrl(json.url)
      }
    } catch (e) {
      alert(`アップロード失敗: ${e}`)
    }
    setUploading(false)
  }

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.from('events').update({ cover_image_url: url.trim() || null }).eq('id', eventId)
    setSaving(false)
    if (error) return alert(`保存に失敗: ${error.message}`)
    await onSaved()
    onClose()
  }

  const tabBtn = (key: CoverTab, label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${
        tab === key ? 'border-[#279300] text-[#1f7a00]' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ImageIcon size={16} className="text-[#1f7a00]" />
            <h3 className="font-semibold text-gray-900 text-sm">カバー画像を変更</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-2 flex-shrink-0">
          <div className="rounded-xl overflow-hidden aspect-[16/7] bg-gray-100 border border-gray-200">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="preview" loading="lazy" decoding="async" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full" style={{ background: gradientFor(title) }} />
            )}
          </div>
        </div>

        <div className="flex border-b border-gray-100 px-2 flex-shrink-0">
          {tabBtn('url', 'URL/アップロード')}
          {tabBtn('ai', 'AI生成')}
          {tabBtn('gallery', 'ギャラリー')}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {tab === 'url' && (
            <>
              <div>
                <label className="block text-[14px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">画像URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://... または下のボタンから"
                  className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#279300]/20 focus:border-[#279300]"
                />
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {uploading ? <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-gray-700 rounded-full animate-spin" /> : <Upload size={14} />}
                {uploading ? 'アップロード中…' : 'ファイルから選択 (5MBまで)'}
              </button>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                  e.target.value = ''
                }}
              />
            </>
          )}
          {tab === 'ai' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 leading-relaxed">
                タイトル「<span className="font-medium text-gray-700">{title}</span>」を英語キーワードに変換して Unsplash から関連画像を取得します。
              </p>
              <button
                onClick={aiFetch}
                disabled={fetching}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-[#1f7a00] border border-[#279300]/30 rounded-xl hover:bg-accel-lightest disabled:opacity-50 transition-colors"
              >
                {fetching ? <div className="w-4 h-4 border-2 border-[#279300]/40 border-t-[#279300] rounded-full animate-spin" /> : <Sparkles size={14} />}
                {aiInfo ? '別の画像を生成' : 'AI生成'}
              </button>
              {aiInfo && (
                <div className="text-[14px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2 space-y-0.5">
                  {aiInfo.keyword && <div>キーワード: <span className="text-gray-700 font-medium">{aiInfo.keyword}</span></div>}
                  {aiInfo.source && (
                    <div>
                      ソース: <span className={`font-medium ${aiInfo.source === 'unsplash' ? 'text-green-600' : 'text-amber-600'}`}>{aiInfo.source}</span>
                    </div>
                  )}
                  {aiInfo.note && <div className="text-amber-600">{aiInfo.note}</div>}
                </div>
              )}
            </div>
          )}
          {tab === 'gallery' && (
            <GalleryPicker onSelect={(u) => setUrl(u)} selectedUrl={url} />
          )}
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            キャンセル
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#1f7a00] hover:bg-[#145200] disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
            保存する
          </button>
        </div>
      </div>
    </div>
  )
}
