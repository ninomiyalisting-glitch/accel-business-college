import { NextRequest, NextResponse } from 'next/server'

export async function PUT(req: NextRequest) {
  const token = (process.env.VIMEO_ACCESS_TOKEN ?? '').trim()
  if (!token) return NextResponse.json({ error: 'No token' }, { status: 500 })

  const { videoId, folderId } = await req.json()
  if (!videoId || !folderId) return NextResponse.json({ error: 'videoId and folderId required' }, { status: 400 })

  const res = await fetch(
    `https://api.vimeo.com/me/projects/${folderId}/videos/${videoId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.vimeo.*+json;version=3.4',
      },
    }
  )

  if (!res.ok && res.status !== 204) {
    const text = await res.text()
    console.error('[add-to-folder] error:', res.status, text)
    return NextResponse.json({ error: `Vimeo: ${res.status}` }, { status: res.status })
  }

  return NextResponse.json({ ok: true })
}
