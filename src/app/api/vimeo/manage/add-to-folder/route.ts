import { NextRequest, NextResponse } from 'next/server'

export async function PUT(req: NextRequest) {
  const token = (process.env.VIMEO_ACCESS_TOKEN ?? '').trim()
  if (!token) return NextResponse.json({ error: 'No token' }, { status: 500 })

  const { videoId, folderId } = await req.json()
  if (!videoId || !folderId) return NextResponse.json({ error: 'videoId and folderId required' }, { status: 400 })

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.vimeo.*+json;version=3.4',
  }
  // チームライブラリのフォルダは持ち主がチームオーナーなので、フォルダの uri から所有者 ID を取って使う
  let base = `https://api.vimeo.com/me/projects/${folderId}`
  const fRes = await fetch(`https://api.vimeo.com/me/projects/${folderId}?fields=uri`, { headers, cache: 'no-store' })
  if (fRes.ok) {
    const f = (await fRes.json()) as { uri?: string }
    if (f.uri) base = `https://api.vimeo.com${f.uri}`
  }
  const res = await fetch(`${base}/videos/${videoId}`, { method: 'PUT', headers })

  if (!res.ok && res.status !== 204) {
    const text = await res.text()
    console.error('[add-to-folder] error:', res.status, text)
    // 403 はトークンの権限不足（edit / interact スコープ）のことが多い。原因が分かる文言で返す
    const hint = res.status === 403 ? 'Vimeo トークンにフォルダ操作の権限（interact スコープ）がありません。トークンを Interact 付きで再発行し、Vercel の Production に保存して再デプロイしてください。' : ''
    return NextResponse.json({ error: `Vimeo: ${res.status} ${hint}${text.slice(0, 160)}` }, { status: res.status })
  }

  return NextResponse.json({ ok: true })
}
