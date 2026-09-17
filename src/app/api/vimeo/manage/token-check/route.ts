import { NextResponse } from 'next/server'

/**
 * 本番に設定されている Vimeo トークンの権限（スコープ）を確認する。
 * トークンそのものは返さない。Vercel の環境変数が「Sensitive」だと手元から中身を確認できないため、
 * 動画管理ページの上部に「フォルダ機能が使える状態か」を表示するのに使う。
 */
const REQUIRED_FOR_FOLDER = ['interact', 'edit', 'upload', 'create']

export async function GET() {
  const token = (process.env.VIMEO_ACCESS_TOKEN ?? '').trim()
  if (!token) return NextResponse.json({ ok: false, error: 'VIMEO_ACCESS_TOKEN が未設定です' }, { status: 500 })

  const res = await fetch('https://api.vimeo.com/oauth/verify', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.vimeo.*+json;version=3.4' },
    cache: 'no-store',
  })
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: `Vimeo: ${res.status}（トークンが無効か期限切れの可能性）` }, { status: 200 })
  }
  const data = (await res.json()) as { scope?: string; user?: { name?: string }; app?: { name?: string } }
  const scopes = (data.scope ?? '').split(/\s+/).filter(Boolean)
  const missing = REQUIRED_FOR_FOLDER.filter((s) => !scopes.includes(s))
  return NextResponse.json({
    ok: true,
    scopes,
    missing,
    canFolder: missing.length === 0,
    user: data.user?.name ?? null,
    app: data.app?.name ?? null,
  })
}
