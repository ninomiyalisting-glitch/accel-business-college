import { NextRequest, NextResponse } from 'next/server'

const VIMEO_BASE = 'https://api.vimeo.com'
const FIELDS = 'uri,name,description,duration,created_time,pictures,tags,link,privacy'

function toAbsoluteUrl(url: string): string {
  return url.startsWith('http') ? url : `${VIMEO_BASE}${url}`
}

async function fetchPage(
  url: string,
  token: string
): Promise<{ data: unknown[]; next: string | null }> {
  const absUrl = toAbsoluteUrl(url)
  console.log('[vimeo/videos] fetching:', absUrl)

  let res: Response
  try {
    res = await fetch(absUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.vimeo.*+json;version=3.4',
      },
      cache: 'no-store',
    })
  } catch (fetchErr) {
    console.error('[vimeo/videos] fetch error:', fetchErr)
    return { data: [], next: null }
  }

  let text: string
  try {
    text = await res.text()
  } catch (readErr) {
    console.error('[vimeo/videos] read error:', readErr)
    return { data: [], next: null }
  }

  console.log('[vimeo/videos] status:', res.status, 'body preview:', text.substring(0, 300))

  if (!res.ok) {
    console.error('[vimeo/videos] non-ok response:', res.status, text.substring(0, 500))
    return { data: [], next: null }
  }

  if (!text.trim()) {
    console.error('[vimeo/videos] empty response body')
    return { data: [], next: null }
  }

  let parsed: { data?: unknown[]; paging?: { next?: string | null } }
  try {
    parsed = JSON.parse(text)
  } catch (parseErr) {
    console.error('[vimeo/videos] JSON parse error:', parseErr, '| raw:', text.substring(0, 500))
    return { data: [], next: null }
  }

  return {
    data: parsed.data ?? [],
    next: parsed.paging?.next ?? null,
  }
}

export async function GET(req: NextRequest) {
  const token = (process.env.VIMEO_ACCESS_TOKEN ?? '').trim()
  if (!token) {
    return NextResponse.json({ error: 'VIMEO_ACCESS_TOKEN not configured' }, { status: 500 })
  }

  const albumId = req.nextUrl.searchParams.get('album_id')
  const projectId = req.nextUrl.searchParams.get('project_id')

  const startUrl = projectId
    ? `${VIMEO_BASE}/me/projects/${projectId}/videos?per_page=100&fields=${FIELDS}&sort=date&direction=desc`
    : albumId
    ? `${VIMEO_BASE}/albums/${albumId}/videos?per_page=100&fields=${FIELDS}&sort=date&direction=desc`
    : `${VIMEO_BASE}/me/videos?per_page=100&fields=${FIELDS}&sort=date&direction=desc`

  const allVideos: unknown[] = []
  let nextUrl: string | null = startUrl
  let page = 0

  try {
    while (nextUrl && page < 10) {
      const { data, next } = await fetchPage(nextUrl, token)
      allVideos.push(...data)
      nextUrl = next  // may be relative like "/me/videos?...page=2" — toAbsoluteUrl handles it
      page++
    }
  } catch (loopErr) {
    console.error('[vimeo/videos] loop error:', loopErr)
  }

  console.log(`[vimeo/videos] total fetched: ${allVideos.length} (${page} pages)`)
  return NextResponse.json({ data: allVideos, total: allVideos.length })
}
