import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
    { auth: { persistSession: false } }
  )
}

const SYSTEM_PROMPT = `あなたはアクセルビジネスカレッジの専属AIアシスタントです。
中小企業診断士200名が集まるクローズドコミュニティの情報を活用して質問に答えてください。

このコミュニティについて：
- 中小企業診断士が集まる学習・交流コミュニティ
- メンバーは経営コンサルタントとして活動している
- 経営改善、補助金、IT化支援などの分野で活動するメンバーが多い

回答の指針：
- コミュニティのデータを参照して具体的に答える
- メンバー情報を聞かれた場合はプロフィールから回答する
- 過去の投稿を参照する場合は内容を要約して答える
- 敬語で丁寧に、かつ簡潔に回答する
- コミュニティ内の情報に基づいて回答し、一般論は補足として加える`

interface Message {
  role: 'user' | 'assistant'
  content: string
}

async function buildContext(query: string): Promise<string> {
  const sb = getSupabase()
  const parts: string[] = []

  // Search messages for relevant content
  const { data: msgs } = await sb
    .from('messages')
    .select('user_name, content, created_at')
    .textSearch('content', query.split(/\s+/).slice(0, 3).join(' | '), { type: 'websearch' })
    .order('created_at', { ascending: false })
    .limit(5)

  if (msgs && msgs.length > 0) {
    parts.push('【関連する過去の投稿】')
    for (const m of msgs) {
      const d = new Date(m.created_at)
      parts.push(`・${m.user_name}（${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}）: ${m.content.slice(0, 200)}`)
    }
  }

  // Search member profiles if query seems to be about members
  const memberKeywords = ['メンバー', 'member', '誰', '専門', '得意', '実績', '所属', '都道府県', 'どこ', 'プロフィール']
  const isMemberQuery = memberKeywords.some((k) => query.includes(k))

  if (isMemberQuery) {
    const { data: profiles } = await sb
      .from('member_profiles')
      .select('slack_user_id, prefecture, organization, headline, expertise, achievements')
      .not('headline', 'is', null)
      .limit(10)

    const { data: users } = await sb
      .from('users')
      .select('slack_user_id, display_name')

    if (profiles && profiles.length > 0 && users) {
      const userMap: Record<string, string> = {}
      for (const u of users) {
        if (u.slack_user_id) userMap[u.slack_user_id] = u.display_name
      }
      parts.push('\n【メンバープロフィール（一部）】')
      for (const p of profiles) {
        const name = userMap[p.slack_user_id] ?? p.slack_user_id
        const info = [
          p.headline,
          p.prefecture && `（${p.prefecture}）`,
          p.organization && `所属: ${p.organization}`,
          p.expertise && `得意: ${p.expertise.slice(0, 80)}`,
        ].filter(Boolean).join(' ')
        parts.push(`・${name}: ${info}`)
      }
    }
  }

  // Always include member count
  const { count } = await sb.from('users').select('*', { count: 'exact', head: true })
  parts.push(`\n【コミュニティ基本情報】メンバー数: ${count ?? '不明'}名`)

  return parts.join('\n')
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  let messages: Message[]
  let query: string
  try {
    const body = await req.json()
    messages = body.messages ?? []
    query = messages[messages.length - 1]?.content ?? ''
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!query) return NextResponse.json({ error: 'Empty query' }, { status: 400 })

  // Build context from Supabase
  let context = ''
  try {
    context = await buildContext(query)
  } catch (e) {
    console.error('[ai-chat] context build error:', e)
  }

  const systemWithContext = context
    ? `${SYSTEM_PROMPT}\n\n${context}`
    : SYSTEM_PROMPT

  const client = new Anthropic({ apiKey })

  // Stream response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const stream = await client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemWithContext,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        })

        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
      } catch (e) {
        console.error('[ai-chat] stream error:', e)
        controller.enqueue(encoder.encode('\n\n[エラーが発生しました]'))
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
