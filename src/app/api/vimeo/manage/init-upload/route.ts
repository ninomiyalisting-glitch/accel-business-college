import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const token = (process.env.VIMEO_ACCESS_TOKEN ?? '').trim()
  if (!token) return NextResponse.json({ error: 'No token' }, { status: 500 })

  const { name, description, size, folderId } = await req.json()
  if (!name || !size) return NextResponse.json({ error: 'name and size required' }, { status: 400 })

  /**
   * フォルダが指定されていれば、最初からそのフォルダの中に動画を作る。
   * 以前は /me/videos で作ったあと別リクエストでフォルダへ追加していたが、
   * その追加が失敗しても画面に出ず、動画がルートに残っていた。
   * フォルダ配下に直接作れば追加の手順そのものが要らない。
   */
  const endpoint = folderId
    ? `https://api.vimeo.com/me/projects/${encodeURIComponent(String(folderId))}/videos`
    : 'https://api.vimeo.com/me/videos'

  const res = await fetch(endpoint, {
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
  // Vimeo はフォルダ内に作ると parent_folder を返す。画面側で「入ったか」を確かめる材料にする
  const parentUri: string | null = data.parent_folder?.uri ?? null
  return NextResponse.json({
    videoUri: data.uri as string,
    videoId: (data.uri as string).split('/').pop(),
    uploadLink: data.upload?.upload_link as string,
    folderId: parentUri ? parentUri.split('/').pop() : null,
  })
}
