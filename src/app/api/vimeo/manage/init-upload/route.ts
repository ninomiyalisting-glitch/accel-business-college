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
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.vimeo.*+json;version=3.4',
    'Content-Type': 'application/json',
  }
  const payload = JSON.stringify({
    upload: { approach: 'tus', size },
    name,
    description: description ?? '',
    privacy: { view: 'unlisted', embed: 'public' },
  })

  /**
   * フォルダ内に直接作る URL は /users/{user_id}/projects/{project_id}/videos。
   * /me/projects/... は POST を受け付けず 405 になるので、先に /me で自分の ID を取る。
   * フォルダ内作成に失敗したら（権限やフォルダ削除など）、ルートに作って
   * 「フォルダには入っていない」ことを返し、画面側で追加を試す。
   */
  /**
   * フォルダの持ち主の ID を使う。チームライブラリのフォルダはチームオーナーの所有なので、
   * 自分（/me）の ID を使うと 404 になる。フォルダ情報の uri（/users/{owner}/projects/{id}）から取る。
   */
  let ownerId: string | null = null
  let folderError = ''
  if (folderId) {
    const fRes = await fetch(`https://api.vimeo.com/me/projects/${encodeURIComponent(String(folderId))}?fields=uri,user.uri`, {
      headers: { Authorization: headers.Authorization, Accept: headers.Accept }, cache: 'no-store',
    })
    if (fRes.ok) {
      const f = (await fRes.json()) as { uri?: string; user?: { uri?: string } }
      const m = f.uri?.match(/\/users\/(\d+)\//)
      ownerId = m?.[1] ?? f.user?.uri?.split('/').pop() ?? null
    } else {
      folderError = `フォルダ情報の取得に失敗（${fRes.status}）`
    }
    if (!ownerId && !folderError) {
      const meRes = await fetch('https://api.vimeo.com/me?fields=uri', { headers: { Authorization: headers.Authorization, Accept: headers.Accept } })
      if (meRes.ok) ownerId = ((await meRes.json()) as { uri?: string }).uri?.split('/').pop() ?? null
    }
  }
  const folderEndpoint = folderId && ownerId
    ? `https://api.vimeo.com/users/${encodeURIComponent(ownerId)}/projects/${encodeURIComponent(String(folderId))}/videos`
    : null

  let res: Response | null = null
  if (folderEndpoint) {
    res = await fetch(folderEndpoint, { method: 'POST', headers, body: payload })
    if (!res.ok) {
      const t = (await res.text()).slice(0, 200)
      console.warn('[init-upload] folder create failed, falling back to root:', res.status, t)
      folderError = `フォルダ内に直接作成できず（${res.status}${res.status === 403 ? ' 権限不足: トークンに interact スコープが必要' : ''}）`
      res = null
    }
  }
  if (!res) {
    res = await fetch('https://api.vimeo.com/me/videos', { method: 'POST', headers, body: payload })
  }
  const text = await res.text()
  if (!res.ok) {
    console.error('[init-upload] vimeo error:', res.status, text)
    return NextResponse.json({ error: `Vimeo: ${res.status} ${text.slice(0, 200)}` }, { status: res.status })
  }

  const data = JSON.parse(text)
  // フォルダ内に作れたときだけ folderId を返す（レスポンスの parent_folder か、フォルダ用 URL で成功したか）
  const parentUri: string | null = data.parent_folder?.uri ?? null
  const placed = parentUri ? parentUri.split('/').pop() ?? null : (folderEndpoint && res.url.includes('/projects/') ? String(folderId) : null)
  return NextResponse.json({
    videoUri: data.uri as string,
    videoId: (data.uri as string).split('/').pop(),
    uploadLink: data.upload?.upload_link as string,
    folderId: placed,
    // フォルダに入れられなかった理由（画面で表示する）
    folderError: placed ? null : (folderError || null),
  })
}
