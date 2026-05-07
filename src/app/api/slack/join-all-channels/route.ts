import { NextRequest, NextResponse } from 'next/server'

const ADMIN_SLACK_USER_ID = 'U058FM3EFE0'

interface SlackChannel {
  id: string
  name: string
  is_member: boolean
  is_archived: boolean
}

async function fetchAllPublicChannels(token: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = []
  let cursor: string | undefined

  for (let page = 0; page < 20; page++) {
    const url = new URL('https://slack.com/api/conversations.list')
    url.searchParams.set('types', 'public_channel')
    url.searchParams.set('exclude_archived', 'true')
    url.searchParams.set('limit', '200')
    if (cursor) url.searchParams.set('cursor', cursor)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json() as {
      ok: boolean
      channels?: SlackChannel[]
      response_metadata?: { next_cursor?: string }
      error?: string
    }

    if (!json.ok) {
      console.error('[join-all] Slack list error:', json.error)
      break
    }

    for (const ch of json.channels ?? []) {
      if (!ch.is_archived) channels.push(ch)
    }

    cursor = json.response_metadata?.next_cursor
    if (!cursor) break
  }

  return channels
}

async function joinChannel(token: string, channelId: string): Promise<{ ok: boolean; error?: string; already_in_channel?: boolean }> {
  const res = await fetch('https://slack.com/api/conversations.join', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel: channelId }),
  })
  return res.json()
}

export async function POST(req: NextRequest) {
  // Admin-only endpoint
  const callerSlackUserId = req.headers.get('x-slack-user-id') ?? ''
  if (callerSlackUserId !== ADMIN_SLACK_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const token = (process.env.SLACK_BOT_TOKEN ?? '').trim()
  if (!token) {
    return NextResponse.json({ error: 'SLACK_BOT_TOKEN not configured' }, { status: 500 })
  }

  const channels = await fetchAllPublicChannels(token)
  console.log(`[join-all] found ${channels.length} public channels`)

  const results = {
    joined: [] as string[],
    already_member: [] as string[],
    failed: [] as { name: string; error: string }[],
  }

  // Join channels sequentially to avoid rate limits
  for (const ch of channels) {
    if (ch.is_member) {
      results.already_member.push(ch.name)
      continue
    }

    const result = await joinChannel(token, ch.id)

    if (result.ok || result.already_in_channel) {
      results.joined.push(ch.name)
      console.log(`[join-all] joined: ${ch.name} (${ch.id})`)
    } else {
      results.failed.push({ name: ch.name, error: result.error ?? 'unknown' })
      console.error(`[join-all] failed: ${ch.name} — ${result.error}`)
    }

    // Small delay to respect Slack rate limits (Tier 3: 50/min)
    await new Promise((r) => setTimeout(r, 200))
  }

  console.log(`[join-all] done. joined:${results.joined.length} already:${results.already_member.length} failed:${results.failed.length}`)

  return NextResponse.json({
    total: channels.length,
    joined: results.joined.length,
    already_member: results.already_member.length,
    failed: results.failed.length,
    failed_channels: results.failed,
    joined_channels: results.joined,
  })
}
