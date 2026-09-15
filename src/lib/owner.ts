/**
 * 運営（にのみー）の Slack ユーザー ID。
 *
 * ホームの投稿ブロックを「にのみーの投稿」と「メンバーの投稿」に分けるのに使う。
 * 複数人を運営として扱いたくなったら、ここに足す。
 * Slack ユーザー ID は /members/<id> の URL に出ている値。
 */
export const OWNER_SLACK_USER_IDS: string[] = ['U058FM3EFE0']

/** 表示名での予備判定。ID が未設定でも「にのみー」側に寄せたい名前を並べる */
export const OWNER_NAME_HINTS: string[] = ['二宮', 'にのみ']

export function isOwnerPost(slackUserId?: string | null, userName?: string | null): boolean {
  if (slackUserId && OWNER_SLACK_USER_IDS.includes(slackUserId)) return true
  if (OWNER_SLACK_USER_IDS.length === 0 && userName) {
    return OWNER_NAME_HINTS.some((h) => userName.includes(h))
  }
  return false
}
