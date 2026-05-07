import { NextRequest, NextResponse } from 'next/server'

type Params = { params: Promise<{ videoId: string }> }

// PATCH: edit title / description
export async function PATCH(req: NextRequest, { params }: Params) {
  const token = (process.env.VIMEO_ACCESS_TOKEN ?? '').trim()
  if (!token) return NextResponse.json({ error: 'No token' }, { status: 500 })

  const { videoId } = await params
  const body = await req.json()

  const res = await fetch(`https://api.vimeo.com/videos/${videoId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.vimeo.*+json;version=3.4',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  if (!res.ok) {
    console.error('[video/patch] error:', res.status, text)
    return NextResponse.json({ error: `Vimeo: ${res.status}` }, { status: res.status })
  }

  return NextResponse.json(JSON.parse(text))
}

// DELETE: remove video
export async function DELETE(_req: NextRequest, { params }: Params) {
  const token = (process.env.VIMEO_ACCESS_TOKEN ?? '').trim()
  if (!token) return NextResponse.json({ error: 'No token' }, { status: 500 })

  const { videoId } = await params

  const res = await fetch(`https://api.vimeo.com/videos/${videoId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.vimeo.*+json;version=3.4',
    },
  })

  if (!res.ok && res.status !== 204) {
    const text = await res.text()
    console.error('[video/delete] error:', res.status, text)
    return NextResponse.json({ error: `Vimeo: ${res.status}` }, { status: res.status })
  }

  return NextResponse.json({ ok: true })
}
