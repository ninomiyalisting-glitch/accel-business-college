import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
    { auth: { persistSession: false } }
  )
}

interface SlackChannel {
  id: string
  name: string
  is_archived: boolean
}

interface SupabaseChannel {
  id: string
  name: string
  slack_channel_id: string | null
}

async function fetchAllSlackChannels(token: string): Promise<SlackChannel[]> {
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
      console.error('[sync-channels] Slack API error:', json.error)
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

export async function POST() {
  const token = (process.env.SLACK_BOT_TOKEN ?? '').trim()
  if (!token) {
    return NextResponse.json({ error: 'SLACK_BOT_TOKEN not configured' }, { status: 500 })
  }

  const sb = getSupabase()

  // 1. Fetch from Slack and Supabase in parallel
  const [slackChannels, dbResult] = await Promise.all([
    fetchAllSlackChannels(token),
    sb.from('channels').select('*'),
  ])

  if (dbResult.error) {
    console.error('[sync-channels] Supabase fetch error:', dbResult.error)
    const { data: fallback } = await sb.from('channels').select('*').order('name')
    return NextResponse.json({ data: fallback ?? [], inserted: 0, deleted: 0, error: 'sync failed' })
  }

  const dbChannels: SupabaseChannel[] = (dbResult.data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    slack_channel_id: (c.slack_channel_id ?? null) as string | null,
  }))

  // ── Detailed comparison logs ──────────────────────────────────────────────
  console.log(`[sync-channels] Slack channels (${slackChannels.length}):`)
  for (const sc of slackChannels) {
    console.log(`  SLACK  ${sc.id}  "${sc.name}"`)
  }

  console.log(`[sync-channels] Supabase channels (${dbChannels.length}):`)
  for (const dc of dbChannels) {
    console.log(`  DB     ${(dc.slack_channel_id ?? 'NULL').padEnd(22)}  "${dc.name}"  (uuid:${dc.id.slice(0, 8)})`)
  }

  // 2. Build lookup maps
  const slackById = new Map(slackChannels.map((c) => [c.id, c]))
  const slackByName = new Map(slackChannels.map((c) => [c.name, c]))
  const dbBySlackId = new Map(
    dbChannels.filter((c) => c.slack_channel_id).map((c) => [c.slack_channel_id!, c])
  )
  const dbByName = new Map(dbChannels.map((c) => [c.name, c]))

  // 3. INSERT / RENAME / BACKFILL: compare Slack channels against Supabase
  const toInsert: { name: string; slack_channel_id: string }[] = []
  const channelsToBackfill: { supabaseId: string; slackId: string; name: string }[] = []
  const channelsToRename: { supabaseId: string; newName: string; oldName: string }[] = []

  for (const sc of slackChannels) {
    const inDbById = dbBySlackId.has(sc.id)
    const inDbByName = dbByName.has(sc.name)

    if (inDbById) {
      // Found by Slack channel ID — check if name changed (rename)
      const existing = dbBySlackId.get(sc.id)!
      if (existing.name !== sc.name) {
        channelsToRename.push({ supabaseId: existing.id, newName: sc.name, oldName: existing.name })
        console.log(`[sync-channels] RENAME: "${existing.name}" → "${sc.name}" (${sc.id})`)
      } else {
        console.log(`[sync-channels] MATCH(id): "${sc.name}" (${sc.id})`)
      }
    } else if (!inDbByName) {
      // Not in DB by ID or name → INSERT
      toInsert.push({ name: sc.name, slack_channel_id: sc.id })
      console.log(`[sync-channels] INSERT: "${sc.name}" (${sc.id})`)
    } else {
      // Exists by name but missing slack_channel_id → BACKFILL
      const existing = dbByName.get(sc.name)!
      channelsToBackfill.push({ supabaseId: existing.id, slackId: sc.id, name: sc.name })
      console.log(`[sync-channels] BACKFILL: "${sc.name}" → slack_channel_id=${sc.id}`)
    }
  }

  // 4. DELETE: in Supabase but not in Slack
  const toDeleteIds: string[] = []
  for (const dc of dbChannels) {
    if (dc.slack_channel_id) {
      if (!slackById.has(dc.slack_channel_id)) {
        toDeleteIds.push(dc.id)
        console.log(`[sync-channels] DELETE(by-id): "${dc.name}" (${dc.slack_channel_id}) — not found in Slack`)
      }
    } else {
      if (!slackByName.has(dc.name)) {
        toDeleteIds.push(dc.id)
        console.log(`[sync-channels] DELETE(by-name): "${dc.name}" — not found in Slack`)
      } else {
        console.log(`[sync-channels] MATCH(name): "${dc.name}" — has no slack_channel_id but name matched`)
      }
    }
  }

  console.log(`[sync-channels] Summary → insert:${toInsert.length} rename:${channelsToRename.length} backfill:${channelsToBackfill.length} delete:${toDeleteIds.length}`)

  // 5. Execute
  let inserted = 0
  let renamed = 0
  let deleted = 0

  if (channelsToBackfill.length > 0) {
    await Promise.all(
      channelsToBackfill.map(({ supabaseId, slackId }) =>
        sb.from('channels').update({ slack_channel_id: slackId }).eq('id', supabaseId)
      )
    )
    console.log(`[sync-channels] backfilled ${channelsToBackfill.length} slack_channel_ids`)
  }

  if (channelsToRename.length > 0) {
    await Promise.all(
      channelsToRename.map(({ supabaseId, newName }) =>
        sb.from('channels').update({ name: newName }).eq('id', supabaseId)
      )
    )
    renamed = channelsToRename.length
    console.log(`[sync-channels] renamed ${renamed} channels`)
  }

  if (toInsert.length > 0) {
    const { error } = await sb.from('channels').insert(toInsert)
    if (error) console.error('[sync-channels] insert error:', error.message)
    else inserted = toInsert.length
  }

  if (toDeleteIds.length > 0) {
    const { error } = await sb.from('channels').delete().in('id', toDeleteIds)
    if (error) console.error('[sync-channels] delete error:', error.message)
    else deleted = toDeleteIds.length
  }

  // 6. Return updated list
  const { data: latest, error: latestErr } = await sb
    .from('channels')
    .select('*')
    .order('name')

  if (latestErr) {
    console.error('[sync-channels] final select error:', latestErr.message)
    return NextResponse.json({ error: 'Failed to fetch updated channels' }, { status: 500 })
  }

  console.log(`[sync-channels] done → ${latest?.length ?? 0} channels (inserted:${inserted} renamed:${renamed} deleted:${deleted})`)
  return NextResponse.json({
    data: latest,
    inserted,
    renamed,
    deleted,
    backfilled: channelsToBackfill.length,
    slack_count: slackChannels.length,
    db_count: dbChannels.length,
  })
}
