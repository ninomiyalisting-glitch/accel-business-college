import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_SLACK_USER_ID = 'U058FM3EFE0'

function getSupabase() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
    { auth: { persistSession: false } }
  )
}

function tsToISO(ts: string): string {
  return new Date(parseFloat(ts) * 1000).toISOString()
}

interface SlackMessageFile {
  id?: string
  name?: string
  mimetype?: string
  url_private?: string
  url_private_download?: string
  thumb_360?: string
  thumb_480?: string
}

interface SlackMessage {
  type: string
  user?: string
  bot_id?: string
  text?: string
  ts: string
  thread_ts?: string
  subtype?: string
  reply_count?: number
  files?: SlackMessageFile[]
}

const userNameCache = new Map<string, string>()
const avatarUrlCache = new Map<string, string | null>()

async function resolveUserName(token: string, userId: string): Promise<string> {
  if (userNameCache.has(userId)) return userNameCache.get(userId)!
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json() as {
      ok: boolean
      user?: { profile?: { display_name?: string; real_name?: string } }
    }
    if (json.ok && json.user?.profile) {
      const name = json.user.profile.display_name?.trim() || json.user.profile.real_name?.trim() || userId
      userNameCache.set(userId, name)
      return name
    }
  } catch (e) {
    console.warn(`[fetch-replies] users.info error for ${userId}:`, e)
  }
  userNameCache.set(userId, userId)
  return userId
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveAvatarUrl(sb: any, userId: string): Promise<string | null> {
  if (avatarUrlCache.has(userId)) return avatarUrlCache.get(userId)!
  try {
    const { data } = await sb.from('users').select('avatar_url').eq('slack_user_id', userId).maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const url = ((data as any)?.avatar_url as string | null) ?? null
    avatarUrlCache.set(userId, url)
    return url
  } catch {
    return null
  }
}

// Fetch all thread starters (messages with thread_ts == ts) from a channel's history
async function fetchThreadStarters(token: string, channelId: string): Promise<SlackMessage[]> {
  const starters: SlackMessage[] = []
  let cursor: string | undefined

  for (let page = 0; page < 50; page++) {
    const url = new URL('https://slack.com/api/conversations.history')
    url.searchParams.set('channel', channelId)
    url.searchParams.set('limit', '200')
    if (cursor) url.searchParams.set('cursor', cursor)

    let json: {
      ok: boolean
      messages?: SlackMessage[]
      has_more?: boolean
      response_metadata?: { next_cursor?: string }
      error?: string
    }
    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      json = await res.json()
    } catch (e) {
      console.error(`[fetch-replies] history fetch error page ${page + 1}:`, e)
      break
    }

    if (!json.ok) {
      console.error(`[fetch-replies] Slack history error: ${json.error}`)
      break
    }

    for (const msg of json.messages ?? []) {
      // Thread starter: thread_ts exists and equals ts, and has at least 1 reply
      if (msg.thread_ts && msg.thread_ts === msg.ts && (msg.reply_count ?? 0) > 0) {
        starters.push(msg)
      }
    }

    cursor = json.response_metadata?.next_cursor
    if (!json.has_more || !cursor) break
    await new Promise((r) => setTimeout(r, 200))
  }

  return starters
}

// Fetch all replies for a thread (excludes the parent message which is always first)
async function fetchThreadReplies(token: string, channelId: string, threadTs: string): Promise<SlackMessage[]> {
  const replies: SlackMessage[] = []
  let cursor: string | undefined

  for (let page = 0; page < 20; page++) {
    const url = new URL('https://slack.com/api/conversations.replies')
    url.searchParams.set('channel', channelId)
    url.searchParams.set('ts', threadTs)
    url.searchParams.set('limit', '200')
    if (cursor) url.searchParams.set('cursor', cursor)

    let json: {
      ok: boolean
      messages?: SlackMessage[]
      has_more?: boolean
      response_metadata?: { next_cursor?: string }
      error?: string
    }
    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      json = await res.json()
    } catch (e) {
      console.error(`[fetch-replies] replies fetch error:`, e)
      break
    }

    if (!json.ok) {
      console.error(`[fetch-replies] Slack replies error: ${json.error}`)
      break
    }

    for (const msg of json.messages ?? []) {
      // Skip the parent message (thread_ts === ts) and bots
      if (msg.thread_ts === msg.ts) continue
      if (msg.bot_id) continue
      if (!msg.user) continue
      if (msg.subtype && msg.subtype !== 'thread_broadcast') continue
      replies.push(msg)
    }

    cursor = json.response_metadata?.next_cursor
    if (!json.has_more || !cursor) break
    await new Promise((r) => setTimeout(r, 200))
  }

  return replies
}

