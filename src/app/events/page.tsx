'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, Plus, Clock, CheckCircle2, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Avatar from '@/components/Avatar'

const SLACK_USER_KEY = 'abc_slackUser'

/** カテゴリー。DB 側の CHECK 制約と同じ 4 つ。増やすときは SQL も直すこと */
const CATEGORIES = ['勉強会', '食事会', 'レジャー', 'その他'] as const
type Category = typeof CATEGORIES[number]

const CATEGORY_STYLE: Record<Category, string> = {
  勉強会: 'bg-accel-lightest text-accel-text',
  食事会: 'bg-amber-100 text-amber-800',
  レジャー: 'bg-sky-100 text-sky-800',
  その他: 'bg-gray-100 text-gray-700',
}

interface EventDate {
  id: string
  date: string
  end_time?: string | null
}

interface Event {
  id: string
  title: string
  description: string | null
  created_by: string
  created_by_avatar?: string | null
  category?: string | null
  cover_image_url?: string | null
  deadline: string | null
  confirmed_date: string | null
  created_at: string
  date_count?: number
  response_count?: number
  dates?: EventDate[]
}

/** 一覧を 3 つに分けるための状態 */
type Phase = 'adjusting' | 'fixed' | 'ended'

/**
 * イベントがどの段落に入るかを決める。
 *
 *   終了       開催日が過去 ／ または候補日がすべて過去
 *   開催日決定 開催日が未来
 *   調整中     それ以外
 *
 * 候補日も見るのは、開催日を設定する手段が今まで無く、
 * 過去に開催済みのイベントも confirmed_date が空のままだから。
 * これを見ないと既存の 23 件が全部「調整中」に並んでしまう。
 */
function phaseOf(ev: Event): Phase {
  const now = new Date()

  if (ev.confirmed_date) {
    return new Date(ev.confirmed_date) < now ? 'ended' : 'fixed'
  }

  const dates = ev.dates ?? []
  if (dates.length > 0 && dates.every((d) => new Date(d.end_time ?? d.date) < now)) {
    return 'ended'
  }

  return 'adjusting'
}

/** 並び替えに使う日付。開催日が無いイベントは候補日の最後を使う */
function sortKeyOf(ev: Event): string {
  if (ev.confirmed_date) return ev.confirmed_date
  const dates = (ev.dates ?? []).map((d) => d.date).sort()
  return dates[dates.length - 1] ?? ev.created_at
}

const PHASES: { key: Phase; label: string; note: string }[] = [
  { key: 'fixed', label: '開催日が決まったイベント', note: '日程が確定しています' },
  { key: 'adjusting', label: '調整中のイベント', note: '回答を受け付けています' },
  { key: 'ended', label: '終了したイベント', note: '開催日が過ぎました' },
]

