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

interface SlackMember {
  id: string
  deleted: boolean
  is_bot: boolean
  profile: {
    display_name?: string
    real_name?: string
    image_192?: string
    image_72?: string
    image_48?: string
  }
}

async function fetchAllSlackMembers(token: string): Promise<SlackMember[]> {
  const members: SlackMember[] = []
  let cursor: string | undefined

  for (let page = 0; page < 20; page++) {
    const url = new URL('https://slack.com/api/users.list')
    url.searchParams.set('limit', '200')
    if (cursor) url.searchParams.set('cursor', cursor)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json() as {
      ok: boolean
      members?: SlackMember[]
      response_metadata?: { next_cursor?: string }
      error?: string
    }

    if (!json.ok) {
      console.error('[backfill-avatars] users.list error:', json.error)
      break
    }

    for (const m of json.members ?? []) {
      if (!m.deleted && !m.is_bot) members.push(m)
    }

    cursor = json.response_metadata?.next_cursor
    if (!cursor) break

    // Slack Tier 2: 20 req/min
    await new Promise((r) => setTimeout(r, 3000))
  }

  return members
}

export async function POST(req: NextRequest) {
  const callerSlackUserId = req.headers.get('x-slack-user-id') ?? ''
  if (callerSlackUserId !== ADMIN_SLACK_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const token = (process.env.SLACK_BOT_TOKEN ?? '').trim()
  if (!token) return NextResponse.json({ error: 'SLACK_BOT_TOKEN not configured' }, { status: 500 })

  const sb = getSupabase()

  // 1. Fetch all workspace members from Slack
  console.log('[backfill-avatars] fetching all Slack members...')
  const members = await fetchAllSlackMembers(token)
  console.log(`[backfill-avatars] fetched ${members.length} members from Slack`)

  // 2. Upsert all members into users table (アバター無しのメンバーも含めて全員)
  const upsertRows = members.map((m) => {
    const displayName =
      m.profile.display_name?.trim() || m.profile.real_name?.trim() || m.id
    const avatarUrl =
      m.profile.image_192 ?? m.profile.image_72 ?? m.profile.image_48 ?? null
    return { slack_user_id: m.id, display_name: displayName, avatar_url: avatarUrl }
  })

  let usersUpserted = 0
  const BATCH = 50
  for (let i = 0; i < upsertRows.length; i += BATCH) {
    const batch = upsertRows.slice(i, i + BATCH)
    const { error } = await sb
      .from('users')
      .upsert(batch, { onConflict: 'slack_user_id', ignoreDuplicates: false })
    if (error) {
      console.error(`[backfill-avatars] upsert batch ${i / BATCH + 1} error:`, error.message)
    } else {
      usersUpserted += batch.length
    }
  }
  console.log(`[backfill-avatars] upserted ${usersUpserted} users`)

  // 3. Build display_name → avatar_url map
  const avatarMap = new Map<string, string>()
  for (const r of upsertRows) {
    if (r.display_name && r.avatar_url) {
      avatarMap.set(r.display_name, r.avatar_url)
    }
  }

  // 4. Build display_name → slack_user_id map too
  const userIdMap = new Map<string, string>()
  for (const r of upsertRows) {
    if (r.display_name) userIdMap.set(r.display_name, r.slack_user_id)
  }

  // 5. Update all matching messages (avatar_url + slack_user_id)
  let updated = 0
  let skipped = 0
  for (const [displayName, avatarUrl] of avatarMap) {
    const slackUserId = userIdMap.get(displayName)
    const { error, data } = await sb
      .from('messages')
      .update({ avatar_url: avatarUrl, ...(slackUserId ? { slack_user_id: slackUserId } : {}) })
      .eq('user_name', displayName)
      .select('id')

    if (error) {
      console.error(`[backfill-avatars] message update error for "${displayName}":`, error.message)
      skipped++
    } else {
      updated += data?.length ?? 0
    }
  }

  console.log(`[backfill-avatars] done: members=${members.length} upserted=${usersUpserted} messages_updated=${updated}`)
  return NextResponse.json({
    members_fetched: members.length,
    users_upserted: usersUpserted,
    messages_updated: updated,
    skipped,
  })
}
