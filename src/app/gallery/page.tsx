'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SlackUser } from '@/types'
import {
  ArrowLeft,
  LogOut,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Upload,
  X,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
} from 'lucide-react'

const ADMIN_SLACK_USER_ID = 'U058FM3EFE0'
const SLACK_USER_KEY = 'abc_slackUser'
const USER_NAME_KEY = 'abc_userName'
const STORAGE_BUCKET = 'gallery'

interface PhotoCategory {
  id: string
  name: string
  description: string | null
  cover_image_url: string | null
  is_member_upload: boolean
  created_by: string | null
  created_at: string
}

interface Photo {
  id: string
  category_id: string
  uploader_name: string
  uploader_avatar: string | null
  image_url: string
  caption: string | null
  created_at: string
}

export default function GalleryPage() {
  const router = useRouter()
  const [slackUser, setSlackUser] = useState<SlackUser | null>(null)
  const [userName, setUserName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  const [categories, setCategories] = useState<PhotoCategory[]>([])
  const [selectedCategory, setSelectedCategory] = useState<PhotoCategory | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [modalPhoto, setModalPhoto] = useState<Photo | null>(null)
  const [modalIndex, setModalIndex] = useState(0)

  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingPhotos, setLoadingPhotos] = useState(false)

  const [showCreateCategory, setShowCreateCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryDesc, setNewCategoryDesc] = useState('')
  const [newCategoryMember, setNewCategoryMember] = useState(true)
  const [creatingCategory, setCreatingCategory] = useState(false)

  const [showUpload, setShowUpload] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadPreviews, setUploadPreviews] = useState<string[]>([])
  const [uploadCaption, setUploadCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SLACK_USER_KEY)
      if (saved) {
        const user: SlackUser = JSON.parse(saved)
        setSlackUser(user)
        setUserName(user.display_name)
        setIsAdmin(user.slack_user_id === ADMIN_SLACK_USER_ID)
      } else {
        const name = localStorage.getItem(USER_NAME_KEY) ?? ''
        setUserName(name)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    setLoadingCategories(true)
    const { data } = await supabase
      .from('photo_categories')
      .select('*')
      .order('created_at', { ascending: false })
    setCategories((data as PhotoCategory[]) ?? [])
    setLoadingCategories(false)
  }

  const loadPhotos = async (categoryId: string) => {
    setLoadingPhotos(true)
    const { data } = await supabase
      .from('photos')
      .select('*')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: false })
    setPhotos((data as Photo[]) ?? [])
    setLoadingPhotos(false)
  }

  const handleSelectCategory = (cat: PhotoCategory) => {
    setSelectedCategory(cat)
    loadPhotos(cat.id)
  }

  const handleBack = () => {
    setSelectedCategory(null)
    setPhotos([])
  }

  const handleLogout = () => {
    if (confirm('ログアウトしますか？')) {
      localStorage.removeItem(SLACK_USER_KEY)
      localStorage.removeItem(USER_NAME_KEY)
      router.push('/')
    }
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return
    setCreatingCategory(true)
    const { data, error } = await supabase
      .from('photo_categories')
      .insert({
        name: newCategoryName.trim(),
        description: newCategoryDesc.trim() || null,
        is_member_upload: newCategoryMember,
        created_by: slackUser?.slack_user_id ?? null,
      })
      .select()
      .single()
    if (!error && data) {
      setCategories((prev) => [data as PhotoCategory, ...prev])
    }
    setCreatingCategory(false)
    setShowCreateCategory(false)
    setNewCategoryName('')
    setNewCategoryDesc('')
    setNewCategoryMember(true)
  }

  const handleDeleteCategory = async (cat: PhotoCategory) => {
    if (!confirm(`「${cat.name}」を削除しますか？\n写真もすべて削除されます。`)) return
    setDeletingCategoryId(cat.id)
    await supabase.from('photo_categories').delete().eq('id', cat.id)
    setCategories((prev) => prev.filter((c) => c.id !== cat.id))
    setDeletingCategoryId(null)
  }

  const handleToggleMemberUpload = async (cat: PhotoCategory) => {
    setTogglingId(cat.id)
    const next = !cat.is_member_upload
    const { error } = await supabase
      .from('photo_categories')
      .update({ is_member_upload: next })
      .eq('id', cat.id)
    if (!error) {
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, is_member_upload: next } : c))
      )
      if (selectedCategory?.id === cat.id) {
        setSelectedCategory((prev) => prev ? { ...prev, is_member_upload: next } : prev)
      }
    }
    setTogglingId(null)
  }

  // Add files (dedup by name+size)
  const addFiles = useCallback((incoming: File[]) => {
    const images = incoming.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    setUploadFiles((prev) => {
      const merged = [...prev]
      for (const f of images) {
        if (!merged.find((x) => x.name === f.name && x.size === f.size)) {
          merged.push(f)
        }
      }
      return merged
    })
    setUploadPreviews((prev) => {
      const merged = [...prev]
      for (const f of images) {
        merged.push(URL.createObjectURL(f))
      }
      // keep in sync with files array (just append)
      return merged
    })
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    addFiles(files)
    e.target.value = ''
  }

  const removeFile = (idx: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== idx))
    setUploadPreviews((prev) => {
      URL.revokeObjectURL(prev[idx])
      return prev.filter((_, i) => i !== idx)
    })
  }

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    addFiles(files)
  }

  // Upload all selected photos
  const handleUploadPhotos = async () => {
    if (uploadFiles.length === 0 || !selectedCategory) return
    setUploading(true)
    setUploadDone(0)
    setUploadError(null)

    const newPhotos: Photo[] = []
    let firstImageUrl: string | null = null

    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i]
      try {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const path = `${selectedCategory.id}/${Date.now()}_${i}.${ext}`

        console.log(`[gallery] uploading ${file.name} → ${path}`)
        const { error: storageError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, file, { upsert: false })

        if (storageError) {
          console.error(`[gallery] storage error for ${file.name}:`, JSON.stringify(storageError))
          throw new Error(`Storage: ${storageError.message}`)
        }

        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
        const imageUrl = urlData.publicUrl
        if (i === 0) firstImageUrl = imageUrl

        const { data: photo, error: dbError } = await supabase
          .from('photos')
          .insert({
            category_id: selectedCategory.id,
            uploader_name: userName || 'メンバー',
            uploader_avatar: slackUser?.avatar_url ?? null,
            image_url: imageUrl,
            caption: uploadCaption.trim() || null,
          })
          .select()
          .single()

        if (dbError) {
          console.error(`[gallery] db error for ${file.name}:`, dbError)
          throw new Error(`DB: ${dbError.message}`)
        }

        newPhotos.push(photo as Photo)
        setUploadDone(i + 1)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[gallery] upload failed for ${file.name}:`, err)
        setUploadError(`「${file.name}」のアップロードに失敗しました。\n${msg}`)
        setUploading(false)
        return
      }
    }

    // Prepend new photos to list
    setPhotos((prev) => [...newPhotos.reverse(), ...prev])

    // Set cover if none
    if (!selectedCategory.cover_image_url && firstImageUrl) {
      await supabase
        .from('photo_categories')
        .update({ cover_image_url: firstImageUrl })
        .eq('id', selectedCategory.id)
      setSelectedCategory((prev) => prev ? { ...prev, cover_image_url: firstImageUrl! } : prev)
      setCategories((prev) =>
        prev.map((c) =>
          c.id === selectedCategory.id ? { ...c, cover_image_url: firstImageUrl! } : c
        )
      )
    }

    closeUploadModal()
    setUploading(false)
  }

  const closeUploadModal = () => {
    setShowUpload(false)
    uploadPreviews.forEach((u) => URL.revokeObjectURL(u))
    setUploadFiles([])
    setUploadPreviews([])
    setUploadCaption('')
    setUploadDone(0)
    setUploadError(null)
    setIsDragging(false)
  }

  const handleDeletePhoto = async (photo: Photo) => {
    if (!confirm('この写真を削除しますか？')) return
    setDeletingPhotoId(photo.id)
    const url = new URL(photo.image_url)
    const storagePath = url.pathname.split(`/object/public/${STORAGE_BUCKET}/`)[1]
    if (storagePath) {
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath])
    }
    await supabase.from('photos').delete().eq('id', photo.id)
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
    setDeletingPhotoId(null)
    if (modalPhoto?.id === photo.id) setModalPhoto(null)
  }

  const openModal = (photo: Photo) => {
    const idx = photos.findIndex((p) => p.id === photo.id)
    setModalIndex(idx)
    setModalPhoto(photo)
  }

  const modalPrev = () => {
    const idx = (modalIndex - 1 + photos.length) % photos.length
    setModalIndex(idx)
    setModalPhoto(photos[idx])
  }

  const modalNext = () => {
    const idx = (modalIndex + 1) % photos.length
    setModalIndex(idx)
    setModalPhoto(photos[idx])
  }

  const canUpload =
    selectedCategory && (isAdmin || selectedCategory.is_member_upload) && userName

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedCategory ? (
              <button
                onClick={handleBack}
                className="text-gray-500 hover:text-gray-700 transition-colors p-1 -ml-1"
              >
                <ArrowLeft size={20} />
              </button>
            ) : (
              <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 transition-colors p-1 -ml-1">
                <ArrowLeft size={20} />
              </Link>
            )}
            <span className="font-bold text-gray-900 text-[15px]">
              {selectedCategory ? selectedCategory.name : 'ギャラリー'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {slackUser?.avatar_url ? (
              <Image
                src={slackUser.avatar_url}
                alt={userName}
                width={32}
                height={32}
                className="rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#2563eb]/10 flex items-center justify-center">
                <span className="text-[#2563eb] text-sm font-medium">{userName?.[0] ?? '?'}</span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              title="ログアウト"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 pb-bottom-nav">
        {!selectedCategory ? (
          /* Category Grid */
          <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-xl font-bold text-gray-900">フォトギャラリー</h1>
                <p className="text-gray-400 text-sm mt-0.5">みんなの写真をシェアしよう</p>
              </div>
              {userName && (
                <button
                  onClick={() => setShowCreateCategory(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#2563eb] text-white rounded-xl text-sm font-medium hover:bg-[#1d4ed8] transition-colors"
                >
                  <Plus size={15} />
                  カテゴリ作成
                </button>
              )}
            </div>

            {loadingCategories ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="aspect-video bg-gray-200 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                <ImageIcon size={48} className="mb-3 opacity-40" />
                <p className="text-sm">カテゴリがまだありません</p>
                {userName && (
                  <button
                    onClick={() => setShowCreateCategory(true)}
                    className="mt-4 px-4 py-2 bg-[#2563eb] text-white rounded-xl text-sm hover:bg-[#1d4ed8] transition-colors"
                  >
                    最初のカテゴリを作成
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {categories.map((cat) => (
                  <div key={cat.id} className="group relative">
                    <button onClick={() => handleSelectCategory(cat)} className="w-full text-left">
                      <div className="aspect-video rounded-2xl overflow-hidden bg-gray-200 relative shadow-sm">
                        {cat.cover_image_url ? (
                          <Image
                            src={cat.cover_image_url}
                            alt={cat.name}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                            <ImageIcon size={32} className="text-gray-300" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <div className="flex items-center gap-1.5">
                            <p className="text-white font-semibold text-sm line-clamp-1">{cat.name}</p>
                            {!cat.is_member_upload && (
                              <Lock size={11} className="text-white/70 flex-shrink-0" />
                            )}
                          </div>
                          {cat.description && (
                            <p className="text-white/70 text-xs line-clamp-1 mt-0.5">{cat.description}</p>
                          )}
                        </div>
                      </div>
                    </button>
                    {isAdmin && (
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleToggleMemberUpload(cat)}
                          disabled={togglingId === cat.id}
                          className="w-7 h-7 bg-white/90 rounded-lg flex items-center justify-center shadow hover:bg-white transition-colors"
                          title={cat.is_member_upload ? 'メンバーアップロード可' : '管理者のみ'}
                        >
                          {cat.is_member_upload ? (
                            <Unlock size={13} className="text-green-600" />
                          ) : (
                            <Lock size={13} className="text-gray-500" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat)}
                          disabled={deletingCategoryId === cat.id}
                          className="w-7 h-7 bg-white/90 rounded-lg flex items-center justify-center shadow hover:bg-red-50 transition-colors"
                          title="削除"
                        >
                          <Trash2 size={13} className="text-red-500" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Photo Grid */
          <>
            <div className="flex items-center justify-between mb-5">
              <div>
                {selectedCategory.description && (
                  <p className="text-gray-400 text-sm">{selectedCategory.description}</p>
                )}
                <p className="text-xs text-gray-300 mt-0.5">
                  {selectedCategory.is_member_upload ? '全員アップロード可' : '管理者のみアップロード可'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => handleToggleMemberUpload(selectedCategory)}
                    disabled={togglingId === selectedCategory.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                  >
                    {selectedCategory.is_member_upload ? (
                      <><Unlock size={13} className="text-green-600" />全員可</>
                    ) : (
                      <><Lock size={13} />管理者のみ</>
                    )}
                  </button>
                )}
                {canUpload && (
                  <button
                    onClick={() => setShowUpload(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#2563eb] text-white rounded-xl text-sm font-medium hover:bg-[#1d4ed8] transition-colors"
                  >
                    <Upload size={15} />
                    写真を追加
                  </button>
                )}
              </div>
            </div>

            {loadingPhotos ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="aspect-square bg-gray-200 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : photos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                <ImageIcon size={48} className="mb-3 opacity-40" />
                <p className="text-sm">写真がまだありません</p>
                {canUpload && (
                  <button
                    onClick={() => setShowUpload(true)}
                    className="mt-4 px-4 py-2 bg-[#2563eb] text-white rounded-xl text-sm hover:bg-[#1d4ed8] transition-colors"
                  >
                    最初の写真を追加
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photos.map((photo) => (
                  <div key={photo.id} className="group relative">
                    <button onClick={() => openModal(photo)} className="w-full">
                      <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 relative shadow-sm">
                        <Image
                          src={photo.image_url}
                          alt={photo.caption ?? ''}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        {photo.caption && (
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="absolute bottom-2 left-2 right-2 text-white text-xs line-clamp-2">
                              {photo.caption}
                            </p>
                          </div>
                        )}
                      </div>
                    </button>
                    {(isAdmin || photo.uploader_name === userName) && (
                      <button
                        onClick={() => handleDeletePhoto(photo)}
                        disabled={deletingPhotoId === photo.id}
                        className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                      >
                        <X size={12} className="text-white" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Photo Modal */}
      {modalPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setModalPhoto(null) }}
        >
          <button
            onClick={() => setModalPhoto(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
          >
            <X size={20} className="text-white" />
          </button>

          {photos.length > 1 && (
            <>
              <button
                onClick={modalPrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
              >
                <ChevronLeft size={24} className="text-white" />
              </button>
              <button
                onClick={modalNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
              >
                <ChevronRight size={24} className="text-white" />
              </button>
            </>
          )}

          <div className="max-w-4xl max-h-[90vh] w-full mx-16 flex flex-col items-center">
            <img
              src={modalPhoto.image_url}
              alt={modalPhoto.caption ?? ''}
              className="max-w-full max-h-[calc(90vh-80px)] mx-auto object-contain rounded-lg"
            />
            <div className="mt-3 text-center">
              {modalPhoto.caption && (
                <p className="text-white text-sm mb-1">{modalPhoto.caption}</p>
              )}
              <div className="flex items-center justify-center gap-2">
                {modalPhoto.uploader_avatar ? (
                  <img src={modalPhoto.uploader_avatar} alt={modalPhoto.uploader_name} className="w-5 h-5 rounded-full" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                    <span className="text-white text-[10px]">{modalPhoto.uploader_name[0]}</span>
                  </div>
                )}
                <span className="text-white/60 text-xs">{modalPhoto.uploader_name}</span>
                {photos.length > 1 && (
                  <span className="text-white/40 text-xs ml-2">{modalIndex + 1} / {photos.length}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Category Modal */}
      {showCreateCategory && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">カテゴリを作成</h2>
              <button onClick={() => setShowCreateCategory(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ名 *</label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="例: 2024年度入学式"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">説明（任意）</label>
                <input
                  type="text"
                  value={newCategoryDesc}
                  onChange={(e) => setNewCategoryDesc(e.target.value)}
                  placeholder="カテゴリの説明"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb]"
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-700">メンバーアップロード</p>
                  <p className="text-xs text-gray-400 mt-0.5">オフにすると管理者のみアップロード可能</p>
                </div>
                <button
                  onClick={() => setNewCategoryMember(!newCategoryMember)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${newCategoryMember ? 'bg-[#2563eb]' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${newCategoryMember ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowCreateCategory(false)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreateCategory}
                disabled={!newCategoryName.trim() || creatingCategory}
                className="flex-1 py-2.5 bg-[#2563eb] text-white rounded-xl text-sm font-medium hover:bg-[#1d4ed8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingCategory ? '作成中...' : '作成する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Photo Modal */}
      {showUpload && selectedCategory && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">写真をアップロード</h2>
              <button onClick={closeUploadModal} disabled={uploading} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-[#2563eb] bg-[#2563eb]/5'
                    : 'border-gray-200 hover:border-[#2563eb]/50'
                }`}
              >
                <div className="py-8 flex flex-col items-center text-gray-400">
                  <Upload size={28} className={`mb-2 transition-colors ${isDragging ? 'text-[#2563eb]' : 'opacity-60'}`} />
                  <p className="text-sm font-medium">
                    {isDragging ? 'ここにドロップ' : 'クリックまたはドラッグ&ドロップ'}
                  </p>
                  <p className="text-xs mt-0.5">JPG, PNG, GIF, WebP・複数選択可</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Preview grid */}
              {uploadFiles.length > 0 && (
                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                  {uploadPreviews.map((src, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeFile(idx)}
                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                      >
                        <X size={10} className="text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {uploadFiles.length > 0 && (
                <p className="text-xs text-gray-400 -mt-1">{uploadFiles.length}枚選択中</p>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">キャプション（任意・全写真共通）</label>
                <input
                  type="text"
                  value={uploadCaption}
                  onChange={(e) => setUploadCaption(e.target.value)}
                  placeholder="写真の説明を入力"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb]"
                />
              </div>

              {/* Error */}
              {uploadError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                  <p className="text-red-600 text-xs whitespace-pre-wrap">{uploadError}</p>
                </div>
              )}

              {/* Progress */}
              {uploading && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>アップロード中...</span>
                    <span className="font-medium text-[#2563eb]">{uploadDone} / {uploadFiles.length}枚完了</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#2563eb] rounded-full transition-all duration-300"
                      style={{ width: `${(uploadDone / uploadFiles.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={closeUploadModal}
                disabled={uploading}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-30"
              >
                キャンセル
              </button>
              <button
                onClick={handleUploadPhotos}
                disabled={uploadFiles.length === 0 || uploading}
                className="flex-1 py-2.5 bg-[#2563eb] text-white rounded-xl text-sm font-medium hover:bg-[#1d4ed8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading
                  ? `${uploadDone}/${uploadFiles.length}枚完了`
                  : uploadFiles.length > 0
                  ? `${uploadFiles.length}枚をアップロード`
                  : 'アップロード'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
