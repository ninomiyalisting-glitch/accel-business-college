'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  ArrowLeft, Check, Clock, Edit2, ExternalLink, Folder,
  FolderOpen, FolderPlus, LogOut, Pencil, Plus, Shield,
  Trash2, Upload, Video, X, AlertCircle,
} from 'lucide-react'

const ADMIN_SLACK_USER_ID = 'U058FM3EFE0'
const SLACK_USER_KEY = 'abc_slackUser'
const USER_NAME_KEY = 'abc_userName'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VimeoFolder { uri: string; name: string; description: string | null; created_time: string }
interface VimeoVideo {
  uri: string; name: string; description: string | null
  duration: number; created_time: string
  pictures: { sizes: { width: number; link: string }[] }
  link?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFolderId(uri: string) { return uri.split('/').pop() ?? '' }
function getVideoId(uri: string) { return uri.split('/').pop() ?? '' }

function getThumbnail(pictures: VimeoVideo['pictures']): string {
  const s = pictures?.sizes ?? []
  if (!s.length) return ''
  const suited = s.filter((x) => x.width <= 640)
  return (suited.length ? suited[suited.length - 1] : s[s.length - 1]).link
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

function formatDate(iso: string) { return format(new Date(iso), 'yyyy/M/d', { locale: ja }) }

// ─── Upload via TUS (direct browser → Vimeo) ─────────────────────────────────

function uploadToVimeo(
  file: File,
  uploadLink: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PATCH', uploadLink, true)
    xhr.setRequestHeader('Tus-Resumable', '1.0.0')
    xhr.setRequestHeader('Upload-Offset', '0')
    xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.floor((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status === 204 || xhr.status === 200) resolve()
      else reject(new Error(`TUS upload failed: ${xhr.status} ${xhr.responseText.slice(0, 200)}`))
    }
    xhr.onerror = () => reject(new Error('ネットワークエラー'))
    xhr.send(file)
  })
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb]'
const btnPrimary = 'flex-1 py-2.5 bg-[#2563eb] text-white rounded-xl text-sm font-medium hover:bg-[#1d4ed8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const btnCancel = 'flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-30'

// ─── Create Folder Modal ──────────────────────────────────────────────────────

function CreateFolderModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (folder: VimeoFolder) => void
}) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/vimeo/manage/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      onCreated({ uri: `/users/me/projects/${data.id}`, name: data.name, description: desc || null, created_time: new Date().toISOString() })
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <Modal title="フォルダを作成" onClose={onClose}>
      <div className="space-y-4">
        <Field label="フォルダ名 *">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 2024年度勉強会" />
        </Field>
        <Field label="説明（任意）">
          <input className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="フォルダの説明" />
        </Field>
        {error && <p className="text-red-500 text-xs bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      </div>
      <div className="flex gap-2 mt-6">
        <button onClick={onClose} className={btnCancel}>キャンセル</button>
        <button onClick={submit} disabled={!name.trim() || loading} className={btnPrimary}>
          {loading ? '作成中...' : '作成する'}
        </button>
      </div>
    </Modal>
  )
}

// ─── Upload Video Modal ───────────────────────────────────────────────────────

