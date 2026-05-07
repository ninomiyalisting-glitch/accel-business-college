'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  ArrowLeft, Play, Clock, Calendar, Tag, Search, X, Video,
  Folder, FolderOpen, ChevronRight, Lock, ExternalLink, AlertCircle,
  Copy, Check, Settings,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface VimeoThumbnail {
  width: number
  height: number
  link: string
}

interface VimeoVideo {
  uri: string
  name: string
  description: string | null
  duration: number
  created_time: string
  pictures: { sizes: VimeoThumbnail[] }
  tags: { name: string }[]
  link?: string
  privacy?: {
    view: string
    embed: string
  }
}

interface VimeoAlbum {
  uri: string
  name: string
  description: string | null
  created_time: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getVideoId(uri: string): string {
  return uri.split('/').pop() ?? ''
}

function getAlbumId(uri: string): string {
  return uri.split('/').pop() ?? ''
}

function getThumbnail(pictures: VimeoVideo['pictures']): string {
  const sizes = pictures?.sizes ?? []
  if (sizes.length === 0) return ''
  const suited = sizes.filter((s) => s.width <= 1280)
  return (suited.length > 0 ? suited[suited.length - 1] : sizes[sizes.length - 1]).link
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDate(iso: string): string {
  return format(new Date(iso), 'yyyy/M/d', { locale: ja })
}

// ─── Video Card (navigates to detail page) ────────────────────────────────────

function VideoCard({ video, folderId }: { video: VimeoVideo; folderId: string }) {
  const videoId = getVideoId(video.uri)
  const thumbnail = getThumbnail(video.pictures)
  const [imgError, setImgError] = useState(false)

  return (
    <Link
      href={`/videos/${videoId}?folder=${folderId}`}
      className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 text-left w-full block"
    >
      <div className="relative aspect-video bg-gray-100 overflow-hidden">
        {thumbnail && !imgError ? (
          <Image
            src={thumbnail}
            alt={video.name}
            fill
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
          <span className="flex items-center gap-1">
            <Calendar size={11} />
            {formatDate(video.created_time)}
          </span>
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
      className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-xs text-white/60 hover:text-white transition-colors"
      title="このフォルダのURLをコピー"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      <span className="hidden sm:inline">{copied ? 'コピー済み' : 'URLコピー'}</span>
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ROOT_FOLDER_ID = '25313251'

export default function VideosPage() {
  const [albums, setAlbums] = useState<VimeoAlbum[]>([])
  const [videos, setVideos] = useState<VimeoVideo[]>([])
  const [videosLoading, setVideosLoading] = useState(true)
  const [albumsLoading, setAlbumsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>(ROOT_FOLDER_ID)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [folderUrl, setFolderUrl] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => { setFolderUrl(window.location.origin + '/videos') }, [])
  useEffect(() => {
    try {
      const saved = localStorage.getItem('abc_slackUser')
      if (saved) {
        const user = JSON.parse(saved)
        setIsAdmin(user.slack_user_id === 'U058FM3EFE0')
      }
    } catch { /* ignore */ }
  }, [])

  // Load albums once
  useEffect(() => {
    fetch('/api/vimeo/albums')
      .then(async (r) => {
        const text = await r.text()
        if (!text.trim()) return { data: [] }
        return JSON.parse(text)
      })
      .then((data) => setAlbums(data.data ?? []))
      .catch((e) => console.warn('albums load failed:', e))
      .finally(() => setAlbumsLoading(false))
  }, [])

  // Load videos when album changes
  const loadVideos = useCallback((albumId: string) => {
    setVideosLoading(true)
    setError(null)
    setSelectedTag(null)
    fetch(`/api/vimeo/videos?project_id=${albumId}`)
      .then(async (r) => {
        const text = await r.text()
        if (!text.trim()) throw new Error('空のレスポンスを受信しました')
        const data = JSON.parse(text)
        if (data.error) throw new Error(data.error)
        return data
      })
      .then((data) => setVideos(data.data ?? []))
      .catch((e) => {
        console.error('videos load error:', e)
        setError(e.message ?? '動画の読み込みに失敗しました')
      })
      .finally(() => setVideosLoading(false))
  }, [])

  useEffect(() => {
    loadVideos(selectedAlbumId)
  }, [selectedAlbumId, loadVideos])

  const handleAlbumSelect = (albumId: string) => {
    setSelectedAlbumId(albumId)
    setSearchQuery('')
    setSidebarOpen(false)
  }

  const allTags = useMemo(
    () => [...new Set(videos.flatMap((v) => v.tags.map((t) => t.name)))].sort(),
    [videos]
  )

  const filtered = useMemo(() => {
    return videos.filter((v) => {
      if (selectedTag && !v.tags.some((t) => t.name === selectedTag)) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        if (
          !v.name.toLowerCase().includes(q) &&
          !(v.description?.toLowerCase().includes(q) ?? false) &&
          !v.tags.some((t) => t.name.toLowerCase().includes(q))
        ) return false
      }
      return true
    })
  }, [videos, selectedTag, searchQuery])

  const selectedAlbumName = selectedAlbumId === ROOT_FOLDER_ID
    ? 'ビジカレ勉強会'
    : albums.find((a) => getAlbumId(a.uri) === selectedAlbumId)?.name ?? 'フォルダ'

  const currentFolderUrl = selectedAlbumId === ROOT_FOLDER_ID
    ? folderUrl
    : folderUrl ? `${new URL(folderUrl).origin}/videos/folder/${selectedAlbumId}` : ''

  // ── Folder sidebar ──────────────────────────────────────────────────────────
  const FolderList = () => (
    <nav className="flex flex-col gap-0.5">
      {/* Root folder — state-based selection */}
      <button
        onClick={() => handleAlbumSelect(ROOT_FOLDER_ID)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
          selectedAlbumId === ROOT_FOLDER_ID
            ? 'bg-[#2563eb] text-white font-semibold'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        {selectedAlbumId === ROOT_FOLDER_ID ? (
          <FolderOpen size={15} className="text-white flex-shrink-0" />
        ) : (
          <Folder size={15} className="text-gray-400 flex-shrink-0" />
        )}
        <span className="truncate">ビジカレ勉強会</span>
      </button>

      {/* Sub-folders — navigate to folder page */}
      {!albumsLoading && albums.length > 0 && (
        <>
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-3 pb-1">
            サブフォルダ
          </div>
          {albums.map((album) => {
            const id = getAlbumId(album.uri)
            const active = selectedAlbumId === id
            return (
              <Link
                key={album.uri}
                href={`/videos/folder/${id}`}
                className={`flex items-center gap-2 px-3 py-2 pl-5 rounded-lg text-sm transition-colors ${
                  active ? 'bg-[#2563eb] text-white font-semibold' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {active ? (
                  <FolderOpen size={14} className="text-white flex-shrink-0" />
                ) : (
                  <Folder size={14} className="text-gray-400 flex-shrink-0" />
                )}
                <span className="truncate">{album.name}</span>
              </Link>
            )
          })}
        </>
      )}

      {albumsLoading && (
        <div className="px-3 py-2 text-sm text-gray-400 animate-pulse">読み込み中...</div>
      )}
    </nav>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-[#2563eb] text-white flex-shrink-0 sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-3 px-4 h-14">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors flex-shrink-0"
          >
            <ArrowLeft size={18} />
            <span className="text-sm hidden sm:inline">ダッシュボード</span>
          </Link>
          <div className="w-px h-5 bg-white/20 flex-shrink-0" />

          {/* Mobile: folder toggle */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="flex items-center gap-1.5 md:hidden text-white/80 hover:text-white transition-colors"
          >
            <Folder size={16} />
            <span className="text-sm font-medium truncate max-w-[140px]">{selectedAlbumName}</span>
            <ChevronRight size={14} className={`transition-transform ${sidebarOpen ? 'rotate-90' : ''}`} />
          </button>

          <div className="hidden md:flex items-center gap-2 min-w-0">
            <Video size={18} className="text-blue-200 flex-shrink-0" />
            <h1 className="font-bold text-white text-[15px] truncate">動画ライブラリ</h1>
            {selectedAlbumId && (
              <>
                <ChevronRight size={14} className="text-white/40" />
                <span className="text-white/80 text-sm truncate">{selectedAlbumName}</span>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {!videosLoading && <span className="text-white/50 text-sm">{filtered.length} 件</span>}
            {currentFolderUrl && <CopyButton url={currentFolderUrl} />}
            <Link href="/videos/manage"
              className="flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-xs text-white/70 hover:text-white transition-colors"
              title="動画管理">
              <Settings size={12} />
              <span className="hidden sm:inline">管理</span>
            </Link>
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
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Mobile folder drawer ── */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
          <div className="fixed top-[104px] left-0 right-0 z-30 bg-white border-b border-gray-200 shadow-lg p-3 md:hidden max-h-[60vh] overflow-y-auto">
            <FolderList />
          </div>
        </>
      )}

      {/* ── Tag filter ── */}
      {allTags.length > 0 && (
        <div className="bg-white border-b border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto">
            <Tag size={13} className="text-gray-400 flex-shrink-0" />
            <button
              onClick={() => setSelectedTag(null)}
              className={`flex-shrink-0 text-xs px-3 py-1 rounded-full transition-colors ${
                selectedTag === null ? 'bg-[#2563eb] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              すべて
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`flex-shrink-0 text-xs px-3 py-1 rounded-full transition-colors ${
                  selectedTag === tag ? 'bg-[#2563eb] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop folder sidebar */}
        <aside className="hidden md:flex flex-col w-56 flex-shrink-0 bg-white border-r border-gray-100 p-3 sticky top-[104px] self-start max-h-[calc(100vh-104px)] overflow-y-auto">
          <FolderList />
        </aside>

        {/* Video grid */}
        <main className="flex-1 px-4 py-6 pb-20 min-w-0">
          {videosLoading && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="w-10 h-10 border-[3px] border-blue-100 border-t-[#2563eb] rounded-full animate-spin" />
              <p className="text-gray-400 text-sm">動画を読み込み中...</p>
            </div>
          )}

          {error && !videosLoading && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <AlertCircle size={32} className="text-red-400" />
              <p className="text-gray-600 text-center">{error}</p>
              <button
                onClick={() => loadVideos(selectedAlbumId)}
                className="mt-2 px-4 py-2 bg-[#2563eb] text-white rounded-lg text-sm hover:bg-[#1d4ed8] transition-colors"
              >
                再読み込み
              </button>
            </div>
          )}

          {!videosLoading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
              <Video size={40} className="opacity-40" />
              <p className="text-lg font-medium">動画が見つかりません</p>
              {(searchQuery || selectedTag) && (
                <button
                  onClick={() => { setSearchQuery(''); setSelectedTag(null) }}
                  className="text-sm text-[#2563eb] hover:underline"
                >
                  フィルターをクリア
                </button>
              )}
            </div>
          )}

          {!videosLoading && !error && filtered.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((video) => (
                <VideoCard
                  key={video.uri}
                  video={video}
                  folderId={selectedAlbumId}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
