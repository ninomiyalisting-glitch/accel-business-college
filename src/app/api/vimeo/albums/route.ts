import { NextResponse } from 'next/server'

const BIZCARE_PROJECT_ID = '25313251'

export async function GET() {
  const token = (process.env.VIMEO_ACCESS_TOKEN ?? '').trim()
  if (!token) {
    return NextResponse.json({ error: 'VIMEO_ACCESS_TOKEN not configured' }, { status: 500 })
  }

  // Fetch items of ビジカレ勉強会 project and return only sub-folders
  const url = `https://api.vimeo.com/me/projects/${BIZCARE_PROJECT_ID}/items?per_page=100&fields=type,folder`
  console.log('[vimeo/albums] fetching subfolders of ビジカレ勉強会')

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.vimeo.*+json;version=3.4',
      },
      cache: 'no-store',
    })
  } catch (fetchErr) {
    console.error('[vimeo/albums] fetch error:', fetchErr)
    return NextResponse.json({ error: String(fetchErr) }, { status: 500 })
  }

  let text: string
  try {
    text = await res.text()
  } catch (readErr) {
    console.error('[vimeo/albums] read error:', readErr)
    return NextResponse.json({ error: 'read failed' }, { status: 500 })
  }

  if (!res.ok) {
    console.error('[vimeo/albums] non-ok:', res.status, text.substring(0, 300))
    return NextResponse.json({ data: [] })
  }

  if (!text.trim()) {
    return NextResponse.json({ data: [] })
  }

  let parsed: { data?: { type: string; folder?: { uri: string; name: string; description: string | null; created_time: string } }[] }
  try {
    parsed = JSON.parse(text)
  } catch (parseErr) {
    console.error('[vimeo/albums] JSON parse error:', parseErr)
    return NextResponse.json({ data: [] })
  }

  const folders = (parsed.data ?? [])
    .filter((item) => item.type === 'folder' && item.folder)
    .map((item) => item.folder!)

  console.log(`[vimeo/albums] found ${folders.length} subfolders`)
  return NextResponse.json({ data: folders })
}