export default function EventsPage() {
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [myName, setMyName] = useState<string | null>(null)
  const [filter, setFilter] = useState<Category | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SLACK_USER_KEY)
      if (saved) setMyName(JSON.parse(saved).display_name ?? null)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (!data || data.length === 0) {
        setEvents([])
        setLoading(false)
        return
      }

      const ids = data.map((e) => e.id)
      const [datesRes, respRes] = await Promise.all([
        supabase.from('event_dates').select('event_id, id, date, end_time').in('event_id', ids).order('date'),
        supabase.from('event_responses').select('event_id, responder_name').in('event_id', ids),
      ])

      const datesByEvent: Record<string, EventDate[]> = {}
      for (const d of (datesRes.data ?? []) as Array<{ event_id: string; id: string; date: string; end_time?: string | null }>) {
        if (!datesByEvent[d.event_id]) datesByEvent[d.event_id] = []
        datesByEvent[d.event_id].push({ id: d.id, date: d.date, end_time: d.end_time ?? null })
      }
      const responseCounts: Record<string, Set<string>> = {}
      for (const r of respRes.data ?? []) {
        if (!responseCounts[r.event_id]) responseCounts[r.event_id] = new Set()
        responseCounts[r.event_id].add(r.responder_name)
      }

      setEvents(data.map((e) => ({
        ...e,
        dates: datesByEvent[e.id] ?? [],
        date_count: datesByEvent[e.id]?.length ?? 0,
        response_count: responseCounts[e.id]?.size ?? 0,
      })))
      setLoading(false)
    }
    load()
  }, [])

  // 3 ブロックに振り分ける。
  // 開催日決定は近い順、それ以外は新しい順。
  const grouped = useMemo(() => {
    const target = filter ? events.filter((e) => (e.category ?? 'その他') === filter) : events
    const out: Record<Phase, Event[]> = { fixed: [], adjusting: [], ended: [] }
    for (const ev of target) out[phaseOf(ev)].push(ev)
    // 開催予定は近い順、終了は新しい順
    out.fixed.sort((a, b) => sortKeyOf(a).localeCompare(sortKeyOf(b)))
    out.ended.sort((a, b) => sortKeyOf(b).localeCompare(sortKeyOf(a)))
    return out
  }, [events, filter])

  return (
    <div className="min-h-screen bg-[#f7faf2]">
      <div className="max-w-content mx-auto px-4 pt-6 flex flex-wrap items-center gap-3">
        {/* カテゴリーの絞り込みを左、作成ボタンを右に置く */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilter(null)}
            className={`px-3.5 py-2 rounded-full text-sm font-bold transition-colors ${
              filter === null ? 'bg-accel-active text-white' : 'bg-white border border-border-soft text-gray-600 hover:bg-accel-lightest'
            }`}
          >
            すべて
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(filter === c ? null : c)}
              className={`px-3.5 py-2 rounded-full text-sm font-bold transition-colors ${
                filter === c ? 'bg-accel-active text-white' : 'bg-white border border-border-soft text-gray-600 hover:bg-accel-lightest'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {myName && (
          <button onClick={() => router.push('/events/new')} className="btn-primary sm:ml-auto">
            <Plus size={18} /> イベントを作成
          </button>
        )}
      </div>

      <main className="max-w-content mx-auto px-4 py-6 pb-bottom-nav space-y-10">
        {!myName && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            Slack ログイン後にイベントを作成できます
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-3xl border border-accel-lightest overflow-hidden animate-pulse">
                <div className="aspect-video bg-accel-lightest/60" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-accel-lightest/60 rounded w-3/4" />
                  <div className="h-3 bg-accel-lightest/50 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <CalendarDays size={44} className="mx-auto mb-3 opacity-30" />
            <p>まだイベントがありません</p>
            {myName && (
              <Link href="/events/new" className="btn-primary mt-5">
                <Plus size={18} /> 最初のイベントを作成
              </Link>
            )}
          </div>
        ) : (
          PHASES.map(({ key, label, note }) => {
            const list = grouped[key]
            // 空のブロックは出さない。20 件程度だと 3 つ並べると寂しくなる
            if (list.length === 0) return null
            return (
              <section key={key}>
                <div className="flex items-baseline gap-3 mb-4">
                  <h2 className="text-xl font-bold text-accel-dark">{label}</h2>
                  <span className="text-sm text-gray-500">{list.length}件 ／ {note}</span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {list.map((ev) => (
                    <EventCard key={ev.id} ev={ev} phase={key} />
                  ))}
                </div>
              </section>
            )
          })
        )}
      </main>
    </div>
  )
}

function EventCard({ ev, phase }: { ev: Event; phase: Phase }) {
  const category = (ev.category ?? 'その他') as Category
  const catStyle = CATEGORY_STYLE[category] ?? CATEGORY_STYLE['その他']

  return (
    <Link
      href={`/events/${ev.id}`}
      className={`group flex flex-col bg-white rounded-3xl border border-accel-lightest shadow-sm hover:shadow-lg hover:border-accel-light transition-all overflow-hidden ${
        phase === 'ended' ? 'opacity-75 hover:opacity-100' : ''
      }`}
    >
      {/* サムネイル */}
      <div className="aspect-video bg-accel-lightest/50 relative overflow-hidden">
        {ev.cover_image_url ? (
          // next/image を使わない。外部ドメインが増えるとページ全体が落ちるため
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ev.cover_image_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <CalendarDays size={36} className="text-accel-light" />
          </div>
        )}
        {phase === 'ended' && (
          <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-gray-900/80 text-white text-xs font-bold">
            終了
          </span>
        )}
        {phase === 'fixed' && (
          <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-accel-primary text-white text-xs font-bold">
            開催決定
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1 gap-2.5">
        <h3 className="font-bold text-accel-dark text-base leading-relaxed line-clamp-2">
          {ev.title}
        </h3>

        {/* タグ */}
        <div className="flex flex-wrap gap-1.5">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${catStyle}`}>
            {category}
          </span>
          {phase === 'fixed' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-accel-primary text-white">
              <CheckCircle2 size={13} /> 開催決定
            </span>
          )}
          {phase === 'adjusting' && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-accel-lightest text-accel-active">
              調整中
            </span>
          )}
        </div>

        {/* 日付 */}
        <div className="text-sm text-gray-600 space-y-1">
          {ev.confirmed_date ? (
            <p className="flex items-center gap-1.5 font-bold text-accel-active">
              <CalendarDays size={15} />
              {format(new Date(ev.confirmed_date), 'M月d日(E) HH:mm', { locale: ja })}
            </p>
          ) : phase === 'ended' ? (
            // 開催日が未設定のまま候補日が過ぎたイベント。
            // 最後の候補日を目安として出す
            <p className="flex items-center gap-1.5 text-gray-500">
              <CalendarDays size={15} className="text-gray-400" />
              {format(new Date(sortKeyOf(ev)), 'yyyy年M月', { locale: ja })}頃
            </p>
          ) : (
            <>
              <p className="flex items-center gap-1.5">
                <CalendarDays size={15} className="text-gray-400" />
                候補 {ev.date_count}日
              </p>
              {ev.deadline && (
                <p className="flex items-center gap-1.5 text-gray-500">
                  <Clock size={15} className="text-gray-400" />
                  締切 {format(new Date(ev.deadline), 'M/d', { locale: ja })}
                </p>
              )}
            </>
          )}
        </div>

        {/* 作成者と回答数 */}
        <div className="mt-auto pt-2.5 border-t border-gray-100 flex items-center gap-2">
          <Avatar src={ev.created_by_avatar} name={ev.created_by} size={28} />
          <span className="text-sm text-gray-600 truncate flex-1">{ev.created_by}</span>
          <span className="inline-flex items-center gap-1 text-sm text-gray-500 flex-shrink-0">
            <Users size={15} />
            {ev.response_count}
          </span>
        </div>
      </div>
    </Link>
  )
}
