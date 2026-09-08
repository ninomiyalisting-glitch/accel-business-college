import { NextRequest, NextResponse } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * 実務従事更新ポイントの獲得履歴。
 *
 * 閲覧は誰でも（メンバー全員）。書き込みは本人だけ。
 * 本人の判定は署名済み Cookie からのみ行い、リクエストの body に入っている
 * slack_user_id は一切信用しない。
 */

const TABLE = 'practice_points'

type Row = {
  id: string
  slack_user_id: string
  activity: string
  worked_on: string
  worked_note: string | null
  points: number
  created_at: string
  updated_at: string
}

/** 年ごとの合計。稼働日の年で集計する（記入日ではない） */
function summarize(rows: Row[]) {
  const byYear = new Map<number, { points: number; count: number }>()
  for (const r of rows) {
    const year = Number(r.worked_on.slice(0, 4))
    if (!Number.isFinite(year)) continue
    const cur = byYear.get(year) ?? { points: 0, count: 0 }
    cur.points += r.points
    cur.count += 1
    byYear.set(year, cur)
  }
  return [...byYear.entries()]
    .map(([year, v]) => ({ year, points: v.points, count: v.count }))
    .sort((a, b) => b.year - a.year)
}

type Input = { activity: string; worked_on: string; worked_note: string | null; points: number }

/** 入力の検証。何が悪いかを日本語で返す */
function parseInput(body: unknown): { ok: true; value: Input } | { ok: false; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, message: '送信内容が読み取れませんでした' }
  }
  const b = body as Record<string, unknown>

  const activity = typeof b.activity === 'string' ? b.activity.trim() : ''
  if (!activity) return { ok: false, message: '活動内容を入力してください' }
  if (activity.length > 500) return { ok: false, message: '活動内容は 500 文字以内で入力してください' }

  const worked_on = typeof b.worked_on === 'string' ? b.worked_on.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(worked_on)) {
    return { ok: false, message: '稼働日を選択してください' }
  }
  const d = new Date(`${worked_on}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || worked_on !== d.toISOString().slice(0, 10)) {
    return { ok: false, message: '稼働日が正しい日付ではありません' }
  }
  const year = Number(worked_on.slice(0, 4))
  if (year < 2000 || year > 2100) {
    return { ok: false, message: '稼働日の年が正しくありません' }
  }

  const points = Number(b.points)
  if (!Number.isInteger(points) || points < 1 || points > 30) {
    return { ok: false, message: '獲得ポイント数は 1〜30 で選択してください' }
  }

  const noteRaw = typeof b.worked_note === 'string' ? b.worked_note.trim() : ''
  if (noteRaw.length > 200) return { ok: false, message: '稼働日の補足は 200 文字以内で入力してください' }

  return { ok: true, value: { activity, worked_on, worked_note: noteRaw || null, points } }
}

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

// ── 一覧（誰でも閲覧可） ───────────────────────────────
export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('slack_user_id')?.trim()
  if (!target) return fail('slack_user_id を指定してください', 400)

  try {
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      .select('*')
      .eq('slack_user_id', target)
      .order('worked_on', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) return fail(`履歴の取得に失敗しました：${error.message}`, 500)

    const rows = (data ?? []) as Row[]
    return NextResponse.json({ rows, summary: summarize(rows) })
  } catch (e) {
    return fail(e instanceof Error ? e.message : '履歴の取得に失敗しました', 500)
  }
}

// ── 追加（本人のみ） ───────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return fail(auth.message, auth.status)

  const parsed = parseInput(await request.json().catch(() => null))
  if (!parsed.ok) return fail(parsed.message, 400)

  try {
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      // slack_user_id は Cookie から取った本人の ID のみ。body の値は使わない。
      .insert({ ...parsed.value, slack_user_id: auth.slackUserId })
      .select('*')
      .single()

    if (error) return fail(`追加に失敗しました：${error.message}`, 500)
    return NextResponse.json({ row: data })
  } catch (e) {
    return fail(e instanceof Error ? e.message : '追加に失敗しました', 500)
  }
}

// ── 編集（本人のみ） ───────────────────────────────────
export async function PATCH(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return fail(auth.message, auth.status)

  const body = await request.json().catch(() => null)
  const id = typeof (body as Record<string, unknown>)?.id === 'string'
    ? String((body as Record<string, unknown>).id)
    : ''
  if (!id) return fail('編集対象が指定されていません', 400)

  const parsed = parseInput(body)
  if (!parsed.ok) return fail(parsed.message, 400)

  try {
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      .update(parsed.value)
      .eq('id', id)
      // 本人の行しか対象にしない。他人の id を渡しても 0 件になる。
      .eq('slack_user_id', auth.slackUserId)
      .select('*')

    if (error) return fail(`更新に失敗しました：${error.message}`, 500)
    if (!data || data.length === 0) {
      return fail('自分の記録以外は編集できません', 403)
    }
    return NextResponse.json({ row: data[0] })
  } catch (e) {
    return fail(e instanceof Error ? e.message : '更新に失敗しました', 500)
  }
}

// ── 削除（本人のみ） ───────────────────────────────────
export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return fail(auth.message, auth.status)

  const id = request.nextUrl.searchParams.get('id')?.trim()
  if (!id) return fail('削除対象が指定されていません', 400)

  try {
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      .delete()
      .eq('id', id)
      .eq('slack_user_id', auth.slackUserId)
      .select('id')

    if (error) return fail(`削除に失敗しました：${error.message}`, 500)
    if (!data || data.length === 0) {
      return fail('自分の記録以外は削除できません', 403)
    }
    return NextResponse.json({ deleted: id })
  } catch (e) {
    return fail(e instanceof Error ? e.message : '削除に失敗しました', 500)
  }
}
