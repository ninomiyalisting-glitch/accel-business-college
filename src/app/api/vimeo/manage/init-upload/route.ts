import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const token = (process.env.VIMEO_ACCESS_TOKEN ?? '').trim()
  if (!token) return NextResponse.json({ error: 'No token' }, { status: 500 })

  const { name, description, size } = await req.json()
  if (!name || !size) return NextResponse.json({ error: 'name and size required' }, { status: 400 })

  const res = await fetch('https://api.vimeo.com/me/videos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.vimeo.*+json;version=3.4',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      upload: { approach: 'tus', size },
      name,
      description: description ?? '',
      privacy: { view: 'unlisted', embed: 'public' },
    }),
  })

  const text = await res.text()
  if (!res.ok) {
    console.error('[init-upload] vimeo error:', res.status, text)
    return NextResponse.json({ error: `Vimeo: ${res.status} ${text.slice(0, 200)}` }, { status: res.status })
  }

  const data = JSON.parse(text)
  return NextResponse.json({
    videoUri: data.uri as string,
    videoId: (data.uri as string).split('/').pop(),
    uploadLink: data.upload?.upload_link as string,
  })
}
