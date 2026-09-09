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

interface SlackReaction {
  name: string
  users?: string[]
  count?: number
}

interface SlackMessage {
  type: string
  user?: string
  bot_id?: string
  text?: string
  ts: string
  thread_ts?: string
  subtype?: string
  files?: SlackMessageFile[]
  reactions?: SlackReaction[]
}

// Join a channel before fetching (no-op if already member)
async function joinChannel(token: string, channelId: string): Promise<void> {
  try {
    const res = await fetch('https://slack.com/api/conversations.join', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: channelId }),
    })
    const json = await res.json() as { ok: boolean; error?: string }
    if (!json.ok && json.error !== 'already_in_channel') {
      console.warn(`[fetch-history] join ${channelId} failed: ${json.error}`)
    }
  } catch (e) {
    console.warn(`[fetch-history] join ${channelId} error:`, e)
  }
}

// Fetch ALL messages from a Slack channel (no oldest filter)
async function fetchChannelHistory(token: string, channelId: string): Promise<SlackMessage[]> {
  const messages: SlackMessage[] = []
  let cursor: string | undefined

  for (let page = 0; page < 50; page++) {
    const url = new URL('https://slack.com/api/conversations.history')
    url.searchParams.set('channel', channelId)
    url.searchParams.set('limit', '200')
    if (cursor) url.searchParams.set('cursor', cursor)

    console.log(`[fetch-history] GET ${channelId} page ${page + 1}${cursor ? ' cursor=' + cursor.slice(0, 20) : ''}`)

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
      console.error(`[fetch-history] fetch error page ${page + 1}:`, e)
      break
    }

    console.log(`[fetch-history] ${channelId} page ${page + 1}: ok=${json.ok} error=${json.error ?? 'none'} msgs=${json.messages?.length ?? 0} has_more=${json.has_more}`)

    if (!json.ok) {
      console.error(`[fetch-history] Slack error: ${json.error}`)
      break
    }

    for (const msg of json.messages ?? []) {
      if (msg.bot_id) continue
      if (msg.subtype && msg.subtype !== 'thread_broadcast') continue
      if (!msg.user) continue
      if (!msg.text?.trim() && !msg.files?.length) continue
      messages.push(msg)
    }

    cursor = json.response_metadata?.next_cursor
    if (!json.has_more || !cursor) break

    // Rate limit: Slack Tier 3 = 50 req/min
    await new Promise((r) => setTimeout(r, 200))
  }

  return messages
}

