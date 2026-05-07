import { NextRequest, NextResponse } from 'next/server'
import { CHANNEL_NAME_TO_SLACK_ID } from '@/lib/slackChannels'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Convert ISO timestamp to Slack ts format (e.g. "1234567890.123456")
function isoToSlackTs(iso: string): string {
  const ms = new Date(iso).getTime()
  const seconds = Math.floor(ms / 1000)
  const frac = String(ms % 1000).padStart(3, '0') + '000'
  return `${seconds}.${frac}`
}

async function supabaseFetch(path: string, options: RequestInit) {
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

export async function POST(req: NextRequest) {
  const { channelId, channelName, messageCreatedAt, reaction, userName } = await req.json()

  if (!channelId || !messageCreatedAt || !reaction || !userName) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Check if user already reacted
  const checkRes = await supabaseFetch(
    `/message_reactions?channel_id=eq.${encodeURIComponent(channelId)}&message_created_at=eq.${encodeURIComponent(messageCreatedAt)}&reaction=eq.${encodeURIComponent(reaction)}&user_name=eq.${encodeURIComponent(userName)}&select=id&limit=1`,
    { method: 'GET' }
  )
  const existing: { id: string }[] = checkRes.ok ? await checkRes.json() : []

  const slackChannelId = CHANNEL_NAME_TO_SLACK_ID[channelName]
  const botToken = (process.env.SLACK_BOT_TOKEN ?? '').trim()
  const slackTs = isoToSlackTs(messageCreatedAt)

  if (existing.length > 0) {
    // Remove reaction
    await supabaseFetch(
      `/message_reactions?id=eq.${existing[0].id}`,
      { method: 'DELETE' }
    )

    if (slackChannelId && botToken) {
      fetch('https://slack.com/api/reactions.remove', {
        method: 'POST',
        headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: slackChannelId, name: reaction, timestamp: slackTs }),
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, action: 'removed' })
  } else {
    // Add reaction
    await supabaseFetch('/message_reactions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ channel_id: channelId, message_created_at: messageCreatedAt, reaction, user_name: userName }),
    })

    if (slackChannelId && botToken) {
      fetch('https://slack.com/api/reactions.add', {
        method: 'POST',
        headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: slackChannelId, name: reaction, timestamp: slackTs }),
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, action: 'added' })
  }
}
