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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Admin check via request header
  const callerSlackUserId = req.headers.get('x-slack-user-id') ?? ''
  if (callerSlackUserId !== ADMIN_SLACK_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { is_hidden?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.is_hidden !== 'boolean') {
    return NextResponse.json({ error: 'is_hidden (boolean) is required' }, { status: 400 })
  }

  const sb = getSupabase()
  const { data, error } = await sb
    .from('channels')
    .update({ is_hidden: body.is_hidden })
    .eq('id', id)
    .select('id, name, is_hidden')
    .single()

  if (error) {
    console.error('[channels/patch] error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
