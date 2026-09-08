/**
 * ログインセッションの署名と検証。
 *
 * これまで Cookie `abc_slack_user_id` は Slack のユーザー ID を素で持っていた。
 * httpOnly なので JavaScript からは触れないが、Slack のユーザー ID は
 * /members/<id> の URL に出ているため、ブラウザの開発者ツールや curl で
 * Cookie を自分で作れば他人になりすませる状態だった。
 * ここで HMAC 署名を付けて、サーバーが発行した Cookie だけを本人と認める。
 *
 * middleware は Edge ランタイムで動くため Node の crypto は使えない。
 * Edge と Node の両方にある Web Crypto を使うこと。
 */

export const SESSION_COOKIE = 'abc_slack_user_id'

function secretBytes(): Uint8Array {
  const s = process.env.SESSION_SECRET
  if (!s) {
    // 黙って未署名を受け入れると署名の意味が無くなるので、必ず落とす。
    throw new Error(
      'SESSION_SECRET が設定されていません。Vercel の環境変数と .env.local に設定してください。'
    )
  }
  return new TextEncoder().encode(s)
}

async function hmacKey(usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    secretBytes() as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  )
}

function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const raw = atob(pad)
    const out = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/** Cookie に入れる値を作る。形式は `<slackUserId>.<署名>` */
export async function signSession(slackUserId: string): Promise<string> {
  const key = await hmacKey('sign')
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(slackUserId) as unknown as ArrayBuffer
  )
  return `${slackUserId}.${toBase64Url(new Uint8Array(sig))}`
}

/**
 * Cookie の値を検証して Slack ユーザー ID を返す。
 * 署名が無い・合わない・壊れている場合は null（＝未ログイン扱い）。
 * 署名前の古い Cookie は「.」を含まないため、ここで自動的に無効になる。
 */
export async function verifySession(value: string | undefined | null): Promise<string | null> {
  if (!value) return null
  const i = value.lastIndexOf('.')
  if (i <= 0) return null

  const id = value.slice(0, i)
  const sig = fromBase64Url(value.slice(i + 1))
  if (!id || !sig) return null

  try {
    const key = await hmacKey('verify')
    // crypto.subtle.verify は定数時間で比較されるので、自前で文字列比較しない
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      sig as unknown as ArrayBuffer,
      new TextEncoder().encode(id) as unknown as ArrayBuffer
    )
    return ok ? id : null
  } catch {
    return null
  }
}
