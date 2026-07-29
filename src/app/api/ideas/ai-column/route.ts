import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `あなたは中小企業診断士コミュニティ向けのプロのコラム執筆者です。
メンバーが投稿した短いネタやアイデアを、読みごたえのあるコラム記事の下書きに変換してください。

ルール:
- 日本語で執筆
- 見出し構造はHTML（<h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>）のみ使用
- 600〜1200字程度
- 導入→本論→まとめ の流れ
- 中小企業診断士・コンサルタントの読者を意識
- 投稿者の言いたいことを尊重し、補足や肉付けで価値を加える
- マークダウン記号（#、**、- など）は使わない。HTMLタグのみ
- 出力は記事本文のHTMLのみ。前置きや「以下が記事です」のような説明文は禁止`

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
        content: `カテゴリー: ${category ?? 'ネタ'}\n\n投稿内容:\n${content}\n\nこれをコラム記事の下書きに変換してください。タイトルは <h2> で記事の冒頭に置いてください。`,
      }],
    })
    const block = msg.content[0]
    if (!block || block.type !== 'text') return NextResponse.json({ error: 'empty response' }, { status: 500 })

    const html = block.text.trim()
    // Try to extract a title from the first <h2>...</h2>
    const titleMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/)
    const title = titleMatch ? titleMatch[1].trim() : null

    return NextResponse.json({ html, title })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
