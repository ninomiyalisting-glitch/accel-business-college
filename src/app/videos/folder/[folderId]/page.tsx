'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  ArrowLeft, Calendar, Copy, Check, Folder, Play,
  Search, Tag, Video, X,
} from 'lucide-react'

// ─── Types & helpers ──────────────────────────────────────────────────────────

interface VimeoThumbnail { width: number; link: string }
interface VimeoVideo {
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
interface VimeoAlbum { uri: string; name: string; description: string | null; created_time: string }

function getVideoId(uri: string) { return uri.split('/').pop() ?? '' }
function getAlbumId(uri: string) { return uri.split('/').pop() ?? '' }

function getThumbnail(pictures: VimeoVideo['pictures']): string {
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

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-medium text-white/70 hover:text-white transition-colors"
    >
      {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
      {copied ? 'コピー済み' : 'URLをコピー'}
    </button>
  )
}

// ─── Video card ───────────────────────────────────────────────────────────────

function VideoCard({ video, folderId }: { video: VimeoVideo; folderId: string }) {
  const videoId = getVideoId(video.uri)
  const thumb = getThumbnail(video.pictures)
  const [imgError, setImgError] = useState(false)

  return (
    <Link
      href={`/videos/${videoId}?folder=${folderId}`}
      className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
    >
      <div className="relative aspect-video bg-gray-100 overflow-hidden">
        {thumb && !imgError ? (
          <Image src={thumb} alt={video.name} fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#2563eb]/10">
            <Video size={32} className="text-[#2563eb]/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <Play size={22} className="text-[#2563eb] ml-1" fill="currentColor" />
          </div>
        </div>
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-mono">
          {formatDuration(video.duration)}
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-[#2563eb] transition-colors">
          {video.name}
        </h3>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
          <Calendar size={11} />
          {formatDate(video.created_time)}
        </div>
        {video.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {video.tags.slice(0, 3).map((t) => (
              <span key={t.name} className="text-[11px] px-1.5 py-0.5 bg-[#eff6ff] text-[#2563eb] rounded-full">
                {t.name}
              </span>
            ))}
            {video.tags.length > 3 && (
              <span className="text-[11px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-full">
                +{video.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const ROOT_FOLDER_ID = '25313251'
const ROOT_FOLDER_NAME = 'ビジカレ勉強会'

export default function FolderPage({ params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = use(params)

  const [folderName, setFolderName] = useState<string>(
    folderId === ROOT_FOLDER_ID ? ROOT_FOLDER_NAME : 'フォルダ'
  )
  const [videos, setVideos] = useState<VimeoVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [pageUrl, setPageUrl] = useState('')

  useEffect(() => { setPageUrl(window.location.href) }, [])

  // Fetch folder name (only for sub-folders)
  useEffect(() => {
    if (folderId === ROOT_FOLDER_ID) return
    fetch('/api/vimeo/albums')
      .then((r) => r.json())
      .then((data) => {
        const albums: VimeoAlbum[] = data.data ?? []
        const match = albums.find((a) => getAlbumId(a.uri) === folderId)
        if (match) setFolderName(match.name)
      })
      .catch(() => {})
  }, [folderId])

  // Fetch videos
  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/vimeo/videos?project_id=${folderId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setVideos(data.data ?? [])
      })
      .catch((e) => setError(e.message ?? '動画の読み込みに失敗しました'))
      .finally(() => setLoading(false))
  }, [folderId])

  const allTags = useMemo(
    () => [...new Set(videos.flatMap((v) => v.tags.map((t) => t.name)))].sort(),
    [videos]
  )

  const filtered = useMemo(() => {
    return videos.filter((v) => {
      if (selectedTag && !v.tags.some((t) => t.name === selectedTag)) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        if (!v.name.toLowerCase().includes(q) && !(v.description?.toLowerCase().includes(q) ?? false) &&
          !v.tags.some((t) => t.name.toLowerCase().includes(q))) return false
      }
      return true
    })
  }, [videos, selectedTag, searchQuery])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#2563eb] text-white flex-shrink-0 sticky top-0 z-10 shadow-md pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-3 px-4 h-14">
          <Link href="/videos" className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors flex-shrink-0">
            <ArrowLeft size={18} />
            <span className="text-sm hidden sm:inline">動画ライブラリ</span>
          </Link>
          <div className="w-px h-5 bg-white/20 flex-shrink-0" />
          <Folder size={16} className="text-blue-200 flex-shrink-0" />
          <h1 className="font-bold text-white text-[15px] truncate">{folderName}</h1>
          <div className="ml-auto flex items-center gap-3 flex-shrink-0">
            {!loading && (
              <span className="text-white/50 text-sm">{filtered.length}件</span>
            )}
            <CopyButton url={pageUrl} />
          </div>
        </div>
        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="動画を検索..."
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

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="bg-white border-b border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto">
            <Tag size={13} className="text-gray-400 flex-shrink-0" />
            <button
              onClick={() => setSelectedTag(null)}
              className={`flex-shrink-0 text-xs px-3 py-1 rounded-full transition-colors ${selectedTag === null ? 'bg-[#2563eb] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >すべて</button>
            {allTags.map((tag) => (
              <button key={tag} onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`flex-shrink-0 text-xs px-3 py-1 rounded-full transition-colors ${selectedTag === tag ? 'bg-[#2563eb] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-10 h-10 border-[3px] border-blue-100 border-t-[#2563eb] rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">動画を読み込み中...</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <p className="text-gray-600">{error}</p>
            <button onClick={() => { setLoading(true); fetch(`/api/vimeo/videos?project_id=${folderId}`).then((r) => r.json()).then((d) => setVideos(d.data ?? [])).catch((e) => setError(e.message)).finally(() => setLoading(false)) }}
              className="px-4 py-2 bg-[#2563eb] text-white rounded-lg text-sm hover:bg-[#1d4ed8] transition-colors">
              再読み込み
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <Video size={40} className="opacity-40" />
            <p className="text-lg font-medium">動画が見つかりません</p>
            {(searchQuery || selectedTag) && (
              <button onClick={() => { setSearchQuery(''); setSelectedTag(null) }} className="text-sm text-[#2563eb] hover:underline">
                フィルターをクリア
              </button>
            )}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((video) => (
              <VideoCard key={video.uri} video={video} folderId={folderId} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
