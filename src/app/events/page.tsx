'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, Plus, Clock, CheckCircle2, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

const SLACK_USER_KEY = 'abc_slackUser'

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
  deadline: string | null
  confirmed_date: string | null
  created_at: string
  date_count?: number
  response_count?: number
  dates?: EventDate[]
}

export default function EventsPage() {
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [myName, setMyName] = useState<string | null>(null)

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
        .limit(50)

      if (!data || data.length === 0) {
        setEvents([])
        setLoading(false)
        return
      }

      const ids = data.map((e) => e.id)

      // Scope dates+responses to just the loaded events
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

  return (
    <div className="min-h-screen bg-[#f7faf2]">
      {/* 見出しと戻るリンクは共通ヘッダー（AppHeader）が出す。
          ここには固有の操作だけを置く */}
      {myName && (
        <div className="max-w-content mx-auto px-4 pt-6">
          <button onClick={() => router.push('/events/new')} className="btn-primary">
            <Plus size={18} /> イベントを作成
          </button>
        </div>
      )}

      <main className="max-w-content mx-auto px-4 py-6 pb-bottom-nav space-y-3">
        {!myName && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            Slackログイン後にイベントを作成できます
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-2/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <CalendarDays size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">まだイベントがありません</p>
            {myName && (
              <Link href="/events/new" className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-[#1f7a00] text-white rounded-xl text-sm font-medium hover:bg-[#145200] transition-colors">
                <Plus size={15} /> 最初のイベントを作成
              </Link>
            )}
          </div>
        ) : (
          events.map((ev) => (
            <Link key={ev.id} href={`/events/${ev.id}`} className="block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-[#279300]/20 transition-all p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {ev.confirmed_date ? (
                      <span className="flex items-center gap-1 text-[14px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                        <CheckCircle2 size={10} /> 日程確定
                      </span>
                    ) : (
                      <span className="text-[14px] px-2 py-0.5 bg-accel-lightest text-accel-active rounded-full font-medium">
                        回答受付中
                      </span>
                    )}
                    {ev.deadline && new Date(ev.deadline) < new Date() && !ev.confirmed_date && (
                      <span className="text-[14px] px-2 py-0.5 bg-red-50 text-red-500 rounded-full font-medium">締切済み</span>
                    )}
                  </div>
                  <h2 className="font-semibold text-gray-900 text-sm leading-relaxed truncate">{ev.title}</h2>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                    <span>作成者: {ev.created_by}</span>
                    <span>{ev.response_count}人回答</span>
                    {ev.deadline && (
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        締切 {format(new Date(ev.deadline), 'M/d', { locale: ja })}
                      </span>
                    )}
                    {ev.confirmed_date && (
                      <span className="text-green-600 font-medium">
                        確定: {format(new Date(ev.confirmed_date), 'M/d(E) HH:mm', { locale: ja })}
                      </span>
                    )}
                  </div>
                  {(ev.dates ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(ev.dates ?? []).slice(0, 3).map((d) => {
                        const dt = new Date(d.date)
                        const hasTime = dt.getHours() !== 0 || dt.getMinutes() !== 0
                        const base = format(dt, hasTime ? 'M/d(E) HH:mm' : 'M/d(E)', { locale: ja })
                        const label = hasTime && d.end_time ? `${base}〜${format(new Date(d.end_time), 'HH:mm')}` : base
                        return (
                          <span key={d.id} className="text-[14px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                            {label}
                          </span>
                        )
                      })}
                      {(ev.dates ?? []).length > 3 && (
                        <span className="text-[14px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                          他{(ev.dates ?? []).length - 3}件
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-300 flex-shrink-0 mt-1" />
              </div>
            </Link>
          ))
        )}
      </main>
    </div>
  )
}
