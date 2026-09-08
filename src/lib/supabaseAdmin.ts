/**
 * サーバー専用。service_role キーを使うので絶対にクライアントへ import しないこと。
 * このキーは RLS を無視して全行を読み書きできる。
 *
 * ブラウザは anon キーで Supabase を直接読んでいるため、RLS では「本人かどうか」を
 * 判定できない（Supabase Auth を使っていないので auth.uid() が無い）。
 * 本人だけが書き換えられる操作は、必ずこのファイルの requireUser() を通した
 * API ルート経由にすること。
 */
import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from './session'

export function supabaseAdmin() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!url || !key) {
    throw new Error('Supabase の URL または SUPABASE_SERVICE_ROLE_KEY が未設定です')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

export type AuthResult =
  | { ok: true; slackUserId: string }
  | { ok: false; status: number; message: string }

/**
 * 署名済み Cookie からログイン中のユーザーを特定する。
 * リクエストの body に入っている slack_user_id は信用しない。必ずこの戻り値を使うこと。
 */
export async function requireUser(request: NextRequest): Promise<AuthResult> {
  const raw = request.cookies.get(SESSION_COOKIE)?.value
  if (!raw) {
    return { ok: false, status: 401, message: 'ログインしていません。再度ログインしてください。' }
  }

  let slackUserId: string | null = null
  try {
    slackUserId = await verifySession(raw)
  } catch (e) {
    // SESSION_SECRET 未設定などの設定ミス。原因が分かるように分けて返す。
    return {
      ok: false,
      status: 500,
      message: e instanceof Error ? e.message : 'セッションの検証に失敗しました',
    }
  }

  if (!slackUserId) {
    return {
      ok: false,
      status: 401,
      message: 'セッションが無効です。お手数ですが再度ログインしてください。',
    }
  }
  return { ok: true, slackUserId }
}
