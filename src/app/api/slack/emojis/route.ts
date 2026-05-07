import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

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

// Fetch custom emojis from Slack and cache in Supabase
async function fetchFromSlack(): Promise<Record<string, string>> {
  const botToken = (process.env.SLACK_BOT_TOKEN ?? '').trim()
  if (!botToken) return {}

  const res = await fetch('https://slack.com/api/emoji.list', {
    headers: { Authorization: `Bearer ${botToken}` },
  })
  const data: { ok: boolean; emoji?: Record<string, string> } = await res.json()
  if (!data.ok || !data.emoji) return {}

  // Filter out alias emojis, keep only direct URLs
  const emojis: Record<string, string> = {}
  const toInsert: { name: string; url: string }[] = []
  for (const [name, url] of Object.entries(data.emoji)) {
    if (!url.startsWith('alias:')) {
      emojis[name] = url
      toInsert.push({ name, url })
    }
  }

  // Cache in Supabase (fire and forget; table may not exist yet)
  if (toInsert.length > 0) {
    supabaseFetch('/custom_emojis', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(toInsert),
    }).catch(() => {})
  }

  return emojis
}

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get('refresh') === 'true'

  if (!refresh) {
    // Try Supabase cache first
    try {
      const cacheRes = await supabaseFetch('/custom_emojis?select=name,url&limit=2000', { method: 'GET' })
      if (cacheRes.ok) {
        const cached: { name: string; url: string }[] = await cacheRes.json()
        if (cached.length > 0) {
          const emojis: Record<string, string> = {}
          for (const e of cached) emojis[e.name] = e.url
          return NextResponse.json({ emojis, source: 'cache' })
        }
      }
    } catch {
      // Table may not exist yet; fall through to Slack API
    }
  }

  const emojis = await fetchFromSlack()
  return NextResponse.json({ emojis, source: 'slack' })
}
