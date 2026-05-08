'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, BookOpen, Plus, Search, User, X, Tag, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

const SLACK_USER_KEY = 'abc_slackUser'
const ADMIN_ID = 'U058FM3EFE0'
const UNCATEGORIZED_KEY = '__uncategorized__'

const PRESET_COLORS = [
  '#2563eb', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
  '#84cc16', '#6b7280',
]

interface Category {
  id: string
  name: string
  color: string
}

interface Article {
  id: string
  title: string
  category_id: string | null
  author_name: string
  author_avatar: string | null
  cover_image_url: string | null
  created_at: string
  article_categories: Category | null
}

interface Section {
  key: string
  label: string
  color: string | null
  articles: Article[]
}

export default function ArticlesPage() {
  return (
    <Suspense>
      <ArticlesContent />
    </Suspense>
  )
}

function ArticlesContent() {
  const searchParams = useSearchParams()
  const categoryParam = searchParams.get('category')
  const [articles, setArticles] = useState<Article[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [myName, setMyName] = useState<string | null>(null)
  const [mySlackUserId, setMySlackUserId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [paramApplied, setParamApplied] = useState(false)

  // modal state
  const [showModal, setShowModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatDesc, setNewCatDesc] = useState('')
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0])
  const [savingCat, setSavingCat] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SLACK_USER_KEY)
      if (raw) {
        const u = JSON.parse(raw)
        setMyName(u.display_name ?? null)
        setMySlackUserId(u.slack_user_id ?? null)
      }
    } catch { /* ignore */ }
  }, [])

  const loadData = async () => {
    const [articlesRes, catsRes] = await Promise.all([
      supabase
        .from('articles')
        .select('id, title, category_id, author_name, author_avatar, cover_image_url, created_at, article_categories(id, name, color)')
        .eq('published', true)
        .order('created_at', { ascending: false }),
      supabase.from('article_categories').select('id, name, color').order('name'),
    ])
    setArticles((articlesRes.data ?? []) as unknown as Article[])
    setCategories((catsRes.data ?? []) as Category[])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // When categories are loaded and a ?category= param is set, collapse all other sections
  useEffect(() => {
    if (paramApplied || !categoryParam || categories.length === 0) return
    const otherIds = categories.filter((c) => c.id !== categoryParam).map((c) => c.id)
    setCollapsed(new Set(otherIds))
    setParamApplied(true)
  }, [categoryParam, categories, paramApplied])

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return
    setSavingCat(true)
    const { data, error } = await supabase
      .from('article_categories')
      .insert({ name: newCatName.trim(), description: newCatDesc.trim() || null, color: newCatColor })
      .select('id, name, color')
      .single()
    setSavingCat(false)
    if (error || !data) { alert('作成に失敗しました'); return }
    setCategories((prev) => [...prev, data as Category].sort((a, b) => a.name.localeCompare(b.name, 'ja')))
    setShowModal(false)
    setNewCatName('')
    setNewCatDesc('')
    setNewCatColor(PRESET_COLORS[0])
  }

  const handleDeleteCategory = async (cat: Category) => {
    if (!confirm(`カテゴリー「${cat.name}」を削除しますか？\n（このカテゴリーの記事は「未分類」になります）`)) return
    await supabase.from('article_categories').delete().eq('id', cat.id)
    setCategories((prev) => prev.filter((c) => c.id !== cat.id))
  }

  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const isAdmin = mySlackUserId === ADMIN_ID

  // Build grouped sections
  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? articles.filter((a) => a.title.toLowerCase().includes(q) || a.author_name.toLowerCase().includes(q))
      : articles

    // Group by category
    const catMap = new Map<string, Article[]>()
    const uncategorized: Article[] = []

    for (const a of filtered) {
      if (a.category_id) {
        const list = catMap.get(a.category_id) ?? []
        list.push(a)
        catMap.set(a.category_id, list)
      } else {
        uncategorized.push(a)
      }
    }

    // Build sections from known categories (alphabetical order, already sorted from DB)
    const result: Section[] = categories
      .filter((c) => catMap.has(c.id))
      .map((c) => ({ key: c.id, label: c.name, color: c.color, articles: catMap.get(c.id)! }))

    // Uncategorized last
    if (uncategorized.length > 0) {
      result.push({ key: UNCATEGORIZED_KEY, label: '未分類', color: null, articles: uncategorized })
    }

    return result
  }, [articles, categories, query])

  const totalCount = useMemo(() => sections.reduce((s, sec) => s + sec.articles.length, 0), [sections])

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm hidden sm:inline">ダッシュボード</span>
          </Link>
          <div className="w-px h-5 bg-gray-200" />
          <BookOpen size={17} className="text-[#2563eb]" />
          <h1 className="font-bold text-gray-900 text-[15px] flex-1">ナレッジベース</h1>
          {myName && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-lg text-xs font-medium transition-colors"
              >
                <Tag size={12} /> カテゴリー
              </button>
              <Link
                href="/articles/new"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-lg text-xs font-medium transition-colors"
              >
                <Plus size={13} /> 記事を書く
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 pb-bottom-nav space-y-4">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="タイトル・著者で検索..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
          />
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
                <div className="h-10 bg-gray-50 border-b border-gray-100" />
                {[1, 2, 3].map((j) => (
                  <div key={j} className="flex items-center gap-3 px-4 py-3.5 border-t border-gray-50">
                    <div className="h-3.5 bg-gray-100 rounded w-1/2" />
                    <div className="h-3 bg-gray-100 rounded w-16 ml-auto" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{query ? '条件に一致する記事がありません' : 'まだ記事がありません'}</p>
            {myName && !query && (
              <Link href="/articles/new" className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-[#2563eb] text-white rounded-xl text-sm font-medium hover:bg-[#1d4ed8] transition-colors">
                <Plus size={15} /> 最初の記事を書く
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map((section) => {
              const isCollapsed = collapsed.has(section.key)
              const isUncategorized = section.key === UNCATEGORIZED_KEY
              return (
                <div key={section.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Section header */}
                  <button
                    onClick={() => toggleCollapsed(section.key)}
                    className="w-full flex items-center gap-2.5 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-100"
                  >
                    {section.color ? (
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: section.color }}
                      />
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0" />
                    )}
                    <span className="font-semibold text-gray-800 text-sm flex-1 text-left">
                      {section.label}
                      <span className="ml-1.5 font-normal text-gray-400 text-xs">({section.articles.length})</span>
                    </span>
                    {isAdmin && !isUncategorized && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const cat = categories.find((c) => c.id === section.key)
                          if (cat) handleDeleteCategory(cat)
                        }}
                        className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-500 text-gray-400 transition-colors flex-shrink-0"
                        title="カテゴリーを削除"
                      >
                        <X size={10} />
                      </button>
                    )}
                    <ChevronDown
                      size={15}
                      className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                    />
                  </button>

                  {/* Articles */}
                  {!isCollapsed && (
                    <div>
                      {section.articles.map((article, i) => (
                        <Link
                          key={article.id}
                          href={`/articles/${article.id}`}
                          className={`flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors group ${i !== 0 ? 'border-t border-gray-50' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <h2 className="font-medium text-gray-900 text-sm truncate mb-0.5">{article.title}</h2>
                            <div className="flex items-center gap-1.5 text-xs text-gray-400">
                              {article.author_avatar ? (
                                <Image src={article.author_avatar} alt={article.author_name} width={14} height={14} className="rounded-full flex-shrink-0" />
                              ) : (
                                <User size={11} className="flex-shrink-0" />
                              )}
                              <span className="truncate">{article.author_name}</span>
                            </div>
                          </div>
                          <span className="flex-shrink-0 text-xs text-gray-400">{format(new Date(article.created_at), 'M/d', { locale: ja })}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Category modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 text-base">カテゴリーを追加</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">カテゴリー名 *</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="例：マーケティング"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">説明（任意）</label>
                <input
                  type="text"
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="このカテゴリーの説明"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">カラー</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewCatColor(color)}
                      className={`w-7 h-7 rounded-full transition-transform ${newCatColor === color ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-400">カスタム:</span>
                  <input
                    type="color"
                    value={newCatColor}
                    onChange={(e) => setNewCatColor(e.target.value)}
                    className="w-8 h-7 rounded border border-gray-200 cursor-pointer"
                  />
                  <span className="text-xs text-gray-500 font-mono">{newCatColor}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">プレビュー:</span>
                <span
                  className="inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: newCatColor }}
                >
                  {newCatName || 'カテゴリー名'}
                </span>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreateCategory}
                disabled={savingCat || !newCatName.trim()}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl transition-colors disabled:opacity-50"
              >
                {savingCat ? '作成中...' : '作成する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
