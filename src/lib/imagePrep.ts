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