// Resolve Slack user ID → display name
// Import from a large shared map would be ideal; here we use users.info as fallback
const userNameCache = new Map<string, string>()
const avatarUrlCache = new Map<string, string | null>() // userId → avatar_url

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
    console.warn(`[fetch-history] users.info error for ${userId}:`, e)
  }

  userNameCache.set(userId, userId)
  return userId
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveAvatarUrl(sb: any, userId: string): Promise<string | null> {
  if (avatarUrlCache.has(userId)) return avatarUrlCache.get(userId)!
  try {
    const { data } = await sb
      .from('users')
      .select('avatar_url')
      .eq('slack_user_id', userId)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const url = ((data as any)?.avatar_url as string | null) ?? null
    avatarUrlCache.set(userId, url)
    return url
  } catch {
    return null
  }
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
  } catch {
    // no body = all channels
  }

  const sb = getSupabase()

  // Get channels to process (all or specific)
  const channelsQuery = targetChannelId
    ? sb.from('channels').select('id, name, slack_channel_id').eq('id', targetChannelId)
    : sb.from('channels').select('id, name, slack_channel_id').not('slack_channel_id', 'is', null)

  const { data: dbChannels, error: dbErr } = await channelsQuery
  if (dbErr || !dbChannels) {
    console.error('[fetch-history] channels fetch error:', dbErr?.message)
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
  }

  console.log(`[fetch-history] processing ${dbChannels.length} channels`)

  const results = {
    channels_processed: 0,
    messages_saved: 0,
    messages_skipped: 0,
    reactions_saved: 0,
    errors: [] as string[],
  }

  for (const channel of dbChannels) {
    if (!channel.slack_channel_id) continue

    console.log(`[fetch-history] ── channel: "${channel.name}" (slack:${channel.slack_channel_id} db:${channel.id})`)

    // Step 1: Ensure bot is a member of the channel, then fetch ALL messages
    await joinChannel(token, channel.slack_channel_id)
    const slackMessages = await fetchChannelHistory(token, channel.slack_channel_id)
    console.log(`[fetch-history] "${channel.name}": ${slackMessages.length} messages from Slack`)

    if (slackMessages.length === 0) {
      results.channels_processed++
      continue
    }

    // Step 2: Get ALL existing created_at timestamps for this channel from Supabase
    const { data: existingRows } = await sb
      .from('messages')
      .select('created_at')
      .eq('channel_id', channel.id)

    const existingTimestamps = new Set((existingRows ?? []).map((r) => r.created_at as string))
    console.log(`[fetch-history] "${channel.name}": ${existingTimestamps.size} existing messages in DB`)

    // Step 3: Build rows to insert (only new messages)
    const newRows: {
      channel_id: string
      user_name: string
      slack_user_id: string
      content: string
      created_at: string
      thread_ts: string | null
      files_json: SlackMessageFile[] | null
      avatar_url: string | null
    }[] = []

    // リアクションは message_reactions が channel_id + メッセージ時刻で持つため、
    // messages の登録有無に関係なく保存できる。既存メッセージの分も拾うので
    // ここは skip 判定より前で集める。
    const reactionRows: {
      channel_id: string
      message_created_at: string
      user_name: string
      reaction: string
    }[] = []

    for (const msg of slackMessages) {
      if (!msg.user) continue
      const created_at = tsToISO(msg.ts)

      if (msg.reactions?.length) {
        for (const r of msg.reactions) {
          for (const uid of r.users ?? []) {
            reactionRows.push({
              channel_id: channel.id,
              message_created_at: created_at,
              user_name: await resolveUserName(token, uid),
              reaction: r.name,
            })
          }
        }
      }

      if (existingTimestamps.has(created_at)) {
        results.messages_skipped++
        continue
      }

      const user_name = await resolveUserName(token, msg.user)
      const avatar_url = await resolveAvatarUrl(sb, msg.user)
      const thread_ts = msg.thread_ts && msg.thread_ts !== msg.ts ? tsToISO(msg.thread_ts) : null
      const files_json = msg.files?.length
        ? msg.files.map((f) => ({
            id: f.id,
            name: f.name,
            mimetype: f.mimetype,
            url_private: f.url_private,
            url_private_download: f.url_private_download,
            thumb_360: f.thumb_360 ?? f.thumb_480,
          }))
        : null

      newRows.push({
        channel_id: channel.id,
        user_name,
        slack_user_id: msg.user,
        content: msg.text?.trim() ?? '',
        created_at,
        thread_ts,
        files_json,
        avatar_url,
      })

      // Small delay per user resolution to avoid rate limit
      await new Promise((r) => setTimeout(r, 50))
    }

    console.log(`[fetch-history] "${channel.name}": ${newRows.length} new messages to insert, ${results.messages_skipped} skipped`)

    // リアクションの保存。messages とは独立させ、片方が失敗しても他方を止めない。
    if (reactionRows.length > 0) {
      const R_BATCH = 200
      for (let i = 0; i < reactionRows.length; i += R_BATCH) {
        const batch = reactionRows.slice(i, i + R_BATCH)
        const { error: rErr } = await sb
          .from('message_reactions')
          .upsert(batch, {
            onConflict: 'channel_id,message_created_at,user_name,reaction',
            ignoreDuplicates: true,
          })
        if (rErr) {
          console.error(`[fetch-history] "${channel.name}" reactions error:`, rErr.message)
          results.errors.push(`${channel.name} のリアクション: ${rErr.message}`)
        } else {
          results.reactions_saved += batch.length
        }
      }
      console.log(`[fetch-history] "${channel.name}": reactions ${reactionRows.length} 件を保存`)
    }

    if (newRows.length === 0) {
      results.channels_processed++
      continue
    }

    // Step 4: INSERT new messages with ON CONFLICT DO NOTHING (batches of 50)
    const BATCH_SIZE = 50
    for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
      const batch = newRows.slice(i, i + BATCH_SIZE)
      const { error: insertErr } = await sb
        .from('messages')
        .upsert(batch, { onConflict: 'channel_id,created_at', ignoreDuplicates: true })
      if (insertErr) {
        console.error(`[fetch-history] "${channel.name}" batch ${i / BATCH_SIZE + 1} error:`, insertErr.message)
        results.errors.push(`${channel.name}: ${insertErr.message}`)
      } else {
        results.messages_saved += batch.length
        console.log(`[fetch-history] "${channel.name}": upserted batch ${i / BATCH_SIZE + 1} (${batch.length} rows)`)
      }
    }

    results.channels_processed++

    // Rate limit: pause between channels
    await new Promise((r) => setTimeout(r, 300))
  }

  console.log(`[fetch-history] ── DONE:`, JSON.stringify(results))
  return NextResponse.json(results)
}
