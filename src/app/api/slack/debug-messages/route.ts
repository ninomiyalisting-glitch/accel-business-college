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

export async function GET(req: NextRequest) {
  const callerSlackUserId = req.headers.get('x-slack-user-id') ?? ''
  if (callerSlackUserId !== ADMIN_SLACK_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const channelName = req.nextUrl.searchParams.get('channel') ?? ''
  const sb = getSupabase()

  // 1. Find channel by name
  const { data: channel, error: chErr } = await sb
    .from('channels')
    .select('id, name, slack_channel_id, is_hidden')
    .ilike('name', `%${channelName}%`)
    .limit(5)

  if (chErr) {
    return NextResponse.json({ error: chErr.message }, { status: 500 })
  }

  // 2. For each matched channel, count messages using service role (bypasses RLS)
  const results = []
  for (const ch of channel ?? []) {
    const { count, error: msgErr } = await sb
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel_id', ch.id)

    // Also try anon key to detect RLS blocking
    const anonClient = createClient(
      (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim(),
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(),
    )
    const { count: anonCount, error: anonErr } = await anonClient
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel_id', ch.id)

    results.push({
      channel: { id: ch.id, name: ch.name, slack_channel_id: ch.slack_channel_id, is_hidden: ch.is_hidden },
      service_role: { count, error: msgErr?.message ?? null },
      anon_key: { count: anonCount, error: anonErr?.message ?? null },
      rls_blocking: count !== anonCount,
    })
  }

  return NextResponse.json({ results })
}
