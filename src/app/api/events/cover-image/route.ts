import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

interface UnsplashPhoto {
  id: string
  urls: { regular: string; full: string; raw: string }
  alt_description?: string | null
}

interface UnsplashSearchResponse {
  total: number
  total_pages: number
  results: UnsplashPhoto[]
}

function picsumFallback(title: string): string {
  let hash = 5381
  for (let i = 0; i < title.length; i++) hash = ((hash << 5) + hash + title.charCodeAt(i)) >>> 0
  const seed = (hash + Math.floor(Date.now() / 1000) % 100000) >>> 0
  return `https://picsum.photos/1200/400?random=${seed}`
}

async function translateToEnglishKeyword(title: string, apiKey: string): Promise<string | null> {
  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 40,
      messages: [{
        role: 'user',
        content: `次の日本語のイベントタイトルから、Unsplashの画像検索に使う英単語のキーワード（1〜3語）を返してください。返答はキーワードのみ、説明や引用符は不要です。

例:
- 「5月勉強会の日程調整」 → study meeting
- 「新入社員歓迎会」 → welcome party
- 「マーケティング戦略セミナー」 → marketing strategy
- 「神楽坂食事会」 → restaurant dinner

タイトル: ${title}`,
      }],
    })
    const block = msg.content[0]
    if (block && block.type === 'text') {
      const cleaned = block.text.trim().replace(/^["'`]+|["'`]+$/g, '').replace(/[^a-zA-Z0-9 \-]/g, '').trim()
      return cleaned || null
    }
    return null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title } = await req.json() as { title: string }
    if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })

    const unsplashKey = (process.env.UNSPLASH_ACCESS_KEY ?? '').trim()
    const anthropicKey = process.env.ANTHROPIC_API_KEY

    // 1) Translate to English keyword (if Anthropic available); otherwise pass title through
    let keyword: string | null = null
    if (anthropicKey) {
      keyword = await translateToEnglishKeyword(title, anthropicKey)
    }
    if (!keyword) {
      const asciiOnly = title.replace(/[^a-zA-Z0-9 \-]/g, '').trim()
      keyword = asciiOnly || 'event'
    }

    // 2) Unsplash search (if key configured)
    if (unsplashKey) {
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&per_page=5&orientation=landscape&content_filter=high`
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Client-ID ${unsplashKey}`,
            'Accept-Version': 'v1',
          },
          cache: 'no-store',
        })
        if (res.ok) {
          const json = await res.json() as UnsplashSearchResponse
          if (json.results && json.results.length > 0) {
            const pick = json.results[Math.floor(Math.random() * json.results.length)]
            // Use 1200x400 with Unsplash's image params for the right crop
            const base = pick.urls.raw
            const finalUrl = `${base}&w=1200&h=400&fit=crop&crop=entropy&q=80`
            return NextResponse.json({
              url: finalUrl,
              keyword,
              source: 'unsplash',
              photo_id: pick.id,
              alt: pick.alt_description ?? null,
            })
          }
          // No results — fall through to picsum
          return NextResponse.json({
            url: picsumFallback(title),
            keyword,
            source: 'picsum',
            note: 'Unsplashで該当画像が見つからなかったためランダム画像を表示しています',
          })
        }
        const errText = await res.text().catch(() => '')
        return NextResponse.json({
          url: picsumFallback(title),
          keyword,
          source: 'picsum',
          note: `Unsplash APIエラー (${res.status}): picsumにフォールバック`,
          unsplash_error: errText.slice(0, 200),
        })
      } catch (e) {
        return NextResponse.json({
          url: picsumFallback(title),
          keyword,
          source: 'picsum',
          note: `Unsplashリクエスト失敗: picsumにフォールバック`,
          unsplash_error: String(e),
        })
      }
    }

    // 3) No Unsplash key — picsum fallback
    return NextResponse.json({
      url: picsumFallback(title),
      keyword,
      source: 'picsum',
      note: 'UNSPLASH_ACCESS_KEY 未設定: picsum.photos を使用',
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
