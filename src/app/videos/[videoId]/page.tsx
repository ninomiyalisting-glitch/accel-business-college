'use client'

import { use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  ArrowLeft, Clock, Calendar, Tag, Video,
  Copy, Check, ExternalLink, Lock, AlertCircle, Play,
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

function getVideoId(uri: string) { return uri.split('/').pop() ?? '' }

function getPrivacyHash(link?: string): string | null {
  if (!link) return null
  const parts = link.split('/')
  const last = parts[parts.length - 1]
  if (last && /^[a-f0-9]{8,}$/.test(last) && !/^\d+$/.test(last)) return last
  return null
}

function buildEmbedUrl(video: VimeoVideo): string {
  const id = getVideoId(video.uri)
  const hash = getPrivacyHash(video.link)
  const p = new URLSearchParams({ autoplay: '1', title: '0', byline: '0', portrait: '0', transparent: '0' })
  if (hash) p.set('h', hash)
  return `https://player.vimeo.com/video/${id}?${p.toString()}`
}

function canEmbed(video: VimeoVideo): boolean {
  if (!video.privacy) return true
  if (video.privacy.embed === 'private') return false
  if (video.privacy.view === 'nobody' || video.privacy.view === 'disable') return false
  return true
}

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

function formatDate(iso: string) { return format(new Date(iso), 'yyyy年M月d日', { locale: ja }) }

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
      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
    >
      {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
      {copied ? 'コピー済み' : 'URLをコピー'}
    </button>
  )
}

// ─── Related video card ────────────────────────────────────────────────────────

function RelatedCard({ video, folderId }: { video: VimeoVideo; folderId: string }) {
  const videoId = getVideoId(video.uri)
  const thumb = getThumbnail(video.pictures)
  const [imgError, setImgError] = useState(false)
  return (
    <Link
      href={`/videos/${videoId}?folder=${folderId}`}
      className="group flex gap-3 items-start hover:bg-gray-50 rounded-xl p-2 -mx-2 transition-colors"
    >
      <div className="relative w-28 aspect-video rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
        {thumb && !imgError ? (
          <Image src={thumb} alt={video.name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" onError={() => setImgError(true)} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#279300]/10">
            <Video size={18} className="text-[#1f7a00]/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center">
            <Play size={11} className="text-[#1f7a00] ml-0.5" fill="currentColor" />
          </div>
        </div>
        <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded font-mono">
          {formatDuration(video.duration)}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2 group-hover:text-[#1f7a00] transition-colors">
          {video.name}
        </p>
        <p className="text-xs text-gray-400 mt-1">{formatDate(video.created_time)}</p>
      </div>
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VideoDetailPage({ params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = use(params)
  const searchParams = useSearchParams()
  const folderId = searchParams.get('folder') ?? '25313251'

  const [video, setVideo] = useState<VimeoVideo | null>(null)
  const [related, setRelated] = useState<VimeoVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [pageUrl, setPageUrl] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => { setPageUrl(window.location.href) }, [])

  // Fetch video
  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/vimeo/video/${videoId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setVideo(data as VimeoVideo)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [videoId])

  // Fetch related videos from same folder
  useEffect(() => {
    fetch(`/api/vimeo/videos?project_id=${folderId}`)
      .then((r) => r.json())
      .then((data) => {
        const all: VimeoVideo[] = data.data ?? []
        setRelated(all.filter((v) => getVideoId(v.uri) !== videoId).slice(0, 4))
      })
      .catch(() => {})
  }, [videoId, folderId])

  // Vimeo player error listener
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== 'https://player.vimeo.com') return
      try {
        const d = JSON.parse(e.data as string)
        if (d.event === 'error') setPlayerError(String(d.data?.message ?? d.data ?? 'Playback error'))
      } catch { /* non-JSON */ }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const backHref = folderId === '25313251' ? '/videos' : `/videos/folder/${folderId}`

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-10 h-10 border-[3px] border-accel-dark border-t-[#279300] rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-4 text-white px-4">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-lg font-medium">動画を読み込めませんでした</p>
        <p className="text-white/50 text-sm text-center">{error}</p>
        <Link href={backHref} className="mt-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-sm transition-colors flex items-center gap-2">
          <ArrowLeft size={15} />戻る
        </Link>
      </div>
    )
  }

  const embedUrl = buildEmbedUrl(video)
  const embeddable = canEmbed(video)
  const vimeoUrl = video.link ?? `https://vimeo.com/${videoId}`

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-black/60 backdrop-blur sticky top-0 z-10 border-b border-white/10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-white/60 hover:text-white transition-colors flex-shrink-0"
          >
            <ArrowLeft size={17} />
            <span className="text-sm hidden sm:inline">戻る</span>
          </Link>
          <div className="w-px h-4 bg-white/20 flex-shrink-0" />
          <h1 className="text-white/80 text-sm font-medium truncate min-w-0">{video.name}</h1>
          <div className="ml-auto flex-shrink-0">
            <CopyButton url={pageUrl} />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main column */}
        <div className="lg:col-span-2">
          {/* Player */}
          <div className="rounded-2xl overflow-hidden bg-black">
            {!embeddable ? (
              <div className="aspect-video flex flex-col items-center justify-center gap-4 text-center px-6">
                <Lock size={40} className="text-white/30" />
                <p className="text-white/70 font-medium">この動画は埋め込み再生が制限されています</p>
                <a href={vimeoUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors text-sm">
                  <ExternalLink size={14} />Vimeoで視聴する
                </a>
              </div>
            ) : playerError ? (
              <div className="aspect-video flex flex-col items-center justify-center gap-4 text-center px-6">
                <AlertCircle size={40} className="text-yellow-400/70" />
                <p className="text-white/70 font-medium">再生できませんでした</p>
                <p className="text-white/30 text-xs font-mono bg-white/5 px-3 py-1.5 rounded">{playerError}</p>
                <a href={vimeoUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors text-sm">
                  <ExternalLink size={14} />Vimeoで視聴する
                </a>
              </div>
            ) : (
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  ref={iframeRef}
                  src={embedUrl}
                  className="absolute inset-0 w-full h-full"
                  allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
                  allowFullScreen
                  title={video.name}
                />
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="mt-5 space-y-3">
            <h2 className="text-xl font-bold text-white leading-snug">{video.name}</h2>

            <div className="flex flex-wrap items-center gap-3 text-sm text-white/50">
              <span className="flex items-center gap-1.5">
                <Clock size={14} />
                {formatDuration(video.duration)}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar size={14} />
                {formatDate(video.created_time)}
              </span>
              <a href={vimeoUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-white transition-colors ml-auto text-xs">
                <ExternalLink size={12} />Vimeoで開く
              </a>
            </div>

            {video.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {video.tags.map((t) => (
                  <span key={t.name} className="flex items-center gap-1 text-xs px-2.5 py-1 bg-[#279300]/20 text-accel-light rounded-full">
                    <Tag size={10} />{t.name}
                  </span>
                ))}
              </div>
            )}

            {video.description && (
              <div className="pt-2 border-t border-white/10">
                <p className="text-white/60 text-sm leading-relaxed whitespace-pre-wrap">{video.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: related videos */}
        {related.length > 0 && (
          <aside className="lg:col-span-1">
            <h3 className="text-white/70 text-sm font-semibold mb-4 flex items-center gap-2">
              <Video size={14} />関連動画
            </h3>
            <div className="space-y-1">
              {related.map((v) => (
                <RelatedCard key={v.uri} video={v} folderId={folderId} />
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10">
              <Link href={backHref}
                className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors">
                <ArrowLeft size={13} />すべての動画を見る
              </Link>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
