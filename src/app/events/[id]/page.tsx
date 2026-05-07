'use client'

import { use, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays, Clock, CheckCircle2, Copy, Check, Plus, Trash2, UserPlus, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

const SLACK_USER_KEY = 'abc_slackUser'
const ADMIN_SLACK_USER_ID = 'U058FM3EFE0'
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
  created_at: string
}

interface EventDate {
  id: string
  event_id: string
  date: string
}

interface EventResponse {
  id: string
  event_id: string
  event_date_id: string
  responder_name: string
  response: ResponseType
}

interface ProxyEntry {
  name: string
  draft: Record<string, ResponseType>
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
    <div className="flex gap-1.5">
      {RESPONSES.map((res) => (
        <button
          key={res}
          type="button"
          onClick={() => onChange(dateId, res)}
          className={`w-10 h-10 rounded-xl text-base border transition-all ${
            value === res
              ? RESPONSE_SELECTED[res]
              : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
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

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SLACK_USER_KEY)
      if (saved) {
        const u = JSON.parse(saved)
        setMyName(u.display_name ?? '')
        setMySlackUserId(u.slack_user_id ?? null)
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
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [id, loadData])

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
    const upsertRows = dates.map((d) => ({
      event_id: id,
      event_date_id: d.id,
      responder_name: myName.trim(),
      response: draft[d.id],
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
    const rows = valid.flatMap((entry) =>
      dates.map((d) => ({
        event_id: id,
        event_date_id: d.id,
        responder_name: entry.name.trim(),
        response: entry.draft[d.id],
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
  const respondents = [...new Set(responses.map((r) => r.responder_name))].sort()
  const countByDate = (dateId: string, res: ResponseType) =>
    responses.filter((r) => r.event_date_id === dateId && r.response === res).length

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2563eb]/30 border-t-[#2563eb] rounded-full animate-spin" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center">
        <div className="text-center text-gray-400">
          <p>イベントが見つかりません</p>
          <Link href="/events" className="mt-4 inline-block text-[#2563eb] text-sm hover:underline">一覧に戻る</Link>
        </div>
      </div>
    )
  }

  const isPast = event.deadline ? new Date(event.deadline) < new Date() : false

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/events" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm hidden sm:inline">一覧</span>
          </Link>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="font-bold text-gray-900 text-[15px] flex-1 truncate">{event.title}</h1>
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

      <main className="max-w-4xl mx-auto px-4 py-6 pb-20 space-y-4">
        {/* Event info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            {event.confirmed_date ? (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                <CheckCircle2 size={11} /> 日程確定
              </span>
            ) : (
              <span className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full font-medium">回答受付中</span>
            )}
            {isPast && !event.confirmed_date && (
              <span className="text-xs px-2.5 py-1 bg-red-50 text-red-500 rounded-full font-medium">締切済み</span>
            )}
          </div>
          <h2 className="text-xl font-bold text-gray-900 leading-snug">{event.title}</h2>
          {event.description && <p className="mt-2 text-sm text-gray-600 leading-relaxed">{event.description}</p>}
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

        {/* Response table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-semibold text-gray-900 text-sm">回答状況</span>
            <span className="text-xs text-gray-400">{respondents.length}人回答</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ minWidth: Math.max(400, 200 + respondents.length * 64) }}>
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 sticky left-0 bg-gray-50/80 z-10 min-w-[140px]">日程</th>
                  {respondents.map((name) => (
                    <th key={name} className="text-center text-xs font-medium text-gray-600 px-2 py-2.5 min-w-[56px]">
                      <div className="flex flex-col items-center gap-1">
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
                  ))}
                  <th className="text-center text-xs font-semibold text-gray-500 px-2 py-2.5 min-w-[40px]">○</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-2 py-2.5 min-w-[40px]">△</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-2 py-2.5 min-w-[40px]">×</th>
                </tr>
              </thead>
              <tbody>
                {dates.map((d) => {
                  const okCount = countByDate(d.id, '○')
                  return (
                    <tr key={d.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 sticky left-0 bg-white hover:bg-gray-50/50 z-10">
                        <div className="font-medium text-gray-900 text-xs leading-snug">
                          {format(new Date(d.date), 'M/d(E)', { locale: ja })}
                        </div>
                        {(new Date(d.date).getHours() !== 0 || new Date(d.date).getMinutes() !== 0) && (
                          <div className="text-[11px] text-gray-400">{format(new Date(d.date), 'HH:mm')}</div>
                        )}
                        <div className={`mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded font-medium ${scoreColor(okCount, respondents.length)}`}>
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
                  className="flex-1 text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
                />
                <button onClick={() => setNameEditing(false)} className="text-xs text-[#2563eb] px-3 py-2.5 border border-[#2563eb]/30 rounded-xl hover:bg-blue-50 transition-colors">
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
            {dates.map((d) => (
              <div key={d.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-800 font-medium">
                    {format(new Date(d.date), 'M/d(E)', { locale: ja })}
                    {(new Date(d.date).getHours() !== 0 || new Date(d.date).getMinutes() !== 0) &&
                      <span className="text-gray-400 ml-1 text-xs">{format(new Date(d.date), 'HH:mm')}</span>
                    }
                  </span>
                </div>
                <ResponseButtons
                  dateId={d.id}
                  value={draft[d.id]}
                  onChange={(dateId, res) => setDraft((prev) => ({ ...prev, [dateId]: res }))}
                />
              </div>
            ))}
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving || !myName.trim()}
            className="w-full py-3 bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
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
                        className="flex-1 text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] bg-white"
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
                      {dates.map((d) => (
                        <div key={d.id} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0 text-xs text-gray-600 font-medium">
                            {format(new Date(d.date), 'M/d(E)', { locale: ja })}
                            {(new Date(d.date).getHours() !== 0 || new Date(d.date).getMinutes() !== 0) &&
                              <span className="text-gray-400 ml-1">{format(new Date(d.date), 'HH:mm')}</span>
                            }
                          </div>
                          <ResponseButtons
                            dateId={d.id}
                            value={entry.draft[d.id]}
                            onChange={(dateId, res) => updateProxyDraft(i, dateId, res)}
                          />
                        </div>
                      ))}
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
    </div>
  )
}
