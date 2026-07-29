import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `あなたはYouTube動画の構成作家です。
中小企業診断士向けチャンネルの動画台本を、メンバーの投稿ネタから作ってください。

ルール:
- 日本語、トーク調
- HTMLタグのみで構造化（<h2>, <h3>, <p>, <ul>, <li>, <strong>）
- 7〜10分尺を想定した台本
- 構成: <h2>タイトル</h2> → <h3>導入（フック）</h3> → <h3>本編1〜3</h3> → <h3>まとめ</h3> → <h3>CTA</h3>
- 各セクションは語り口（「今日は〜について話します」）で書く
- 必要に応じて <strong> で強調すべきキーワードを囲む
- 出力は台本HTMLのみ。前置きや説明文は禁止`

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })

    const { content, category } = await req.json() as { content: string; category?: string }
    if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 })

    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `カテゴリー: ${category ?? 'ネタ'}\n\n投稿内容:\n${content}\n\nこれをYouTube動画の台本に変換してください。`,
      }],
    })
    const block = msg.content[0]
    if (!block || block.type !== 'text') return NextResponse.json({ error: 'empty response' }, { status: 500 })

    const html = block.text.trim()
    const titleMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/)
    const title = titleMatch ? titleMatch[1].trim() : null

    return NextResponse.json({ html, title })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
