import { NextRequest, NextResponse } from 'next/server'

// 認証不要のパス
const PUBLIC_PATHS = ['/', '/auth/error']

// 認証不要の API プレフィックス（OAuth・外部 Webhook 用）
const PUBLIC_API_PREFIXES = [
  '/api/auth/slack',   // Slack OAuth
  '/api/slack/events', // Slack webhook (署名検証で保護)
]

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function unauthorizedResponse(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname

  if (pathname.startsWith('/api/')) {
    // API は 401 JSON を返す
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ページ遷移はランディング / にリダイレクト
  const loginUrl = new URL('/', request.url)
  return NextResponse.redirect(loginUrl)
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 公開パスはスルー
  if (isPublicPath(pathname)) {
    const response = NextResponse.next()
    // クローズドコミュニティ - 検索エンジン拒否ヘッダ
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
    return response
  }

  // 認証 Cookie チェック
  const slackUserId = request.cookies.get('abc_slack_user_id')?.value
  if (!slackUserId) {
    return unauthorizedResponse(request)
  }

  const response = NextResponse.next()
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  return response
}

// _next 内部リソースと静的ファイル、public 配下の PWA アイコン等は除外
export const config = {
  matcher: [
    /*
     * 除外:
     * - _next/static, _next/image
     * - 拡張子つき静的ファイル (favicon, manifest, robots.txt, icon-*.png 等)
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|robots.txt|apple-touch-icon.png|icon-.*\\.png).*)',
  ],
}
