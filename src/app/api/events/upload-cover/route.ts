import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'events'
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Supabase env missing' }, { status: 500 })
    }
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'ファイルサイズは5MB以下にしてください' }, { status: 400 })
    if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: '画像ファイル(jpg/png/webp/gif)のみアップロード可能です' }, { status: 400 })

    // Ensure bucket exists (public)
    const { data: buckets } = await admin.storage.listBuckets()
    if (!buckets?.some((b) => b.id === BUCKET)) {
      const { error: createErr } = await admin.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: ALLOWED,
      })
      if (createErr && !createErr.message.toLowerCase().includes('already exists')) {
        return NextResponse.json({ error: `バケット作成失敗: ${createErr.message}` }, { status: 500 })
      }
    }

    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `covers/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`

    const buf = await file.arrayBuffer()
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type,
      upsert: false,
    })
    if (upErr) return NextResponse.json({ error: `アップロード失敗: ${upErr.message}` }, { status: 500 })

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ url: data.publicUrl, path })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
