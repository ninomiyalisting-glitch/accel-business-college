'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, BookOpen, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import RichTextEditor from '@/components/RichTextEditor'

const SLACK_USER_KEY = 'abc_slackUser'
const NEW_CAT_VALUE = '__new__'

interface Category {
  id: string
  name: string
  color: string
}

export default function NewArticlePage() {
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [slackUser, setSlackUser] = useState<{ slack_user_id: string; display_name: string; avatar_url?: string } | null>(null)

  // inline new category
  const [showNewCat, setShowNewCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)
  const newCatInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SLACK_USER_KEY)
      if (raw) setSlackUser(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    supabase.from('article_categories').select('id, name, color').order('name').then(({ data }) => {
      setCategories((data ?? []) as Category[])
    })
  }, [])

  useEffect(() => {
    if (showNewCat) newCatInputRef.current?.focus()
  }, [showNewCat])

  const handleSelectChange = (val: string) => {
    if (val === NEW_CAT_VALUE) {
      setShowNewCat(true)
      setCategoryId('')
    } else {
      setCategoryId(val)
      setShowNewCat(false)
    }
  }

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return
    setCreatingCat(true)
    const { data, error } = await supabase
      .from('article_categories')
      .insert({ name: newCatName.trim(), color: '#2563eb' })
      .select('id, name, color')
      .single()
    setCreatingCat(false)
    if (error || !data) { alert('作成に失敗しました'); return }
    const cat = data as Category
    setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name, 'ja')))
    setCategoryId(cat.id)
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

  const handleSubmit = async (published: boolean) => {
    if (!slackUser) return alert('ログインが必要です')
    if (!title.trim()) return alert('タイトルを入力してください')
    if (!content.trim() || content === '<br>') return alert('本文を入力してください')
    setSaving(true)
    const { data, error } = await supabase.from('articles').insert({
      title: title.trim(),
      content,
      category_id: categoryId || null,
      author_slack_user_id: slackUser.slack_user_id,
      author_name: slackUser.display_name,
      author_avatar: slackUser.avatar_url ?? null,
      cover_image_url: coverImageUrl || null,
      published,
    }).select('id').single()
    setSaving(false)
    if (error) { alert('保存に失敗しました'); return }
    router.push(`/articles/${data.id}`)
  }

  if (!slackUser) {
    return (
      <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center">
        <div className="text-center text-gray-400">
          <p className="mb-4">記事を書くにはログインが必要です</p>
          <Link href="/articles" className="text-[#2563eb] hover:underline text-sm">← 記事一覧に戻る</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/articles" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm hidden sm:inline">記事一覧</span>
          </Link>
          <div className="w-px h-5 bg-gray-200" />
          <BookOpen size={17} className="text-[#2563eb]" />
          <h1 className="font-bold text-gray-900 text-[15px] flex-1">記事を書く</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSubmit(false)}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              下書き保存
            </button>
            <button
              onClick={() => handleSubmit(true)}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : '公開する'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 pb-bottom-nav space-y-4">
        {/* Cover image */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <label className="block text-xs font-medium text-gray-500 mb-2">カバー画像（任意）</label>
          {coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverImageUrl} alt="カバー" className="w-full h-40 object-cover rounded-xl mb-3" />
          )}
          <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg cursor-pointer transition-colors">
            {uploading ? 'アップロード中...' : '画像を選択'}
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
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs font-medium text-gray-500 flex-shrink-0">カテゴリ</label>
            {!showNewCat ? (
              <select
                value={categoryId}
                onChange={(e) => handleSelectChange(e.target.value)}
                className="text-sm text-gray-700 focus:outline-none border border-gray-200 rounded-lg px-2 py-1"
              >
                <option value="">なし</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value={NEW_CAT_VALUE}>＋ 新しいカテゴリーを作成</option>
              </select>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  ref={newCatInputRef}
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="カテゴリー名"
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
        </div>

        {/* Editor */}
        <RichTextEditor
          onChange={setContent}
          onImageUpload={handleImageUpload}
          placeholder="本文を入力..."
          minHeight={400}
        />
      </main>
    </div>
  )
}
