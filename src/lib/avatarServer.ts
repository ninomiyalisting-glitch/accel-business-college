/**
 * プロフィール写真の解決（サーバー専用）。
 *
 * users.avatar_url は「いま表示に使う写真」。
 * Slack 由来の写真をここへ書くのは 3 か所（ログイン・Slack の user_change・一括取り込み）
 * あり、そのままだとアプリで設定した写真がログインのたびに Slack の写真で上書きされる。
 * アプリで設定した写真は member_profiles.avatar_url に持ち、
 * Slack の写真を書く前に必ず pickAvatar() を通して「アプリの写真があればそれを優先」する。
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** アプリで設定した写真。無ければ null */
export async function customAvatarOf(
  sb: SupabaseClient,
  slackUserId: string
): Promise<string | null> {
  const { data } = await sb
    .from('member_profiles')
    .select('avatar_url')
    .eq('slack_user_id', slackUserId)
    .maybeSingle()
  return (data?.avatar_url as string | null) ?? null
}

/** 複数人分をまとめて（一括取り込み用） */
export async function customAvatarsOf(
  sb: SupabaseClient,
  slackUserIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (slackUserIds.length === 0) return map
  const { data } = await sb
    .from('member_profiles')
    .select('slack_user_id, avatar_url')
    .in('slack_user_id', slackUserIds)
    .not('avatar_url', 'is', null)
  for (const r of (data ?? []) as { slack_user_id: string; avatar_url: string }[]) {
    map.set(r.slack_user_id, r.avatar_url)
  }
  return map
}

/** Slack の写真とアプリの写真から、表示に使う方を選ぶ */
export function pickAvatar(custom: string | null | undefined, slack: string | null | undefined): string | null {
  return custom || slack || null
}

/** Slack の現在のプロフィール写真を取りに行く（写真を削除して Slack に戻すとき用） */
export async function fetchSlackAvatar(slackUserId: string): Promise<string | null> {
  const token = (process.env.SLACK_BOT_TOKEN ?? '').trim()
  if (!token) return null
  try {
    const url = new URL('https://slack.com/api/users.info')
    url.searchParams.set('user', slackUserId)
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = (await res.json()) as {
      ok: boolean
      user?: { profile?: { image_192?: string; image_72?: string; image_48?: string } }
    }
    if (!json.ok) return null
    const p = json.user?.profile
    return p?.image_192 ?? p?.image_72 ?? p?.image_48 ?? null
  } catch {
    return null
  }
}
