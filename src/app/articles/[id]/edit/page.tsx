'use client'

import { useState, useEffect, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, BookOpen, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import RichTextEditor from '@/components/RichTextEditor'

const SLACK_USER_KEY = 'abc_slackUser'
const ADMIN_ID = 'U058FM3EFE0'
const NEW_CAT_VALUE = '__new__'

interface Category {
  id: string
  name: string
  color: string
  parent_id: string | null
}

export default function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [parentCategoryId, setParentCategoryId] = useState('')
  const [subCategoryId, setSubCategoryId] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [published, setPublished] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingArticle, setLoadingArticle] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [mySlackUserId, setMySlackUserId] = useState<string | null>(null)

  // inline new category (大カテゴリー追加用)
  const [showNewCat, setShowNewCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)
  const newCatInputRef = useRef<HTMLInputElement>(null)

  const categoryId = subCategoryId || parentCategoryId

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SLACK_USER_KEY)
      if (raw) setMySlackUserId(JSON.parse(raw).slack_user_id ?? null)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    supabase.from('article_categories').select('id, name, color, parent_id').order('name').then(({ data }) => {
      setCategories((data ?? []) as Category[])
    })
  }, [])

  useEffect(() => {
    if (showNewCat) newCatInputRef.current?.focus()
  }, [showNewCat])

  // 既存記事のロード (categories が揃ってから parent/sub に分解できる)
  useEffect(() => {
    if (!mySlackUserId || categories.length === 0) return
    if (!loadingArticle) return  // 二重実行防止
    supabase
      .from('articles')
      .select('title, content, category_id, cover_image_url, published, author_slack_user_id')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) { router.push('/articles'); return }
        const isAdmin = mySlackUserId === ADMIN_ID
        if (!isAdmin && data.author_slack_user_id !== mySlackUserId) {
          router.push(`/articles/${id}`)
          return
        }
        setTitle(data.title)
        setContent(data.content)
        // 既存 category_id を parent/sub に分解
        if (data.category_id) {
          const cat = categories.find((c) => c.id === data.category_id)
          if (cat?.parent_id) {
            setParentCategoryId(cat.parent_id)
            setSubCategoryId(cat.id)
          } else {
            setParentCategoryId(data.category_id)
            setSubCategoryId('')
          }
        }
        setCoverImageUrl(data.cover_image_url ?? '')
        setPublished(data.published)
        setAuthorized(true)
        setLoadingArticle(false)
      })
  }, [id, mySlackUserId, categories, loadingArticle, router])

  const parentCategories = categories.filter((c) => !c.parent_id)
  const subCategories = categories.filter((c) => c.parent_id === parentCategoryId)

  const handleParentChange = (val: string) => {
    if (val === NEW_CAT_VALUE) {
      setShowNewCat(true)
      setParentCategoryId('')
      setSubCategoryId('')
    } else {
      setParentCategoryId(val)
      setSubCategoryId('')
      setShowNewCat(false)
    }
  }

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return
    setCreatingCat(true)
    const { data, error } = await supabase
      .from('article_categories')
      .insert({ name: newCatName.trim(), color: '#2563eb' })
      .select('id, name, color, parent_id')
      .single()
    setCreatingCat(false)
    if (error || !data) { alert('作成に失敗しました'); return }
    const cat = data as Category
    setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name, 'ja')))
    setParentCategoryId(cat.id)
    setSubCategoryId('')
    setNewCatName('')
    setShowNewCat(false)
  }

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `covers/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('articles').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('articles').getPublicUrl(path)
      setCoverImageUrl(data.publicUrl)
    }
    setUploading(false)
  }

  const handleImageUpload = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()
    const path = `content/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('articles').upload(path, file, { upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('articles').getPublicUrl(path)
    return data.publicUrl
  }

  const handleSave = async (pub: boolean) => {
    if (!title.trim()) return alert('タイトルを入力してください')
    setSaving(true)
    const { error } = await supabase.from('articles').update({
      title: title.trim(),
      content,
      category_id: categoryId || null,
      cover_image_url: coverImageUrl || null,
      published: pub,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setSaving(false)
    if (error) { alert('保存に失敗しました'); return }
    router.push(`/articles/${id}`)
  }

  if (loadingArticle) {
    return (
      <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center">
        <div className="text-gray-400 text-sm">読み込み中...</div>
      </div>
    )
  }

  if (!authorized) return null

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href={`/articles/${id}`} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm hidden sm:inline">記事に戻る</span>
          </Link>
          <div className="w-px h-5 bg-gray-200" />
          <BookOpen size={17} className="text-[#2563eb]" />
          <h1 className="font-bold text-gray-900 text-[15px] flex-1">記事を編集</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              下書き保存
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : published ? '更新する' : '公開する'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 pb-bottom-nav space-y-4">
        {/* Cover image */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <label className="block text-xs font-medium text-gray-500 mb-2">カバー画像</label>
          {coverImageUrl && (
            <div className="relative mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverImageUrl} alt="カバー" loading="lazy" decoding="async" className="w-full h-40 object-cover rounded-xl" />
              <button
                type="button"
                onClick={() => setCoverImageUrl('')}
                className="absolute top-2 right-2 px-2 py-1 text-xs bg-black/50 text-white rounded-lg hover:bg-black/70"
              >
                削除
              </button>
            </div>
          )}
          <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg cursor-pointer transition-colors">
            {uploading ? 'アップロード中...' : '画像を変更'}
            <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} disabled={uploading} />
          </label>
        </div>

        {/* Title + category */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="記事タイトル"
            className="w-full text-xl font-bold text-gray-900 placeholder-gray-300 focus:outline-none border-b border-gray-100 pb-3"
          />
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs font-medium text-gray-500 flex-shrink-0 w-20">大カテゴリー</label>
              {!showNewCat ? (
                <select
                  value={parentCategoryId}
                  onChange={(e) => handleParentChange(e.target.value)}
                  className="text-sm text-gray-700 focus:outline-none border border-gray-200 rounded-lg px-2 py-1 bg-white"
                >
                  <option value="">なし</option>
                  {parentCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  <option value={NEW_CAT_VALUE}>＋ 新しい大カテゴリーを作成</option>
                </select>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={newCatInputRef}
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="大カテゴリー名"
                    className="text-sm border border-[#2563eb] rounded-lg px-2 py-1 focus:outline-none w-36"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategory(); if (e.key === 'Escape') { setShowNewCat(false); setNewCatName('') } }}
                  />
                  <button
                    onClick={handleCreateCategory}
                    disabled={creatingCat || !newCatName.trim()}
                    className="w-6 h-6 flex items-center justify-center bg-[#2563eb] text-white rounded-md hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    onClick={() => { setShowNewCat(false); setNewCatName('') }}
                    className="w-6 h-6 flex items-center justify-center bg-gray-100 text-gray-500 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
            {parentCategoryId && subCategories.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs font-medium text-gray-500 flex-shrink-0 w-20">小カテゴリー</label>
                <select
                  value={subCategoryId}
                  onChange={(e) => setSubCategoryId(e.target.value)}
                  className="text-sm text-gray-700 focus:outline-none border border-gray-200 rounded-lg px-2 py-1 bg-white"
                >
                  <option value="">未指定（大カテゴリー直下）</option>
                  {subCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Editor */}
        <RichTextEditor
          initialValue={content}
          onChange={setContent}
          onImageUpload={handleImageUpload}
          placeholder="本文を入力..."
          minHeight={400}
        />
      </main>
    </div>
  )
}
