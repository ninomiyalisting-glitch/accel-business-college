'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  ArrowLeft, Calendar, ChevronRight, Folder, Play, Search,
  Settings, Tag, Video, X,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VimeoThumbnail { width: number; link: string }
export interface VimeoVideo {
  uri: string
  name: string
  description: string | null
  duration: number
  created_time: string
  pictures: { sizes: VimeoThumbnail[] }
  tags: { name: string }[]
  link?: string
  privacy?: { view: string; embed: string }
}
export interface FolderInfo {
  id: string
  name: string
  description: string | null
  videoCount: number
  coverImage: string | null
}

interface BreadcrumbItem {
  label: string
  href?: string  // 省略時は現在地（リンクなし）
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getVideoId(uri: string) { return uri.split('/').pop() ?? '' }

function bestThumbnail(pictures: VimeoVideo['pictures']): string {
  const sizes = pictures?.sizes ?? []
  if (sizes.length === 0) return ''
  const suited = sizes.filter((s) => s.width <= 1280)
  return (suited.length > 0 ? suited[suited.length - 1] : sizes[sizes.length - 1]).link
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

function formatDate(iso: string) { return format(new Date(iso), 'yyyy/M/d', { locale: ja }) }

// ─── Cards ───────────────────────────────────────────────────────────────────

function FolderCard({ folder }: { folder: FolderInfo }) {
  const [imgError, setImgError] = useState(false)
  return (
    <Link
      href={`/videos/folder/${folder.id}`}
      className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
    >
      <div className="relative aspect-video bg-gradient-to-br from-accel-lightest to-accel-lightest overflow-hidden">
        {folder.coverImage && !imgError ? (
          <>
            <Image
              src={folder.coverImage}
              alt={folder.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setImgError(true)}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Folder size={48} className="text-[#1f7a00]/30" />
          </div>
        )}
        {/* フォルダアイコンバッジ (左上) */}
        <div className="absolute top-2 left-2 w-8 h-8 rounded-lg bg-white/90 backdrop-blur flex items-center justify-center shadow-sm">
          <Folder size={16} className="text-[#1f7a00]" />
        </div>
        {/* 動画数バッジ (右下) */}
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
          <Video size={11} />
          {folder.videoCount}
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-gray-900 text-sm leading-relaxed line-clamp-2 group-hover:text-[#1f7a00] transition-colors">
          {folder.name}
        </h3>
        {folder.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{folder.description}</p>
        )}
      </div>
    </Link>
  )
}

function VideoCard({ video, folderId }: { video: VimeoVideo; folderId: string }) {
  const videoId = getVideoId(video.uri)
  const thumb = bestThumbnail(video.pictures)
  const [imgError, setImgError] = useState(false)
  return (
    <Link
      href={`/videos/${videoId}?folder=${folderId}`}
      className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
    >
      <div className="relative aspect-video bg-gray-100 overflow-hidden">
        {thumb && !imgError ? (
          <Image
            src={thumb}
            alt={video.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#279300]/10">
            <Video size={32} className="text-[#1f7a00]/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <Play size={22} className="text-[#1f7a00] ml-1" fill="currentColor" />
          </div>
        </div>
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-mono">
          {formatDuration(video.duration)}
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-gray-900 text-sm leading-relaxed line-clamp-2 group-hover:text-[#1f7a00] transition-colors">
          {video.name}
        </h3>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
          <Calendar size={11} />
          {formatDate(video.created_time)}
        </div>
        {video.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {video.tags.slice(0, 3).map((t) => (
              <span key={t.name} className="text-[14px] px-1.5 py-0.5 bg-[#e8f5c9] text-[#1f7a00] rounded-full">
                {t.name}
              </span>
            ))}
            {video.tags.length > 3 && (
              <span className="text-[14px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-full">
                +{video.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}

// ─── Main browser component ──────────────────────────────────────────────────

export default function FolderBrowser({
  projectId,
  breadcrumb,
}: {
  projectId: string
  breadcrumb: BreadcrumbItem[]
}) {
  const [folders, setFolders] = useState<FolderInfo[]>([])
  const [videos, setVideos] = useState<VimeoVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/vimeo/folder-tree?project_id=${projectId}`)
      .then(async (r) => {
        const text = await r.text()
        if (!text.trim()) throw new Error('空のレスポンス')
        const data = JSON.parse(text)
        if (data.error) throw new Error(data.error)
        return data as { folders: FolderInfo[]; videos: VimeoVideo[] }
      })
      .then((data) => {
        setFolders(data.folders ?? [])
        setVideos(data.videos ?? [])
      })
      .catch((e) => setError(e.message ?? 'フォルダ情報の取得に失敗しました'))
      .finally(() => setLoading(false))
  }, [projectId])

  const allTags = useMemo(
    () => [...new Set(videos.flatMap((v) => v.tags.map((t) => t.name)))].sort(),
    [videos]
  )

  const filteredVideos = useMemo(() => {
    return videos.filter((v) => {
      if (selectedTag && !v.tags.some((t) => t.name === selectedTag)) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        if (!v.name.toLowerCase().includes(q) &&
          !(v.description?.toLowerCase().includes(q) ?? false) &&
          !v.tags.some((t) => t.name.toLowerCase().includes(q))) return false
      }
      return true
    })
  }, [videos, selectedTag, searchQuery])

  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return folders
    const q = searchQuery.toLowerCase()
    return folders.filter((f) =>
      f.name.toLowerCase().includes(q) ||
      (f.description?.toLowerCase().includes(q) ?? false)
    )
  }, [folders, searchQuery])

  const totalCount = filteredFolders.length + filteredVideos.length

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-[#1f7a00] text-white flex-shrink-0 sticky top-0 z-10 shadow-md pt-[env(safe-area-inset-top)]">
        {/* 見出し（動画ライブラリ）と「管理」は共通ヘッダーの見出し帯にある。
            戻るリンクもグローバルナビがあるので置かない。
            ここに残すのは階層のパンくずと検索だけ。

            緑の帯は横幅いっぱいのままにし、中身だけ本文と同じ
            max-w-content に揃える。 */}

        {/* ── Breadcrumb ──
            2 階層以上（フォルダを開いている）のときだけ出す。
            トップでは親フォルダ名だけになり情報が無い */}
        {breadcrumb.length > 1 && (
          <div className="max-w-content mx-auto w-full px-4 pt-3 pb-1 flex items-center gap-1.5 text-sm text-white/70 overflow-x-auto whitespace-nowrap">
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight size={14} className="text-white/40 flex-shrink-0" />}
                {b.href ? (
                  <Link href={b.href} className="hover:text-white hover:underline">{b.label}</Link>
                ) : (
                  <span className="text-white font-medium">{b.label}</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* ── Search ── */}
        <div className="max-w-content mx-auto w-full px-4 py-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="フォルダ・動画を検索..."
              className="w-full bg-white/10 text-white placeholder-white/40 rounded-lg pl-9 pr-9 py-2 text-sm outline-none focus:bg-white/20 transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Tag filter ── */}
      {allTags.length > 0 && (
        <div className="bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-content mx-auto w-full flex items-center gap-2 px-4 py-2 overflow-x-auto">
            <Tag size={13} className="text-gray-400 flex-shrink-0" />
            <button
              onClick={() => setSelectedTag(null)}
              className={`flex-shrink-0 text-xs px-3 py-1 rounded-full transition-colors ${
                selectedTag === null ? 'bg-[#1f7a00] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              すべて
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`flex-shrink-0 text-xs px-3 py-1 rounded-full transition-colors ${
                  selectedTag === tag ? 'bg-[#1f7a00] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <main className="flex-1 max-w-content mx-auto w-full px-4 py-6 pb-bottom-nav">
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-10 h-10 border-[3px] border-accel-lightest border-t-[#279300] rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">読み込み中...</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <p className="text-gray-600">{error}</p>
            <button onClick={() => location.reload()} className="mt-2 px-4 py-2 bg-[#1f7a00] text-white rounded-lg text-sm hover:bg-[#145200] transition-colors">
              再読み込み
            </button>
          </div>
        )}

        {!loading && !error && filteredFolders.length === 0 && filteredVideos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <Folder size={40} className="opacity-40" />
            <p className="text-lg font-medium">フォルダ・動画が見つかりません</p>
            {(searchQuery || selectedTag) && (
              <button onClick={() => { setSearchQuery(''); setSelectedTag(null) }} className="text-sm text-[#1f7a00] hover:underline">
                フィルターをクリア
              </button>
            )}
          </div>
        )}

        {/* フォルダグリッド */}
        {!loading && !error && filteredFolders.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Folder size={16} className="text-[#1f7a00]" />
              <h2 className="text-sm font-bold text-gray-700">フォルダ</h2>
              <span className="text-xs text-gray-400">{filteredFolders.length}件</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredFolders.map((f) => (
                <FolderCard key={f.id} folder={f} />
              ))}
            </div>
          </section>
        )}

        {/* 動画グリッド */}
        {!loading && !error && filteredVideos.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Video size={16} className="text-[#1f7a00]" />
              <h2 className="text-sm font-bold text-gray-700">動画</h2>
              <span className="text-xs text-gray-400">{filteredVideos.length}件</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredVideos.map((v) => (
                <VideoCard key={v.uri} video={v} folderId={projectId} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
