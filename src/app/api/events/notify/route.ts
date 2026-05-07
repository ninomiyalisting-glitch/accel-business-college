import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      slack_channel_id: string
      event_id: string
      title: string
      created_by: string
      deadline: string | null
      date_count: number
    }

    const token = (process.env.SLACK_BOT_TOKEN ?? '').trim()
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 500 })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://accel-business-college.vercel.app'
    const eventUrl = `${baseUrl}/events/${body.event_id}`

    let text = `📅 *新しい日程調整が作成されました*\n`
    text += `*${body.title}*\n`
    text += `作成者: ${body.created_by}　候補日: ${body.date_count}件\n`
    if (body.deadline) {
      const d = new Date(body.deadline)
      text += `回答締切: ${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}\n`
    }
    text += `\n<${eventUrl}|回答はこちら>`

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: body.slack_channel_id,
        text,
        unfurl_links: false,
      }),
    })
    const json = await res.json() as { ok: boolean; error?: string }
    if (!json.ok) return NextResponse.json({ error: json.error }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
