import { NextRequest, NextResponse } from 'next/server'

// Allow Slack file domains (including workspace subdomains like w1234.slack.com)
function isAllowedUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url)
    if (protocol !== 'https:') return false
    return (
      hostname === 'files.slack.com' ||
      hostname.endsWith('.slack.com') ||
      hostname === 'files-slack-edge.com' ||
      hostname.endsWith('.files-slack-edge.com')
    )
  } catch {
    return false
  }
}

// Fetch with auth, following up to maxRedirects manually to preserve Authorization header
async function fetchWithAuth(url: string, token: string, maxRedirects = 5): Promise<Response> {
  let currentUrl = url
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(currentUrl, {
      redirect: 'manual',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
      const location = res.headers.get('location')
      if (!location) break
      // Resolve relative redirects
      currentUrl = new URL(location, currentUrl).toString()
      continue
    }
    return res
  }
  // Last attempt - standard follow
  return fetch(currentUrl, { headers: { Authorization: `Bearer ${token}` } })
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url') ?? ''
  if (!url || !isAllowedUrl(url)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const token = (process.env.SLACK_BOT_TOKEN ?? '').trim()
  if (!token) {
    return new NextResponse('SLACK_BOT_TOKEN not configured', { status: 500 })
  }

  try {
    let res = await fetchWithAuth(url, token)

    // 429 は Slack のレート制限。一覧を開くと数十枚を同時に取りに行くため
    // 起きやすい。Retry-After に従って 1 度だけやり直す。
    if (res.status === 429) {
      const wait = Math.min(Number(res.headers.get('retry-after') ?? 1), 5)
      await new Promise((r) => setTimeout(r, wait * 1000))
      res = await fetchWithAuth(url, token)
    }

    const contentType = res.headers.get('content-type') ?? ''

    // If Slack returned HTML (login page), the scope/token is insufficient
    if (contentType.includes('text/html')) {
      console.error('[image-proxy] Slack returned HTML — files:read scope may be missing. URL:', url.slice(0, 80))
      return new NextResponse(
        'Slack が画像ではなくログインページを返しました。Bot Token Scopes に files:read があるか確認してください。',
        { status: 403, headers: { 'Cache-Control': 'public, max-age=60' } }
      )
    }

    if (!res.ok) {
      // 失敗をブラウザ側に短時間キャッシュさせる。
      // これが無いとリロードのたびに数十枚を叩き直し、429 が続く。
      return new NextResponse('Upstream error', {
        status: res.status,
        headers: { 'Cache-Control': 'public, max-age=60' },
      })
    }

    const body = await res.arrayBuffer()
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=2592000, immutable',
      },
    })
  } catch (e) {
    console.error('[image-proxy] error:', e)
    return new NextResponse('Proxy error', { status: 502 })
  }
}
