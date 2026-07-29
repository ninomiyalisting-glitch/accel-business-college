import { NextRequest, NextResponse } from 'next/server'

const VIMEO_BASE = 'https://api.vimeo.com'
const ROOT_PROJECT_ID = '25313251'  // ビジカレ勉強会

interface VimeoPicture { width: number; height: number; link: string }
interface VimeoVideo {
  uri: string
  name: string
  description: string | null
  duration: number
  created_time: string
  pictures: { sizes: VimeoPicture[] }
  tags: { name: string }[]
  link?: string
  privacy?: { view: string; embed: string }
}
interface VimeoFolder { uri: string; name: string; description: string | null; created_time: string }

interface SubfolderInfo {
  id: string
  name: string
  description: string | null
  videoCount: number
  coverImage: string | null
}

function toAbsoluteUrl(url: string): string {
  return url.startsWith('http') ? url : `${VIMEO_BASE}${url}`
}

async function fetchJson(url: string, token: string): Promise<{ data: unknown[]; next: string | null }> {
  const absUrl = toAbsoluteUrl(url)
  try {
    const res = await fetch(absUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.vimeo.*+json;version=3.4' },
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('[vimeo/folder-tree] non-ok:', res.status, await res.text())
      return { data: [], next: null }
    }
    const json = await res.json() as { data?: unknown[]; paging?: { next?: string | null } }
    return { data: json.data ?? [], next: json.paging?.next ?? null }
  } catch (err) {
    console.error('[vimeo/folder-tree] fetch err:', err)
    return { data: [], next: null }
  }
}

// 指定 project の items を全件取得（folder と video が混在）
async function fetchAllItems(projectId: string, token: string): Promise<unknown[]> {
  const all: unknown[] = []
  let nextUrl: string | null =
    `${VIMEO_BASE}/me/projects/${projectId}/items?per_page=100&fields=type,folder.uri,folder.name,folder.description,folder.created_time,video.uri,video.name,video.duration,video.created_time,video.pictures,video.tags,video.link,video.privacy,video.description`
  let page = 0
  while (nextUrl && page < 10) {
    const { data, next }: { data: unknown[]; next: string | null } = await fetchJson(nextUrl, token)
    all.push(...data)
    nextUrl = next
    page++
  }
  return all
}

function bestThumbnail(pics?: { sizes?: VimeoPicture[] }): string | null {
  const sizes = pics?.sizes ?? []
  if (sizes.length === 0) return null
  const suited = sizes.filter((s) => s.width <= 1280)
  return (suited.length > 0 ? suited[suited.length - 1] : sizes[sizes.length - 1]).link
}

// サブフォルダ1つ分の詳細（再帰しない: 直下の動画数 + 先頭動画のサムネ）
async function describeFolder(folderId: string, token: string): Promise<{ videoCount: number; coverImage: string | null }> {
  const items = await fetchAllItems(folderId, token)
  let videoCount = 0
  let coverImage: string | null = null
  let coverTime = 0
  for (const raw of items) {
    const item = raw as { type?: string; folder?: VimeoFolder; video?: VimeoVideo }
    if (item.type === 'video' && item.video) {
      videoCount++
      // カバー画像: 最新の動画を採用
      const t = new Date(item.video.created_time).getTime()
      if (!coverImage || t > coverTime) {
        const thumb = bestThumbnail(item.video.pictures)
        if (thumb) { coverImage = thumb; coverTime = t }
      }
    } else if (item.type === 'folder' && item.folder?.uri) {
      // サブフォルダの動画も件数に含めたい → 再帰
      const childId = item.folder.uri.split('/').pop()
      if (childId) {
        const child = await describeFolder(childId, token)
        videoCount += child.videoCount
        if (!coverImage && child.coverImage) coverImage = child.coverImage
      }
    }
  }
  return { videoCount, coverImage }
}

export async function GET(req: NextRequest) {
  const token = (process.env.VIMEO_ACCESS_TOKEN ?? '').trim()
  if (!token) {
    return NextResponse.json({ error: 'VIMEO_ACCESS_TOKEN not configured' }, { status: 500 })
  }

  const projectId = req.nextUrl.searchParams.get('project_id') ?? ROOT_PROJECT_ID
  console.log(`[vimeo/folder-tree] project_id=${projectId}`)

  const items = await fetchAllItems(projectId, token)
  const subfolders: VimeoFolder[] = []
  const directVideos: VimeoVideo[] = []
  for (const raw of items) {
    const item = raw as { type?: string; folder?: VimeoFolder; video?: VimeoVideo }
    if (item.type === 'folder' && item.folder) subfolders.push(item.folder)
    else if (item.type === 'video' && item.video) directVideos.push(item.video)
  }

  // サブフォルダの詳細を並列取得（直下のみ、各サブフォルダはさらに再帰して件数集計）
  const folderInfos: SubfolderInfo[] = await Promise.all(
    subfolders.map(async (f) => {
      const id = f.uri.split('/').pop() ?? ''
      const info = id ? await describeFolder(id, token) : { videoCount: 0, coverImage: null }
      return {
        id,
        name: f.name,
        description: f.description,
        videoCount: info.videoCount,
        coverImage: info.coverImage,
      }
    })
  )

  // 直下動画も新しい順にソート
  directVideos.sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime())

  console.log(`[vimeo/folder-tree] subfolders=${folderInfos.length} directVideos=${directVideos.length}`)
  return NextResponse.json({
    folders: folderInfos,
    videos: directVideos,
  })
}
