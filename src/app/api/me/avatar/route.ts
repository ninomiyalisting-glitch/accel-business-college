import { NextRequest, NextResponse } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchSlackAvatar } from '@/lib/avatarServer'

/**
 * プロフィール写真の設定・削除。本人のみ。
 *
 * POST   multipart/form-data の `file`（画像）を受け取り、Storage の avatars バケットに保存。
 *        member_profiles.avatar_url（アプリで設定した写真）と users.avatar_url（表示用）を更新する。
 * DELETE アプリで設定した写真を外し、users.avatar_url を Slack の現在の写真に戻す。
 *
 * 画面側で正方形 512px の JPEG に整えてから送る前提だが、
 * 念のためサイズと種類はここでも確認する。
 */

const BUCKET = 'avatars'
const MAX_BYTES = 3 * 1024 * 1024

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: '画像が送られていません' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '画像が送られていません' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: '画像ファイルを選んでください' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: '画像が大きすぎます（3MB まで）' }, { status: 400 })
  }

  const sb = supabaseAdmin()
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${auth.slackUserId}/${Date.now()}.${ext}`

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' })
  if (upErr) {
    console.error('[me/avatar] upload error:', upErr.message)
    const hint = /bucket/i.test(upErr.message)
      ? ' Storage に avatars バケットが無い可能性があります。supabase/avatars_bucket.sql を実行してください。'
      : ''
    return NextResponse.json({ error: `保存に失敗しました: ${upErr.message}${hint}` }, { status: 500 })
  }
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

  const { error: profErr } = await sb
    .from('member_profiles')
    .upsert(
      { slack_user_id: auth.slackUserId, avatar_url: url, updated_at: new Date().toISOString() },
      { onConflict: 'slack_user_id' }
    )
  if (profErr) {
    console.error('[me/avatar] member_profiles error:', profErr.message)
    return NextResponse.json({ error: `保存に失敗しました: ${profErr.message}` }, { status: 500 })
  }
  const { error: userErr } = await sb
    .from('users')
    .update({ avatar_url: url })
    .eq('slack_user_id', auth.slackUserId)
  if (userErr) console.error('[me/avatar] users update error:', userErr.message)

  return NextResponse.json({ avatar_url: url })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const sb = supabaseAdmin()
  const { error: profErr } = await sb
    .from('member_profiles')
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq('slack_user_id', auth.slackUserId)
  if (profErr) {
    return NextResponse.json({ error: `削除に失敗しました: ${profErr.message}` }, { status: 500 })
  }

  // Slack の現在の写真に戻す。取れなければ空にする（頭文字表示になる）
  const slackAvatar = await fetchSlackAvatar(auth.slackUserId)
  const { error: userErr } = await sb
    .from('users')
    .update({ avatar_url: slackAvatar })
    .eq('slack_user_id', auth.slackUserId)
  if (userErr) console.error('[me/avatar] users update error:', userErr.message)

  return NextResponse.json({ avatar_url: slackAvatar })
}
