import { NextRequest, NextResponse } from 'next/server'
import { CHANNEL_NAME_TO_SLACK_ID } from '@/lib/slackChannels'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function isoToSlackTs(iso: string): string {
  const ms = new Date(iso).getTime()
  const seconds = Math.floor(ms / 1000)
  const frac = String(ms % 1000).padStart(3, '0') + '000'
  return `${seconds}.${frac}`
}

async function sbFetch(path: string, options: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  })
}

const ADMIN_SLACK_USER_ID = 'U058FM3EFE0'

// Edit message
export async function PATCH(req: NextRequest) {
  const { messageId, channelName, messageCreatedAt, content, userName, slackUserId } = await req.json()
  if (!messageId || !content || !userName) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Verify ownership: user_name 一致 / slack_user_id 一致 / 管理者 のいずれか
  const checkRes = await sbFetch(`/messages?id=eq.${messageId}&select=id,user_name,slack_user_id&limit=1`, { method: 'GET' })
  const rows: { id: string; user_name: string; slack_user_id: string | null }[] = checkRes.ok ? await checkRes.json() : []
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const row = rows[0]
  const isAdmin = slackUserId === ADMIN_SLACK_USER_ID
  const sameSlackId = !!slackUserId && !!row.slack_user_id && row.slack_user_id === slackUserId
  const sameUserName = row.user_name === userName
  if (!isAdmin && !sameSlackId && !sameUserName) {
    return NextResponse.json({ error: 'Not owner' }, { status: 403 })
  }

  // Update in Supabase
  await sbFetch(`/messages?id=eq.${messageId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ content }),
  })

  // Update in Slack (fire and forget)
  const slackChannelId = CHANNEL_NAME_TO_SLACK_ID[channelName]
  const botToken = (process.env.SLACK_BOT_TOKEN ?? '').trim()
  if (slackChannelId && botToken && messageCreatedAt) {
    fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: slackChannelId,
        ts: isoToSlackTs(messageCreatedAt),
        text: content,
      }),
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}

// Delete message
export async function DELETE(req: NextRequest) {
  const { messageId, channelName, messageCreatedAt, userName, slackUserId } = await req.json()
  if (!messageId || !userName) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Verify ownership: user_name 一致 / slack_user_id 一致 / 管理者 のいずれか
  const checkRes = await sbFetch(`/messages?id=eq.${messageId}&select=id,channel_id,user_name,slack_user_id&limit=1`, { method: 'GET' })
  const rows: { id: string; channel_id: string; user_name: string; slack_user_id: string | null }[] = checkRes.ok ? await checkRes.json() : []
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const row = rows[0]
  const isAdmin = slackUserId === ADMIN_SLACK_USER_ID
  const sameSlackId = !!slackUserId && !!row.slack_user_id && row.slack_user_id === slackUserId
  const sameUserName = row.user_name === userName
  if (!isAdmin && !sameSlackId && !sameUserName) {
    return NextResponse.json({ error: 'Not owner' }, { status: 403 })
  }

  const channelId = row.channel_id

  // Delete reactions for this message first
  if (messageCreatedAt) {
    await sbFetch(
      `/message_reactions?channel_id=eq.${channelId}&message_created_at=eq.${encodeURIComponent(messageCreatedAt)}`,
      { method: 'DELETE' }
    )
  }

  // Delete message from Supabase
  await sbFetch(`/messages?id=eq.${messageId}`, { method: 'DELETE' })

  // Delete from Slack (fire and forget)
  const slackChannelId = CHANNEL_NAME_TO_SLACK_ID[channelName]
  const botToken = (process.env.SLACK_BOT_TOKEN ?? '').trim()
  if (slackChannelId && botToken && messageCreatedAt) {
    fetch('https://slack.com/api/chat.delete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: slackChannelId,
        ts: isoToSlackTs(messageCreatedAt),
      }),
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
