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
  const basePayload = {
    upload: { approach: 'tus', size },
    name,
    description: description ?? '',
    privacy: { view: 'unlisted', embed: 'public' },
  }

  /**
   * フォルダ指定は、動画作成（POST /me/videos）の folder_uri パラメータで行う。
   * /me/projects/{id}/videos や /users/{id}/projects/{id}/videos への POST は
   * Vimeo に存在せず 405 になる（あるのは GET / PUT / DELETE のみ）。
   * folder_uri にはフォルダの完全な uri（/users/{owner}/projects/{id}）を渡す。
   * チームライブラリのフォルダは持ち主がチームオーナーなので、フォルダ情報から uri を取る。
   * 付けられなかったら（権限不足など）ルートに作って理由を返し、画面側で追加（PUT）を試す。
   */
  let folderUri: string | null = null
  let folderError = ''
  if (folderId) {
    const fRes = await fetch(`https://api.vimeo.com/me/projects/${encodeURIComponent(String(folderId))}?fields=uri`, {
      headers: { Authorization: headers.Authorization, Accept: headers.Accept }, cache: 'no-store',
    })
    if (fRes.ok) {
      folderUri = ((await fRes.json()) as { uri?: string }).uri ?? null
    } else {
      folderError = `フォルダ情報の取得に失敗（${fRes.status}）`
    }
  }

  const createVideo = (withFolder: boolean) => fetch('https://api.vimeo.com/me/videos', {
    method: 'POST', headers,
    body: JSON.stringify({ ...basePayload, ...(withFolder && folderUri ? { folder_uri: folderUri } : {}) }),
  })

  let res: Response | null = null
  let triedFolder = false
  if (folderUri) {
    triedFolder = true
    res = await createVideo(true)
    if (!res.ok) {
      const t = (await res.text()).slice(0, 200)
      console.warn('[init-upload] create with folder_uri failed, falling back to root:', res.status, t)
      folderError = `フォルダ指定付きの作成に失敗（${res.status}${res.status === 403 ? ' 権限不足: トークンに interact スコープが必要' : ''}）`
      res = null
    }
  }
  if (!res) res = await createVideo(false)
  const text = await res.text()
  if (!res.ok) {
    console.error('[init-upload] vimeo error:', res.status, text)
    return NextResponse.json({ error: `Vimeo: ${res.status} ${text.slice(0, 200)}` }, { status: res.status })
  }

  const data = JSON.parse(text)
  // フォルダ内に作れたときだけ folderId を返す（レスポンスの parent_folder か、フォルダ用 URL で成功したか）
  const parentUri: string | null = data.parent_folder?.uri ?? null
  const placed = parentUri
    ? parentUri.split('/').pop() ?? null
    : (triedFolder && folderUri && !folderError ? String(folderId) : null)
  return NextResponse.json({
    videoUri: data.uri as string,
    videoId: (data.uri as string).split('/').pop(),
    uploadLink: data.upload?.upload_link as string,
    folderId: placed,
    // フォルダに入れられなかった理由（画面で表示する）
    folderError: placed ? null : (folderError || null),
  })
}
