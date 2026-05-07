import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getBaseUrl(request: NextRequest): string {
  // Vercel は x-forwarded-proto で実際のプロトコルを渡す
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
  const host = request.headers.get('x-forwarded-host') ?? request.nextUrl.host
  return `${proto}://${host}`
}

async function upsertUser(slackUserId: string, displayName: string, avatarUrl: string, slackToken: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      slack_user_id: slackUserId,
      display_name: displayName,
      avatar_url: avatarUrl,
      slack_token: slackToken,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('[slack/callback] Supabase upsert error:', res.status, err)
  } else {
    console.log('[slack/callback] Supabase upsert OK for:', slackUserId)
  }
}

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request)
  const code = request.nextUrl.searchParams.get('code')
  const errorParam = request.nextUrl.searchParams.get('error')
  const state = request.nextUrl.searchParams.get('state') ?? ''

  console.log('[slack/callback] baseUrl:', baseUrl)
  console.log('[slack/callback] code:', code ? 'present' : 'missing', 'error:', errorParam, 'state:', state)

  const channelQuery = state ? `?channel=${encodeURIComponent(state)}` : ''

  if (errorParam || !code) {
    console.error('[slack/callback] No code or error from Slack:', errorParam)
    return NextResponse.redirect(`${baseUrl}/auth/error?reason=${errorParam ?? 'no_code'}`)
  }

  const clientId = process.env.SLACK_CLIENT_ID
  const clientSecret = process.env.SLACK_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error('[slack/callback] Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET')
    return NextResponse.redirect(`${baseUrl}/auth/error?reason=missing_env`)
  }

  // コードをアクセストークンと交換
  const redirectUri = `${baseUrl}/api/auth/slack/callback`
  console.log('[slack/callback] exchanging code, redirectUri:', redirectUri)

  let tokenData: Record<string, unknown>
  try {
    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })
    tokenData = await tokenRes.json()
  } catch (e) {
    console.error('[slack/callback] token exchange fetch error:', e)
    return NextResponse.redirect(`${baseUrl}/auth/error?reason=token_fetch_failed`)
  }

  console.log('[slack/callback] tokenData.ok:', tokenData.ok, 'error:', tokenData.error)

  if (!tokenData.ok) {
    return NextResponse.redirect(`${baseUrl}/auth/error?reason=${tokenData.error ?? 'token_error'}`)
  }

  const authedUser = tokenData.authed_user as Record<string, string> | undefined
  const userToken = authedUser?.access_token ?? ''
  const slackUserId = authedUser?.id ?? ''

  console.log('[slack/callback] slackUserId:', slackUserId, 'userToken:', userToken ? 'present' : 'missing')

  if (!userToken || !slackUserId) {
    console.error('[slack/callback] Missing userToken or slackUserId in authed_user')
    return NextResponse.redirect(`${baseUrl}/auth/error?reason=no_user_token`)
  }

  // ユーザー情報を取得
  let identity: Record<string, unknown>
  try {
    const identityRes = await fetch('https://slack.com/api/users.identity', {
      headers: { Authorization: `Bearer ${userToken}` },
    })
    identity = await identityRes.json()
  } catch (e) {
    console.error('[slack/callback] identity fetch error:', e)
    return NextResponse.redirect(`${baseUrl}/auth/error?reason=identity_fetch_failed`)
  }

  console.log('[slack/callback] identity.ok:', identity.ok, 'error:', identity.error)

  if (!identity.ok) {
    return NextResponse.redirect(`${baseUrl}/auth/error?reason=${identity.error ?? 'identity_error'}`)
  }

  const user = identity.user as Record<string, string> | undefined
  const displayName = user?.name || user?.real_name || slackUserId
  const avatarUrl = user?.image_72 || user?.image_48 || ''

  console.log('[slack/callback] displayName:', displayName, 'avatarUrl:', avatarUrl ? 'present' : 'missing')

  // Supabase に保存（失敗しても続行）
  try {
    await upsertUser(slackUserId, displayName, avatarUrl, userToken)
  } catch (e) {
    console.error('[slack/callback] upsertUser exception:', e)
  }

  // ログイン成功 → メインページへリダイレクト
  const params = new URLSearchParams({
    login: 'success',
    slack_user_id: slackUserId,
    display_name: displayName,
    avatar_url: avatarUrl,
  })
  if (state) params.set('channel', state)

  const successUrl = `${baseUrl}/chat?${params.toString()}`
  console.log('[slack/callback] redirecting to:', successUrl.substring(0, 100))
  return NextResponse.redirect(successUrl)
}
