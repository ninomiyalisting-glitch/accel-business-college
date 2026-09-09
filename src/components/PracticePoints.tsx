'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Award, Plus, Pencil, Trash2, X, Check, Loader2 } from 'lucide-react'

/**
 * 実務従事更新ポイント獲得履歴。
 * 追加・編集・削除は /api/practice-points を通す。署名済み Cookie で本人判定するので、
 * ここでのボタンの出し分けは見た目の都合であり、実際の強制はサーバー側にある。
 */

type Row = {
  id: string
  slack_user_id: string
  activity: string
  worked_on: string
  worked_note: string | null
  points: number
  created_at: string
}

type Summary = { year: number; points: number; count: number }

const POINT_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1)

function jpDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Draft = { activity: string; worked_on: string; worked_note: string; points: number }
const EMPTY_DRAFT: Draft = { activity: '', worked_on: today(), worked_note: '', points: 1 }

export default function PracticePoints({ slackUserId }: { slackUserId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<Summary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isOwner, setIsOwner] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/practice-points?slack_user_id=${encodeURIComponent(slackUserId)}`)
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? `履歴を読み込めませんでした（${res.status}）`)
        return
      }
      setRows(json.rows ?? [])
      setSummary(json.summary ?? [])
    } catch {
      setError('通信に失敗しました。電波の良い場所で再度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [slackUserId])

  useEffect(() => { load() }, [load])

  // 本人かどうかはサーバーに聞く（localStorage は書き換えられるため）
  useEffect(() => {
    let alive = true
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setIsOwner(j?.slack_user_id === slackUserId) })
      .catch(() => { /* 判定できないときは編集不可のまま */ })
    return () => { alive = false }
  }, [slackUserId])

  const total = useMemo(() => rows.reduce((s, r) => s + r.points, 0), [rows])

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const isEdit = editingId !== null
      const res = await fetch('/api/practice-points', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? { id: editingId } : {}),
          activity: draft.activity,
          worked_on: draft.worked_on,
          worked_note: draft.worked_note,
          points: draft.points,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? `保存できませんでした（${res.status}）`)
        return
      }
      setAdding(false)
      setEditingId(null)
      setDraft(EMPTY_DRAFT)
      await load()
    } catch {
      setError('通信に失敗しました。もう一度お試しください。')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row: Row) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/practice-points?id=${encodeURIComponent(row.id)}`, { method: 'DELETE' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? `削除できませんでした（${res.status}）`)
        return
      }
      await load()
    } catch {
      setError('通信に失敗しました。もう一度お試しください。')
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (row: Row) => {
    setEditingId(row.id)
    setAdding(false)
    setDraft({
      activity: row.activity,
      worked_on: row.worked_on,
      worked_note: row.worked_note ?? '',
      points: row.points,
    })
  }

  const cancel = () => {
    setAdding(false)
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  const formOpen = adding || editingId !== null

  return (
    <section className="bg-white rounded-3xl border border-accel-lightest shadow-sm overflow-hidden">
      <div className="px-5 sm:px-6 pt-5 pb-4 bg-gradient-to-br from-accel-lightest/70 to-white">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center justify-center w-9 h-9 rounded-2xl bg-white text-accel-active shadow-sm">
            <Award size={18} />
          </span>
          <h2 className="text-lg font-bold text-accel-dark">実務従事更新ポイント獲得履歴</h2>
          {!loading && rows.length > 0 && (
            <span className="ml-auto text-sm text-accel-active font-semibold">
              累計 {total} ポイント
            </span>
          )}
        </div>

        {/* 年ごとの合計 */}
        {summary.length > 0 && (
          <div className="mt-4 flex gap-2.5 overflow-x-auto pb-1">
            {summary.map((s) => (
              <div
                key={s.year}
                className="flex-shrink-0 min-w-[7.5rem] bg-white rounded-2xl border border-accel-lightest px-4 py-3"
              >
                <p className="text-xs text-gray-500">{s.year}年 合計</p>
                <p className="text-xl font-bold text-accel-active leading-relaxed">
                  {s.points}
                  <span className="text-sm font-semibold text-gray-500 ml-1">ポイント</span>
                </p>
                <p className="text-xs text-gray-400">{s.count}件</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 sm:px-6 py-5">
        {error && (
          <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">
            {isOwner
              ? 'まだ記録がありません。「追加」から実務従事の記録を残せます。'
              : 'まだ記録がありません。'}
          </p>
        ) : (
          <div className="overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6">
            <table className="w-full min-w-[38rem] text-sm border-collapse">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="font-semibold pb-2 pr-4 whitespace-nowrap">記入日</th>
                  <th className="font-semibold pb-2 pr-4">活動内容</th>
                  <th className="font-semibold pb-2 pr-4 whitespace-nowrap">稼働日</th>
                  <th className="font-semibold pb-2 pr-4 whitespace-nowrap text-right">獲得ポイント数</th>
                  {isOwner && <th className="pb-2 w-20" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 align-top">
                    <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">{jpDate(row.created_at)}</td>
                    <td className="py-3 pr-4 text-gray-900">{row.activity}</td>
                    <td className="py-3 pr-4 text-gray-700 whitespace-nowrap">
                      {jpDate(row.worked_on)}
                      {row.worked_note && (
                        <span className="block text-xs text-gray-400">{row.worked_note}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right font-bold text-accel-active whitespace-nowrap">
                      {row.points}
                    </td>
                    {isOwner && (
                      <td className="py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => startEdit(row)}
                            disabled={busy}
                            title="編集"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-accel-active hover:bg-accel-lightest transition-colors disabled:opacity-50"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => remove(row)}
                            disabled={busy}
                            title="削除"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 追加・編集フォーム */}
        {isOwner && formOpen && (
          <div className="mt-5 bg-accel-lightest/40 border border-accel-lightest rounded-2xl p-4 sm:p-5 space-y-4">
            <p className="text-sm font-bold text-accel-dark">
              {editingId ? '記録を編集' : '記録を追加'}
            </p>

            <div>
              <label htmlFor="pp-activity" className="block text-sm font-semibold text-gray-700 mb-1.5">
                活動内容
              </label>
              <textarea
                id="pp-activity"
                value={draft.activity}
                onChange={(e) => setDraft({ ...draft, activity: e.target.value })}
                placeholder="例：製造業A社の経営改善計画策定を支援"
                rows={2}
                className="w-full px-4 py-3 bg-white border border-border-soft rounded-xl focus:outline-none focus:ring-2 focus:ring-accel-primary/25 focus:border-accel-primary"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pp-worked-on" className="block text-sm font-semibold text-gray-700 mb-1.5">
                  稼働日
                </label>
                <input
                  id="pp-worked-on"
                  type="date"
                  value={draft.worked_on}
                  onChange={(e) => setDraft({ ...draft, worked_on: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-border-soft rounded-xl focus:outline-none focus:ring-2 focus:ring-accel-primary/25 focus:border-accel-primary"
                />
              </div>
              <div>
                <label htmlFor="pp-points" className="block text-sm font-semibold text-gray-700 mb-1.5">
                  獲得ポイント数
                </label>
                <select
                  id="pp-points"
                  value={draft.points}
                  onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-white border border-border-soft rounded-xl focus:outline-none focus:ring-2 focus:ring-accel-primary/25 focus:border-accel-primary"
                >
                  {POINT_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="pp-note" className="block text-sm font-semibold text-gray-700 mb-1.5">
                稼働日の補足<span className="text-gray-400 font-normal ml-1">任意</span>
              </label>
              <input
                id="pp-note"
                type="text"
                value={draft.worked_note}
                onChange={(e) => setDraft({ ...draft, worked_note: e.target.value })}
                placeholder="例：6/1〜6/3 の3日間"
                className="w-full px-4 py-3 bg-white border border-border-soft rounded-xl focus:outline-none focus:ring-2 focus:ring-accel-primary/25 focus:border-accel-primary"
              />
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                onClick={submit}
                disabled={busy}
                className="btn-primary flex-1 sm:flex-none disabled:opacity-60"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {editingId ? '更新する' : '追加する'}
              </button>
              <button
                onClick={cancel}
                disabled={busy}
                className="btn-secondary disabled:opacity-60"
              >
                <X size={16} />
                やめる
              </button>
            </div>
          </div>
        )}

        {isOwner && !formOpen && (
          <button
            onClick={() => { setAdding(true); setError(null) }}
            className="btn-primary mt-5"
          >
            <Plus size={16} />
            追加
          </button>
        )}
      </div>
    </section>
  )
}
