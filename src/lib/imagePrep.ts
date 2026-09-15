/**
 * アップロード前の画像整形。
 *
 * スマホの写真はそのまま上げると 5〜10MB・4000px 超になり、一覧の表示が重くなる。
 * さらに iPhone の HEIC はそのまま保存すると Chrome や Android では表示できず、
 * 「一部の写真だけ壊れて見える」原因になる。
 * ここで一律に JPEG（長辺 MAX_EDGE px まで）に変換して返す。
 *
 * HEIC のデコードはブラウザ任せ（Safari は可、Chrome は不可）。
 * デコードできない HEIC は分かるエラーを投げて、利用者に伝える。
 */

const MAX_EDGE = 2048
const JPEG_QUALITY = 0.88

export function isHeic(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  )
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      /* 下の <img> で再挑戦 */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('decode failed'))
      img.src = url
    })
  } finally {
    // 描画が終わる前に revoke すると失敗する環境があるので少し待つ
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
}

/**
 * JPEG に変換した File を返す。
 * 変換できない通常画像（SVG 等）は元のまま返す。HEIC が変換できなければ例外。
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  let source: ImageBitmap | HTMLImageElement
  try {
    source = await decode(file)
  } catch {
    if (isHeic(file)) {
      throw new Error(
        'この端末では HEIC 形式を変換できません。iPhone の「設定 > カメラ > フォーマット」を「互換性優先」にするか、JPEG に変換してからアップロードしてください。'
      )
    }
    return file
  }

  const w = 'naturalWidth' in source ? source.naturalWidth : source.width
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height
  if (!w || !h) return file

  const scale = Math.min(1, MAX_EDGE / Math.max(w, h))
  const cw = Math.round(w * scale)
  const ch = Math.round(h * scale)

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(source, 0, 0, cw, ch)
  if ('close' in source) source.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  )
  if (!blob) return file

  const base = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified })
}

/** プロフィール写真の一辺。一覧は 200px 前後、メンバーページは 288px で使うので 512 で足りる */
const AVATAR_EDGE = 512

/**
 * プロフィール写真用。中央を正方形に切り出して AVATAR_EDGE px の JPEG にする。
 * HEIC が変換できない端末では prepareImageForUpload と同じエラーを投げる。
 */
export async function prepareAvatar(file: File): Promise<File> {
  let source: ImageBitmap | HTMLImageElement
  try {
    source = await decode(file)
  } catch {
    throw new Error(
      isHeic(file)
        ? 'この端末では HEIC 形式を変換できません。JPEG に変換してから選んでください。'
        : 'この画像は読み込めませんでした。別の画像を選んでください。'
    )
  }
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height
  if (!w || !h) throw new Error('この画像は読み込めませんでした。別の画像を選んでください。')

  const side = Math.min(w, h)
  const sx = Math.round((w - side) / 2)
  const sy = Math.round((h - side) / 2)
  const edge = Math.min(AVATAR_EDGE, side)

  const canvas = document.createElement('canvas')
  canvas.width = edge
  canvas.height = edge
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画像の変換に失敗しました')
  ctx.drawImage(source, sx, sy, side, side, 0, 0, edge, edge)
  if ('close' in source) source.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9)
  )
  if (!blob) throw new Error('画像の変換に失敗しました')
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
}
