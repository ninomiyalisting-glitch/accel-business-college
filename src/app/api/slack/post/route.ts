import { NextRequest, NextResponse } from 'next/server'
import { CHANNEL_NAME_TO_SLACK_ID } from '@/lib/slackChannels'

function isoToSlackTs(iso: string): string {
  const ms = new Date(iso).getTime()
  const seconds = Math.floor(ms / 1000)
  const frac = String(ms % 1000).padStart(3, '0') + '000'
  return `${seconds}.${frac}`
}

export async function POST(req: NextRequest) {
  const botToken = (process.env.SLACK_BOT_TOKEN ?? '').trim()
  if (!botToken) {
    return NextResponse.json({ error: 'SLACK_BOT_TOKEN not configured' }, { status: 500 })
  }

  const { channelName, userName, content, avatarUrl, threadTs } = await req.json()
  if (!channelName || !content) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const slackChannelId = CHANNEL_NAME_TO_SLACK_ID[channelName]
  if (!slackChannelId) {
    console.log('[slack/post] unknown channel:', channelName)
    return NextResponse.json({ ok: true, skipped: true })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  // username / icon で投稿者を表現（chat:write.customize スコープが必要）
  const body: Record<string, unknown> = {
    channel: slackChannelId,
    text: content,
    username: userName || 'ゲスト',
  }
  if (avatarUrl) {
    body.icon_url = avatarUrl
  } else {
    body.icon_emoji = ':speech_balloon:'
  }
  if (threadTs) {
    body.thread_ts = isoToSlackTs(threadTs)
  }

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data = await res.json() as Record<string, unknown>
    if (!data.ok) {
      console.error('[slack/post] postMessage error:', data.error)
      return NextResponse.json({ error: data.error }, { status: 500 })
    }

    console.log('[slack/post] sent to', channelName, '(', slackChannelId, ')')
    return NextResponse.json({ ok: true })
  } catch (err) {
    clearTimeout(timer)
    console.error('[slack/post] fetch threw:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