function UploadModal({
  folders, defaultFolderId, onClose, onUploaded,
}: {
  folders: VimeoFolder[]
  defaultFolderId: string | null
  onClose: () => void
  onUploaded: (video: VimeoVideo) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [folderId, setFolderId] = useState(defaultFolderId ?? '')
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'init' | 'upload' | 'folder' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  const upload = async () => {
    if (!file || !title.trim()) return
    setError(null)

    // 1. Init upload on Vimeo
    setPhase('init')
    let uploadLink = '', videoId = ''
    try {
      const res = await fetch('/api/vimeo/manage/init-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: title.trim(), description: desc.trim(), size: file.size }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Init failed')
      uploadLink = data.uploadLink
      videoId = data.videoId
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
      return
    }

    // 2. Upload file directly to Vimeo TUS
    setPhase('upload')
    try {
      await uploadToVimeo(file, uploadLink, setProgress)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
      return
    }

    // 3. Add to folder
    if (folderId) {
      setPhase('folder')
      await fetch('/api/vimeo/manage/add-to-folder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, folderId }),
      }).catch(() => {})
    }

    setPhase('done')
    // Return a placeholder video object (Vimeo processes asynchronously)
    onUploaded({
      uri: `/videos/${videoId}`,
      name: title.trim(),
      description: desc.trim() || null,
      duration: 0,
      created_time: new Date().toISOString(),
      pictures: { sizes: [] },
    })
    setTimeout(onClose, 1200)
  }

  const busy = phase !== 'idle' && phase !== 'done'
  const phaseLabel = { idle: '', init: '準備中...', upload: `アップロード中 ${progress}%`, folder: 'フォルダに追加中...', done: '完了！' }

  return (
    <Modal title="動画をアップロード" onClose={busy ? () => {} : onClose}>
      <div className="space-y-4">
        {/* File picker */}
        <div
          onClick={() => !busy && fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl px-4 py-6 text-center cursor-pointer transition-colors ${
            file ? 'border-[#2563eb]/50 bg-[#2563eb]/5' : 'border-gray-200 hover:border-[#2563eb]/40'
          } ${busy ? 'pointer-events-none opacity-60' : ''}`}
        >
          {file ? (
            <div className="flex items-center justify-center gap-2 text-[#2563eb]">
              <Video size={20} />
              <span className="text-sm font-medium truncate max-w-xs">{file.name}</span>
              <span className="text-xs text-gray-400">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
            </div>
          ) : (
            <>
              <Upload size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500">クリックして動画ファイルを選択</p>
              <p className="text-xs text-gray-400 mt-0.5">MP4, MOV, AVI など</p>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={handleFile} />

        <Field label="タイトル *">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="動画のタイトル" disabled={busy} />
        </Field>

        <Field label="説明（任意）">
          <textarea className={`${inputCls} resize-none`} rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="動画の説明" disabled={busy} />
        </Field>

        <Field label="フォルダ">
          <select className={inputCls} value={folderId} onChange={(e) => setFolderId(e.target.value)} disabled={busy}>
            <option value="">フォルダを選択（任意）</option>
            {folders.map((f) => (
              <option key={f.uri} value={getFolderId(f.uri)}>{f.name}</option>
            ))}
          </select>
        </Field>

        {/* Progress */}
        {phase !== 'idle' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{phaseLabel[phase]}</span>
              {phase === 'upload' && <span className="font-medium text-[#2563eb]">{progress}%</span>}
              {phase === 'done' && <Check size={14} className="text-green-500" />}
            </div>
            {phase === 'upload' && (
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#2563eb] rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-600 text-xs">{error}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-6">
        <button onClick={onClose} disabled={busy} className={btnCancel}>キャンセル</button>
        <button onClick={upload} disabled={!file || !title.trim() || busy} className={btnPrimary}>
          {busy ? phaseLabel[phase] : 'アップロード'}
        </button>
      </div>
    </Modal>
  )
}

// ─── Edit Video Modal ─────────────────────────────────────────────────────────

function EditModal({
  video, onClose, onSaved,
}: {
  video: VimeoVideo
  onClose: () => void
  onSaved: (updated: Partial<VimeoVideo>) => void
}) {
  const [name, setName] = useState(video.name)
  const [desc, setDesc] = useState(video.description ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/vimeo/manage/video/${getVideoId(video.uri)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      onSaved({ name: name.trim(), description: desc.trim() || null })
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  return (
    <Modal title="動画を編集" onClose={onClose}>
      <div className="space-y-4">
        <Field label="タイトル">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="説明">
          <textarea className={`${inputCls} resize-none`} rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
        {error && <p className="text-red-500 text-xs bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      </div>
      <div className="flex gap-2 mt-6">
        <button onClick={onClose} className={btnCancel}>キャンセル</button>
        <button onClick={save} disabled={!name.trim() || loading} className={btnPrimary}>
          {loading ? '保存中...' : '保存する'}
        </button>
      </div>
    </Modal>
  )
}

// ─── Video Row ────────────────────────────────────────────────────────────────

function VideoRow({
  video, isAdmin, onEdit, onDelete,
}: {
  video: VimeoVideo
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const thumb = getThumbnail(video.pictures)
  const videoId = getVideoId(video.uri)
  const vimeoUrl = video.link ?? `https://vimeo.com/${videoId}`

  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 hover:shadow-sm transition-shadow">
      <div className="relative w-24 aspect-video rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
        {thumb ? (
          <Image src={thumb} alt={video.name} fill className="object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#2563eb]/10">
            <Video size={18} className="text-[#2563eb]/40" />
          </div>
        )}
        {video.duration > 0 && (
          <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded font-mono">
            {formatDuration(video.duration)}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 line-clamp-1">{video.name}</p>
        {video.description && (
          <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{video.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
          <Clock size={11} />
          <span>{formatDate(video.created_time)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <a href={vimeoUrl} target="_blank" rel="noopener noreferrer"
          className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors" title="Vimeoで開く">
          <ExternalLink size={13} className="text-gray-500" />
        </a>
        {isAdmin && (
          <>
            <button onClick={onEdit}
              className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-blue-50 flex items-center justify-center transition-colors" title="編集">
              <Pencil size={13} className="text-[#2563eb]" />
            </button>
            <button onClick={onDelete}
              className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-red-50 flex items-center justify-center transition-colors" title="削除">
              <Trash2 size={13} className="text-red-500" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManagePage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)

  const [folders, setFolders] = useState<VimeoFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [videos, setVideos] = useState<VimeoVideo[]>([])
  const [foldersLoading, setFoldersLoading] = useState(true)
  const [videosLoading, setVideosLoading] = useState(false)

  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [editingVideo, setEditingVideo] = useState<VimeoVideo | null>(null)
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Auth check — all logged-in members can access; admin gets extra controls
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SLACK_USER_KEY)
      const name = localStorage.getItem(USER_NAME_KEY)
      if (saved) {
        const user = JSON.parse(saved)
        setIsLoggedIn(true)
        setIsAdmin(user.slack_user_id === ADMIN_SLACK_USER_ID)
      } else if (name) {
        setIsLoggedIn(true)
        setIsAdmin(false)
      } else {
        setIsLoggedIn(false)
      }
    } catch { setIsLoggedIn(false) }
  }, [])

  // Redirect non-logged-in users
  useEffect(() => {
    if (isLoggedIn === false) router.replace('/videos')
  }, [isLoggedIn, router])

  // Load folders
  useEffect(() => {
    if (!isLoggedIn) return
    fetch('/api/vimeo/manage/folder')
      .then((r) => r.json())
      .then((d) => setFolders(d.data ?? []))
      .catch(() => {})
      .finally(() => setFoldersLoading(false))
  }, [isLoggedIn])

  // Load videos for selected folder
  const loadVideos = useCallback((folderId: string | null) => {
    if (!folderId) { setVideos([]); return }
    setVideosLoading(true)
    fetch(`/api/vimeo/videos?project_id=${folderId}`)
      .then((r) => r.json())
      .then((d) => setVideos(d.data ?? []))
      .catch(() => setVideos([]))
      .finally(() => setVideosLoading(false))
  }, [])

  useEffect(() => { loadVideos(selectedFolderId) }, [selectedFolderId, loadVideos])

  const handleDeleteVideo = async (video: VimeoVideo) => {
    if (!confirm(`「${video.name}」を削除しますか？\nVimeoからも完全に削除されます。`)) return
    const videoId = getVideoId(video.uri)
    setDeletingVideoId(videoId)
    const res = await fetch(`/api/vimeo/manage/video/${videoId}`, { method: 'DELETE' })
    if (res.ok) setVideos((prev) => prev.filter((v) => getVideoId(v.uri) !== videoId))
    else alert('削除に失敗しました')
    setDeletingVideoId(null)
  }

  const selectedFolderName = selectedFolderId
    ? (folders.find((f) => getFolderId(f.uri) === selectedFolderId)?.name ?? 'フォルダ')
    : null

  if (isLoggedIn === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-blue-100 border-t-[#2563eb] rounded-full animate-spin" />
      </div>
    )
  }

  if (!isLoggedIn) return null

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  const FolderSidebar = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">フォルダ</span>
        {isAdmin && (
          <button onClick={() => setShowCreateFolder(true)}
            className="w-6 h-6 rounded-lg bg-[#2563eb]/10 hover:bg-[#2563eb]/20 flex items-center justify-center transition-colors" title="フォルダ作成">
            <FolderPlus size={13} className="text-[#2563eb]" />
          </button>
        )}
      </div>
      <nav className="flex flex-col gap-0.5 overflow-y-auto flex-1">
        {foldersLoading ? (
          <div className="text-sm text-gray-400 animate-pulse px-2 py-1">読み込み中...</div>
        ) : folders.length === 0 ? (
          <div className="text-sm text-gray-400 px-2 py-1">フォルダなし</div>
        ) : (
          folders.map((f) => {
            const id = getFolderId(f.uri)
            const active = selectedFolderId === id
            return (
              <button key={f.uri} onClick={() => { setSelectedFolderId(id); setSidebarOpen(false) }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${active ? 'bg-[#2563eb] text-white font-semibold' : 'text-gray-700 hover:bg-gray-100'}`}>
                {active ? <FolderOpen size={14} className="flex-shrink-0" /> : <Folder size={14} className="text-gray-400 flex-shrink-0" />}
                <span className="truncate">{f.name}</span>
              </button>
            )
          })
        )}
      </nav>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#1e293b] text-white sticky top-0 z-10 shadow-lg pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-3 px-4 h-14">
          <Link href="/videos" className="flex items-center gap-1.5 text-white/60 hover:text-white transition-colors flex-shrink-0">
            <ArrowLeft size={18} />
            <span className="text-sm hidden sm:inline">動画ライブラリ</span>
          </Link>
          <div className="w-px h-5 bg-white/20 flex-shrink-0" />
          <Shield size={16} className="text-amber-400 flex-shrink-0" />
          <h1 className="font-bold text-white text-[15px]">Vimeo管理</h1>

          {/* Mobile sidebar toggle */}
          <button onClick={() => setSidebarOpen((v) => !v)} className="md:hidden ml-2 flex items-center gap-1 text-white/60 hover:text-white text-sm">
            <Folder size={14} />
            {selectedFolderName ?? 'フォルダ選択'}
          </button>

          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {isAdmin && (
              <button onClick={() => setShowCreateFolder(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white transition-colors">
                <FolderPlus size={13} />
                <span className="hidden sm:inline">フォルダ作成</span>
              </button>
            )}
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] rounded-lg text-xs text-white transition-colors">
              <Upload size={13} />
              <span className="hidden sm:inline">動画アップロード</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
          <div className="fixed top-14 left-0 right-0 z-20 bg-white border-b border-gray-200 p-4 shadow-lg md:hidden max-h-[60vh] overflow-y-auto">
            <FolderSidebar />
          </div>
        </>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-56 flex-shrink-0 bg-white border-r border-gray-100 p-4 sticky top-14 self-start max-h-[calc(100vh-56px)] overflow-y-auto">
          <FolderSidebar />
        </aside>

        {/* Main content */}
        <main className="flex-1 px-4 py-6 min-w-0">
          {!selectedFolderId ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
              <Folder size={48} className="opacity-30" />
              <p className="text-base font-medium">左のサイドバーからフォルダを選択してください</p>
              {isAdmin && (
                <button onClick={() => setShowCreateFolder(true)}
                  className="mt-2 flex items-center gap-2 px-4 py-2 bg-[#2563eb] text-white rounded-xl text-sm hover:bg-[#1d4ed8] transition-colors">
                  <FolderPlus size={14} />フォルダを作成
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                    <FolderOpen size={18} className="text-[#2563eb]" />
                    {selectedFolderName}
                  </h2>
                  {!videosLoading && (
                    <p className="text-xs text-gray-400 mt-0.5">{videos.length}本の動画</p>
                  )}
                </div>
                <button onClick={() => setShowUpload(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#2563eb] text-white rounded-xl text-sm font-medium hover:bg-[#1d4ed8] transition-colors">
                  <Upload size={14} />動画を追加
                </button>
              </div>

              {videosLoading ? (
                <div className="flex items-center justify-center py-16 gap-3">
                  <div className="w-8 h-8 border-[3px] border-blue-100 border-t-[#2563eb] rounded-full animate-spin" />
                  <span className="text-gray-400 text-sm">読み込み中...</span>
                </div>
              ) : videos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                  <Video size={40} className="opacity-30" />
                  <p className="text-sm">このフォルダに動画がありません</p>
                  <button onClick={() => setShowUpload(true)}
                    className="mt-1 px-4 py-2 bg-[#2563eb] text-white rounded-xl text-sm hover:bg-[#1d4ed8] transition-colors flex items-center gap-1.5">
                    <Upload size={13} />最初の動画をアップロード
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {videos.map((video) => {
                    const vid = getVideoId(video.uri)
                    return (
                      <div key={video.uri} className={deletingVideoId === vid ? 'opacity-40 pointer-events-none' : ''}>
                        <VideoRow
                          video={video}
                          isAdmin={isAdmin}
                          onEdit={() => setEditingVideo(video)}
                          onDelete={() => handleDeleteVideo(video)}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      {showCreateFolder && (
        <CreateFolderModal
          onClose={() => setShowCreateFolder(false)}
          onCreated={(f) => setFolders((prev) => [f, ...prev])}
        />
      )}

      {showUpload && (
        <UploadModal
          folders={folders}
          defaultFolderId={selectedFolderId}
          onClose={() => setShowUpload(false)}
          onUploaded={(video) => {
            setVideos((prev) => [video, ...prev])
          }}
        />
      )}

      {editingVideo && (
        <EditModal
          video={editingVideo}
          onClose={() => setEditingVideo(null)}
          onSaved={(updated) => {
            setVideos((prev) => prev.map((v) => v.uri === editingVideo.uri ? { ...v, ...updated } : v))
            setEditingVideo(null)
          }}
        />
      )}
    </div>
  )
}
