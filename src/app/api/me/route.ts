import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabaseAdmin'

/**
 * ログイン中の本人を返す。
 * 画面側は localStorage で自分を名乗っているが、それは書き換えられる。
 * 「本人だけに編集ボタンを見せる」判定はこの API の結果を使う。
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) {
    return NextResponse.json({ slack_user_id: null, error: auth.message }, { status: auth.status })
  }
  return NextResponse.json({ slack_user_id: auth.slackUserId })
}
