'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, CalendarDays, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const SLACK_USER_KEY = 'abc_slackUser'

interface Channel {
  id: string
  name: string
  slack_channel_id: string | null
}

interface DateSlot {
  date: string
  time: string
}

export default function NewEventPage() {
  const router = useRouter()
  const [myName, setMyName] = useState<string | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [notifyChannelId, setNotifyChannelId] = useState('')
  const [dateSlots, setDateSlots] = useState<DateSlot[]>([
    { date: '', time: '' },
    { date: '', time: '' },
  ])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SLACK_USER_KEY)
      if (saved) setMyName(JSON.parse(saved).display_name ?? null)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    supabase.from('channels').select('id, name, slack_channel_id').eq('is_hidden', false).order('name').then(({ data }) => {
      setChannels((data ?? []) as Channel[])
      if (data && data.length > 0) setNotifyChannelId('')
    })
  }, [])

  const addSlot = () => setDateSlots((prev) => [...prev, { date: '', time: '' }])
  const removeSlot = (i: number) => setDateSlots((prev) => prev.filter((_, idx) => idx !== i))
  const updateSlot = (i: number, field: 'date' | 'time', val: string) =>
    setDateSlots((prev) => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s))

  const handleSubmit = async () => {
    if (!myName) return alert('Slackログインが必要です')
    if (!title.trim()) return alert('タイトルを入力してください')
    const validSlots = dateSlots.filter((s) => s.date)
    if (validSlots.length === 0) return alert('候補日程を1つ以上入力してください')

    setSaving(true)
    try {
      // Create event
      const { data: ev, error: evErr } = await supabase
        .from('events')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          created_by: myName,
          deadline: deadline ? new Date(deadline).toISOString() : null,
        })
        .select()
        .single()

      if (evErr || !ev) throw new Error(evErr?.message ?? 'イベント作成失敗')

      // Create event_dates
      const dateRows = validSlots.map((s) => {
        const dt = s.time ? `${s.date}T${s.time}:00` : `${s.date}T00:00:00`
        return { event_id: ev.id, date: new Date(dt).toISOString() }
      })
      const { error: datesErr } = await supabase.from('event_dates').insert(dateRows)
      if (datesErr) throw new Error(datesErr.message)

      // Slack notification
      if (notifyChannelId) {
        const ch = channels.find((c) => c.id === notifyChannelId)
        if (ch?.slack_channel_id) {
          await fetch('/api/events/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slack_channel_id: ch.slack_channel_id,
              event_id: ev.id,
              title: ev.title,
              created_by: myName,
              deadline: ev.deadline,
              date_count: dateRows.length,
            }),
          }).catch(() => { /* ignore notify error */ })
        }
      }

      router.push(`/events/${ev.id}`)
    } catch (e) {
      alert(`エラー: ${e}`)
    }
    setSaving(false)
  }

  if (!myName) {
    return (
      <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center max-w-sm w-full shadow-sm">
          <CalendarDays size={40} className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 font-medium mb-2">Slackログインが必要です</p>
          <Link href="/chat" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2563eb] text-white rounded-xl text-sm hover:bg-[#1d4ed8] transition-colors">
            ログインページへ
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/events" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm hidden sm:inline">イベント一覧</span>
          </Link>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="font-bold text-gray-900 text-[15px] flex-1">イベントを作成</h1>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send size={13} />}
            作成する
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-20 space-y-4">
        {/* Basic info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">タイトル *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：5月勉強会の日程調整"
              className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">説明（任意）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="詳細や注意事項など"
              rows={3}
              className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">回答締切（任意）</label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Slack通知先</label>
              <select
                value={notifyChannelId}
                onChange={(e) => setNotifyChannelId(e.target.value)}
                className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] bg-white"
              >
                <option value="">通知しない</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>#{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Date slots */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 text-sm">候補日程</h2>
            <button
              onClick={addSlot}
              className="flex items-center gap-1 text-xs text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors"
            >
              <Plus size={13} /> 日程を追加
            </button>
          </div>

          <div className="space-y-2.5">
            {dateSlots.map((slot, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-4 text-center flex-shrink-0">{i + 1}</span>
                <input
                  type="date"
                  value={slot.date}
                  onChange={(e) => updateSlot(i, 'date', e.target.value)}
                  className="flex-1 text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
                />
                <input
                  type="time"
                  value={slot.time}
                  onChange={(e) => updateSlot(i, 'time', e.target.value)}
                  className="w-28 text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
                  placeholder="未定"
                />
                {dateSlots.length > 1 && (
                  <button onClick={() => removeSlot(i)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors"
        >
          {saving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send size={15} />}
          イベントを作成する
        </button>
      </main>
    </div>
  )
}