export async function POST(req: NextRequest) {
  const callerSlackUserId = req.headers.get('x-slack-user-id') ?? ''
  if (callerSlackUserId !== ADMIN_SLACK_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const token = (process.env.SLACK_BOT_TOKEN ?? '').trim()
  if (!token) {
    return NextResponse.json({ error: 'SLACK_BOT_TOKEN not configured' }, { status: 500 })
  }

  let targetChannelId: string | null = null
  try {
    const body = await req.json()
    targetChannelId = body.channel_id ?? null
  } catch { /* no body = all channels */ }

  const sb = getSupabase()

  const channelsQuery = targetChannelId
    ? sb.from('channels').select('id, name, slack_channel_id').eq('id', targetChannelId)
    : sb.from('channels').select('id, name, slack_channel_id').not('slack_channel_id', 'is', null)

  const { data: dbChannels, error: dbErr } = await channelsQuery
  if (dbErr || !dbChannels) {
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
  }

  const results = {
    channels_processed: 0,
    threads_found: 0,
    replies_saved: 0,
    replies_skipped: 0,
    errors: [] as string[],
  }

  for (const channel of dbChannels) {
    if (!channel.slack_channel_id) continue

    console.log(`[fetch-replies] ── channel: "${channel.name}" (slack:${channel.slack_channel_id})`)

    // Get existing timestamps for this channel to detect duplicates
    const { data: existingRows } = await sb
      .from('messages')
      .select('created_at')
      .eq('channel_id', channel.id)

    const existingTimestamps = new Set((existingRows ?? []).map((r) => r.created_at as string))

    // Find thread starters from Slack API
    const starters = await fetchThreadStarters(token, channel.slack_channel_id)
    console.log(`[fetch-replies] "${channel.name}": ${starters.length} threads found`)
    results.threads_found += starters.length

    for (const starter of starters) {
      const replies = await fetchThreadReplies(token, channel.slack_channel_id, starter.ts)
      const thread_ts = tsToISO(starter.ts)

      const newRows: {
        channel_id: string
        user_name: string
        slack_user_id: string
        content: string
        created_at: string
        thread_ts: string
        files_json: SlackMessageFile[] | null
        avatar_url: string | null
      }[] = []

      for (const reply of replies) {
        const created_at = tsToISO(reply.ts)
        if (existingTimestamps.has(created_at)) {
          results.replies_skipped++
          continue
        }

        const user_name = await resolveUserName(token, reply.user!)
        const avatar_url = await resolveAvatarUrl(sb, reply.user!)
        const files_json = reply.files?.length
          ? reply.files.map((f) => ({
              id: f.id,
              name: f.name,
              mimetype: f.mimetype,
              url_private: f.url_private,
              url_private_download: f.url_private_download,
              thumb_360: f.thumb_360 ?? f.thumb_480,
            }))
          : null

        newRows.push({ channel_id: channel.id, user_name, slack_user_id: reply.user!, content: reply.text?.trim() ?? '', created_at, thread_ts, files_json, avatar_url })
        existingTimestamps.add(created_at)

        await new Promise((r) => setTimeout(r, 50))
      }

      if (newRows.length === 0) continue

      const BATCH_SIZE = 50
      for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
        const batch = newRows.slice(i, i + BATCH_SIZE)
        const { error: insertErr } = await sb
          .from('messages')
          .upsert(batch, { onConflict: 'channel_id,created_at', ignoreDuplicates: true })
        if (insertErr) {
          console.error(`[fetch-replies] insert error:`, insertErr.message)
          results.errors.push(`${channel.name}: ${insertErr.message}`)
        } else {
          results.replies_saved += batch.length
        }
      }

      // Rate limit between threads
      await new Promise((r) => setTimeout(r, 300))
    }

    results.channels_processed++
    // Rate limit between channels
    await new Promise((r) => setTimeout(r, 500))
  }

  console.log(`[fetch-replies] ── DONE:`, JSON.stringify(results))
  return NextResponse.json(results)
}
