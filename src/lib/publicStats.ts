/**
 * ランディングページに出す公開情報（サーバー専用）。
 *
 * ログイン前の人が見るページなので、人の名前や個別ページへのリンクは一切返さない。
 * イベントは「こんなイベントが動いている」と分かる範囲（題名・種別・日程の状態）だけ。
 */
import { supabaseAdmin } from './supabaseAdmin'
import { toCategory, type EventCategory } from './eventCategories'

export interface PublicEvent {
  title: string
  category: EventCategory
  /** 開催決定なら日付（YYYY-MM-DD）。調整中なら null */
  confirmedDate: string | null
  /** 調整中のときの候補日数 */
  candidateCount: number
}

export interface PublicStats {
  members: number | null
  videos: number | null
  events: PublicEvent[]
}

async function countMembers(): Promise<number | null> {
  try {
    const sb = supabaseAdmin()
    const { count } = await sb.from('users').select('*', { count: 'exact', head: true })
    return count ?? null
  } catch {
    return null
  }
}

/** 動画の本数。アカウント全体の合計を 1 件だけ取るリクエストで得る（軽い） */
async function countVideos(): Promise<number | null> {
  const token = (process.env.VIMEO_ACCESS_TOKEN ?? '').trim()
  if (!token) return null
  try {
    const res = await fetch('https://api.vimeo.com/me/videos?per_page=1&fields=uri', {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { total?: number }
    return typeof json.total === 'number' ? json.total : null
  } catch {
    return null
  }
}

/** これから開催・調整中のイベント。名前は返さない */
async function upcomingEvents(limit = 6): Promise<PublicEvent[]> {
  try {
    const sb = supabaseAdmin()
    const today = new Date().toISOString().slice(0, 10)
    const since = new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString()
    const { data: events } = await sb
      .from('events')
      .select('id, title, category, confirmed_date, deadline, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(40)
    const rows = (events ?? []) as {
      id: string
      title: string
      category: string | null
      confirmed_date: string | null
      deadline: string | null
    }[]
    const ids = rows.map((e) => e.id)
    const { data: dates } = ids.length
      ? await sb.from('event_dates').select('event_id, date').in('event_id', ids)
      : { data: [] as { event_id: string; date: string }[] }
    const datesByEvent = new Map<string, string[]>()
    for (const d of (dates ?? []) as { event_id: string; date: string }[]) {
      const list = datesByEvent.get(d.event_id) ?? []
      list.push(d.date)
      datesByEvent.set(d.event_id, list)
    }

    const live = rows.filter((e) => {
      if (e.confirmed_date) return e.confirmed_date >= today
      // 調整中：締切が過ぎていない、または候補日に未来がある
      if (e.deadline && e.deadline < today) return false
      const ds = datesByEvent.get(e.id) ?? []
      return ds.length === 0 || ds.some((d) => d >= today)
    })
    // 開催決定を先に、日付順
    live.sort((a, b) => {
      if (a.confirmed_date && b.confirmed_date) return a.confirmed_date < b.confirmed_date ? -1 : 1
      if (a.confirmed_date) return -1
      if (b.confirmed_date) return 1
      return 0
    })
    return live.slice(0, limit).map((e) => ({
      title: e.title,
      category: toCategory(e.category),
      confirmedDate: e.confirmed_date,
      candidateCount: (datesByEvent.get(e.id) ?? []).length,
    }))
  } catch {
    return []
  }
}

export async function getPublicStats(): Promise<PublicStats> {
  const [members, videos, events] = await Promise.all([countMembers(), countVideos(), upcomingEvents()])
  return { members, videos, events }
}
