import { NextRequest, NextResponse } from 'next/server'

function getBaseUrl(request: NextRequest): string {
  // Vercel は x-forwarded-proto で実際のプロトコルを渡す
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
  const host = request.headers.get('x-forwarded-host') ?? request.nextUrl.host
  return `${proto}://${host}`
}

export async function GET(request: NextRequest) {
  const clientId = process.env.SLACK_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'SLACK_CLIENT_ID not configured' }, { status: 500 })
  }

  const baseUrl = getBaseUrl(request)
  const redirectUri = `${baseUrl}/api/auth/slack/callback`
  console.log('[slack/auth] baseUrl:', baseUrl, 'redirectUri:', redirectUri)

  // チャンネル情報を state に乗せて callback 後に復元する
  const channel = request.nextUrl.searchParams.get('channel') ?? ''

  const url = new URL('https://w1684123036-vbv199018.slack.com/oauth/v2/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('user_scope', 'identity.basic,identity.avatar')
  url.searchParams.set('redirect_uri', redirectUri)
  if (channel) url.searchParams.set('state', channel)

  console.log('[slack/auth] redirecting to Slack:', url.toString())
  return NextResponse.redirect(url.toString())
}
