import { NextRequest, NextResponse } from 'next/server'
import { SLACK_TEAM_ID } from '@/lib/slackWorkspace'

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

  /**
   * 認可画面は必ず slack.com（共通ドメイン）へ送る。
   *
   * ここを w1684123036-vbv199018.slack.com のようなワークスペース固有の
   * ホストにすると、そのホスト単体でのサインインを求められる。Slack アプリに
   * ログイン済みのスマホでもブラウザ側にそのセッションが無いため、
   * 「アプリではログインできているのに再ログインを要求される」状態になる。
   * 実際に Android の利用者からその報告があった。
   *
   * ワークスペースを固定したい場合はホスト名ではなく team パラメータで指定する。
   * こうすると slack.com のセッションがそのまま使え、対象ワークスペースも固定できる。
   */
  const url = new URL('https://slack.com/oauth/v2/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('user_scope', 'identity.basic,identity.avatar')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('team', SLACK_TEAM_ID)
  if (channel) url.searchParams.set('state', channel)

  console.log('[slack/auth] redirecting to Slack:', url.toString())
  return NextResponse.redirect(url.toString())
}
