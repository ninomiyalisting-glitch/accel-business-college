import { NextRequest, NextResponse } from 'next/server'

const VIMEO_BASE = 'https://api.vimeo.com'
const FIELDS = 'uri,name,description,duration,created_time,pictures,tags,link,privacy'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const token = (process.env.VIMEO_ACCESS_TOKEN ?? '').trim()
  if (!token) {
    return NextResponse.json({ error: 'VIMEO_ACCESS_TOKEN not configured' }, { status: 500 })
  }

  const { videoId } = await params
  const url = `${VIMEO_BASE}/videos/${videoId}?fields=${FIELDS}`

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.vimeo.*+json;version=3.4',
      },
      cache: 'no-store',
    })
    const text = await res.text()
    if (!res.ok) {
      console.error('[vimeo/video] error:', res.status, text.substring(0, 300))
      return NextResponse.json({ error: `Vimeo API error: ${res.status}` }, { status: res.status })
    }
    return NextResponse.json(JSON.parse(text))
  } catch (err) {
    console.error('[vimeo/video] fetch error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
