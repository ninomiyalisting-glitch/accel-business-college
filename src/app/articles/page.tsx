'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { BookOpen, Plus, Search, User, X, Tag, ChevronDown, ChevronUp, ChevronDown as ChevronDownIcon, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

const SLACK_USER_KEY = 'abc_slackUser'
const ADMIN_ID = 'U058FM3EFE0'
const UNCATEGORIZED_KEY = '__uncategorized__'

const PRESET_COLORS = [
  '#279300', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
  '#84cc16', '#6b7280',
]

interface Category {
  id: string
  name: string
  description: string | null
  color: string
  parent_id: string | null
  /** 管理画面の上下ボタンで決める並び順。小さいほど先 */
  sort_order: number
  /** ダッシュボードのどのブロックに出すか。'member' / 'guide' / null */
  role: string | null
}

/** ダッシュボードに差し込める用途。1つの用途につき1カテゴリーまで */
const ROLE_LABEL: Record<string, string> = {
  member: 'メンバーコンテンツ',
  guide: '使い方ガイド',
}

/** 並び順。sort_order が同じなら名前で決めて、順序が揺れないようにする */
/** 1カテゴリーにつき一覧へ並べる記事の上限。超えた分はカテゴリーページへ送る */
const NOTE_MAX = 6

function byOrder(a: Category, b: Category): number {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ja')
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

interface ChildSection {
  category: Category
  articles: Article[]
}

interface ParentSection {
  key: string
  label: string
  color: string | null
  directArticles: Article[]   // 大カテゴリー直下に紐付いた記事
  children: ChildSection[]    // 小カテゴリーごとの記事
  totalCount: number
}

/**
 * 画像が無いときの下地色。タイトルから決めるので、
 * 同じ記事は常に同じ色になり、並べたときに見分けがつく。
 */
const CARD_TONES = [
  'bg-accel-lightest text-accel-secondary',
  'bg-[#dff0c4] text-[#279300]',
  'bg-[#e6f2f8] text-[#0097DB]',
  'bg-[#f3f0dc] text-[#8a7f2e]',
  'bg-[#eae7f5] text-[#6b5fa8]',
]
function toneOf(seed: string): string {
  let n = 0
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0
  return CARD_TONES[n % CARD_TONES.length]
}

/** 記事カード。イベント一覧と同じ見せ方に揃える */
function ArticleCard({
  article,
  category,
  showCategory = false,
}: {
  article: Article
  category: Category | null
  /** カテゴリー見出しの下に並ぶときは重複するので既定では出さない */
  showCategory?: boolean
}) {
  return (
    <Link href={`/articles/${article.id}`} className="group">
      <div className={`relative mb-2.5 aspect-[16/10] overflow-hidden rounded-2xl ${toneOf(article.title)}`}>
        {article.cover_image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={article.cover_image_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <BookOpen size={26} />
          </div>
        )}
      </div>
      {showCategory && category && (
        <span
          className="mb-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
          style={{ backgroundColor: category.color }}
        >
          {category.name}
        </span>
      )}
      <h2 className="line-clamp-2 text-sm font-bold leading-snug text-gray-900">{article.title}</h2>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400">
        {article.author_avatar ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={article.author_avatar}
            alt=""
            className="h-5 w-5 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <User size={12} className="flex-shrink-0" />
        )}
        <span className="truncate">{article.author_name}</span>
        <span className="ml-auto flex-shrink-0">
          {format(new Date(article.created_at), 'M/d', { locale: ja })}
        </span>
      </div>
    </Link>
  )
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
  /** 記事 0 件のカテゴリーは普段は出さない。管理者が整理するときだけ切り替えて出す */
  const [showEmptyCats, setShowEmptyCats] = useState(false)
  const [myName, setMyName] = useState<string | null>(null)
  const [mySlackUserId, setMySlackUserId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [paramApplied, setParamApplied] = useState(false)

  // modal state
  const [showModal, setShowModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatDesc, setNewCatDesc] = useState('')
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0])
  const [newCatParentId, setNewCatParentId] = useState('')
  const [savingCat, setSavingCat] = useState(false)
  const [movingCatId, setMovingCatId] = useState<string | null>(null)

  // edit modal state
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editColor, setEditColor] = useState(PRESET_COLORS[0])
  const [editParentId, setEditParentId] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

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
        .select('id, title, category_id, author_name, author_avatar, cover_image_url, created_at, article_categories(id, name, description, color, parent_id)')
        .eq('published', true)
        .order('created_at', { ascending: false }),
      supabase.from('article_categories').select('id, name, description, color, parent_id, sort_order, role').order('sort_order'),
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
      .insert({
        name: newCatName.trim(),
        description: newCatDesc.trim() || null,
        color: newCatColor,
        parent_id: newCatParentId || null,
        // 同じ階層の末尾に置く。0 のままだと既存より前に割り込んでしまう
        sort_order:
          Math.max(
            0,
            ...categories
              .filter((c) => (c.parent_id ?? '') === (newCatParentId || ''))
              .map((c) => c.sort_order)
          ) + 10,
      })
      .select('id, name, description, color, parent_id, sort_order, role')
      .single()
    setSavingCat(false)
    if (error || !data) { alert('作成に失敗しました'); return }
    setCategories((prev) => [...prev, data as Category].sort(byOrder))
    setShowModal(false)
    setNewCatName('')
    setNewCatDesc('')
    setNewCatColor(PRESET_COLORS[0])
    setNewCatParentId('')
  }

  /**
   * カテゴリーの並べ替え。隣と sort_order を入れ替える。
   *
   * 同じ階層（親が同じもの）の中だけで動かす。大カテゴリーと小カテゴリーが
   * 混ざって入れ替わると、画面の並びと合わなくなるため。
   */
  const moveCategory = async (cat: Category, dir: -1 | 1) => {
    const siblings = categories
      .filter((c) => (c.parent_id ?? '') === (cat.parent_id ?? ''))
      .sort(byOrder)
    const i = siblings.findIndex((c) => c.id === cat.id)
    const swap = siblings[i + dir]
    if (!swap) return // 端なので動かせない

    setMovingCatId(cat.id)
    // 値を交換する。連番を振り直すより書き込みが 2 行で済む
    const [a, b] = [
      { id: cat.id, sort_order: swap.sort_order },
      { id: swap.id, sort_order: cat.sort_order },
    ]
    const results = await Promise.all([
      supabase.from('article_categories').update({ sort_order: a.sort_order }).eq('id', a.id),
      supabase.from('article_categories').update({ sort_order: b.sort_order }).eq('id', b.id),
    ])
    setMovingCatId(null)
    if (results.some((r) => r.error)) { alert('並べ替えに失敗しました'); return }

    setCategories((prev) =>
      prev
        .map((c) =>
          c.id === a.id ? { ...c, sort_order: a.sort_order }
          : c.id === b.id ? { ...c, sort_order: b.sort_order }
          : c
        )
        .sort(byOrder)
    )
  }

  /**
   * ダッシュボードのどのブロックに出すかを決める。
   * 同じ用途は 1 カテゴリーまでなので、付け替えるときは先に外す。
   */
  const setCategoryRole = async (cat: Category, role: string | null) => {
    const holder = categories.find((c) => c.role === role && c.id !== cat.id)
    if (role && holder) {
      const ok = confirm(
        `「${ROLE_LABEL[role]}」は現在「${holder.name}」に設定されています。\n「${cat.name}」に付け替えますか？`
      )
      if (!ok) return
      await supabase.from('article_categories').update({ role: null }).eq('id', holder.id)
    }
    const { error } = await supabase
      .from('article_categories')
      .update({ role })
      .eq('id', cat.id)
    if (error) { alert('設定に失敗しました'); return }

    setCategories((prev) =>
      prev.map((c) =>
        c.id === cat.id ? { ...c, role }
        : role && c.role === role ? { ...c, role: null }
        : c
      )
    )
    // 編集中の控えも直す。ここを忘れるとボタンの選択が画面に出ない
    setEditingCat((cur) => (cur && cur.id === cat.id ? { ...cur, role } : cur))
  }

  const openEditModal = (cat: Category) => {
    setEditingCat(cat)
    setEditName(cat.name)
    setEditDesc(cat.description ?? '')
    setEditColor(cat.color || PRESET_COLORS[0])
    setEditParentId(cat.parent_id ?? '')
  }

  const handleUpdateCategory = async () => {
    if (!editingCat || !editName.trim()) return
    setSavingEdit(true)
    const { data, error } = await supabase
      .from('article_categories')
      .update({
        name: editName.trim(),
        description: editDesc.trim() || null,
        color: editColor,
        parent_id: editParentId || null,
      })
      .eq('id', editingCat.id)
      .select('id, name, description, color, parent_id, sort_order, role')
      .single()
    setSavingEdit(false)
    if (error || !data) { alert('更新に失敗しました'); return }
    const updated = data as Category
    setCategories((prev) =>
      prev
        .map((c) => (c.id === updated.id ? updated : c))
        .sort(byOrder)
    )
    // 記事に埋め込まれたカテゴリー情報も同期
    setArticles((prev) =>
      prev.map((a) => (a.category_id === updated.id ? { ...a, article_categories: updated } : a))
    )
    setEditingCat(null)
  }

  const handleDeleteCategory = async (cat: Category) => {
    // 実際に紐付いている記事数を取得（非公開記事も含む）
    const { count } = await supabase
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', cat.id)
    const articleCount = count ?? 0
    const childCount = categories.filter((c) => c.parent_id === cat.id).length

    /**
     * 記事の行き先。
     * 小カテゴリーを消すときは親の大カテゴリーへ移す（未分類に落とさない）。
     * 大カテゴリーを消すときは親が無いので未分類になる。
     */
    const parent = cat.parent_id ? categories.find((c) => c.id === cat.parent_id) ?? null : null
    const destination = parent ?? null

    let message = `カテゴリー「${cat.name}」を削除しますか？\n\nこの操作は取り消せません。`
    if (articleCount > 0) {
      message += destination
        ? `\n\n⚠️ このカテゴリーには ${articleCount} 件の記事があります。\n記事は削除されず、大カテゴリー「${destination.name}」に移動します。`
        : `\n\n⚠️ このカテゴリーには ${articleCount} 件の記事があります。\n記事は削除されず、「未分類」に移動します。`
    }
    if (childCount > 0) {
      message += `\n\n⚠️ ${childCount} 件の小カテゴリーがあります。\n小カテゴリーは削除されず、大カテゴリーに昇格します。`
    }
    if (!confirm(message)) return

    // 記事を先に移してから削除（記事が消えないことを保証）
    if (articleCount > 0) {
      const { error: unlinkError } = await supabase
        .from('articles')
        .update({ category_id: destination?.id ?? null })
        .eq('category_id', cat.id)
      if (unlinkError) { alert('記事の移動に失敗しました'); return }
    }

    const { error } = await supabase.from('article_categories').delete().eq('id', cat.id)
    if (error) { alert('削除に失敗しました'); return }

    setCategories((prev) =>
      prev
        .filter((c) => c.id !== cat.id)
        .map((c) => (c.parent_id === cat.id ? { ...c, parent_id: null } : c))
    )
    setArticles((prev) =>
      prev.map((a) =>
        a.category_id === cat.id
          ? { ...a, category_id: destination?.id ?? null, article_categories: destination }
          : a
      )
    )
    if (editingCat?.id === cat.id) setEditingCat(null)
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

  // 親カテゴリー > 小カテゴリー > 記事 の階層構造を構築
  const sections = useMemo<ParentSection[]>(() => {
    const q = query.trim().toLowerCase()
    // 記事 0 件のカテゴリーは非表示。管理者が「空のカテゴリーも表示」を押したときだけ出す
    // （編集・削除・並び替えのため）
    const showEmpty = isAdmin && showEmptyCats && !q
    const filtered = q
      ? articles.filter((a) => a.title.toLowerCase().includes(q) || a.author_name.toLowerCase().includes(q))
      : articles

    // category_id → articles のマップ
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

    // カテゴリーを「親」(parent_id 無し) と「子」に分類
    // parent_id が指す親が存在しない場合は親扱い
    const catById = new Map(categories.map((c) => [c.id, c]))
    const parents = categories.filter((c) => !c.parent_id || !catById.has(c.parent_id))
    const childrenByParent = new Map<string, Category[]>()
    for (const c of categories) {
      if (c.parent_id && catById.has(c.parent_id)) {
        const list = childrenByParent.get(c.parent_id) ?? []
        list.push(c)
        childrenByParent.set(c.parent_id, list)
      }
    }

    const result: ParentSection[] = []
    for (const parent of parents) {
      const directArticles = catMap.get(parent.id) ?? []
      const children: ChildSection[] = (childrenByParent.get(parent.id) ?? [])
        .map((c) => ({ category: c, articles: catMap.get(c.id) ?? [] }))
        .filter((cs) => cs.articles.length > 0 || showEmpty)
      const totalCount =
        directArticles.length + children.reduce((s, cs) => s + cs.articles.length, 0)
      if (totalCount > 0 || showEmpty) {
        result.push({
          key: parent.id,
          label: parent.name,
          color: parent.color,
          directArticles,
          children,
          totalCount,
        })
      }
    }

    // 未分類は最後
    if (uncategorized.length > 0) {
      result.push({
        key: UNCATEGORIZED_KEY,
        label: '未分類',
        color: null,
        directArticles: uncategorized,
        children: [],
        totalCount: uncategorized.length,
      })
    }
    return result
  }, [articles, categories, query, isAdmin, showEmptyCats])


  return (
    <div className="min-h-screen bg-[#f7faf2]">
      {/* 見出しは共通ヘッダーが出す */}
      {myName && (
        <div className="max-w-content mx-auto px-4 pt-6 flex flex-wrap items-center gap-2.5">
          <Link href="/articles/new" className="btn-primary">
            <Plus size={18} /> 記事を書く
          </Link>
          <button onClick={() => setShowModal(true)} className="btn-secondary">
            <Tag size={16} /> カテゴリー
          </button>
        </div>
      )}

      <main className="max-w-content mx-auto px-4 py-6 pb-bottom-nav space-y-4">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="タイトル・著者で検索..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#279300]/20 focus:border-[#279300]"
          />
        </div>

        {isAdmin && !query && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowEmptyCats((v) => !v)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                showEmptyCats
                  ? 'border-[#279300] bg-accel-lightest text-accel-deep'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {showEmptyCats ? '空のカテゴリーを隠す' : '空のカテゴリーも表示（管理）'}
            </button>
          </div>
        )}

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
        ) : sections.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{query ? '条件に一致する記事がありません' : 'まだ記事がありません'}</p>
            {myName && !query && (
              <Link href="/articles/new" className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-[#1f7a00] text-white rounded-xl text-sm font-medium hover:bg-[#145200] transition-colors">
                <Plus size={15} /> 最初の記事を書く
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {sections.map((section) => {
              const isCollapsed = collapsed.has(section.key)
              const isUncategorized = section.key === UNCATEGORIZED_KEY
              return (
                <div key={section.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Parent header */}
                  <div
                    onClick={() => toggleCollapsed(section.key)}
                    className="w-full flex items-center gap-2.5 px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-100 cursor-pointer"
                  >
                    {section.color ? (
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: section.color }} />
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0" />
                    )}
                    <span className="font-semibold text-gray-800 text-sm flex-1 text-left">
                      {section.label}
                      <span className="ml-1.5 font-normal text-gray-400 text-xs">({section.totalCount})</span>
                    </span>
                    {/* 用途が割り当てられていれば、誰が見ても分かるように出す */}
                    {(() => {
                      const cat = categories.find((c) => c.id === section.key)
                      return cat?.role ? (
                        <span className="flex-shrink-0 rounded-full bg-accel-lightest px-2 py-0.5 text-[11px] font-semibold text-accel-deep">
                          {ROLE_LABEL[cat.role]}
                        </span>
                      ) : null
                    })()}
                    {isAdmin && !isUncategorized && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const cat = categories.find((c) => c.id === section.key)
                            if (cat) moveCategory(cat, -1)
                          }}
                          disabled={movingCatId !== null}
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-500 transition-colors hover:bg-accel-lightest hover:text-[#1f7a00] disabled:opacity-40"
                          title="上へ移動"
                        >
                          <ChevronUp size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const cat = categories.find((c) => c.id === section.key)
                            if (cat) moveCategory(cat, 1)
                          }}
                          disabled={movingCatId !== null}
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-500 transition-colors hover:bg-accel-lightest hover:text-[#1f7a00] disabled:opacity-40"
                          title="下へ移動"
                        >
                          <ChevronDownIcon size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const cat = categories.find((c) => c.id === section.key)
                            if (cat) openEditModal(cat)
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-200 hover:bg-accel-lightest hover:text-[#1f7a00] text-gray-500 transition-colors flex-shrink-0"
                          title="カテゴリーを編集"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const cat = categories.find((c) => c.id === section.key)
                            if (cat) handleDeleteCategory(cat)
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-500 text-gray-500 transition-colors flex-shrink-0"
                          title="カテゴリーを削除"
                        >
                          <Trash2 size={11} />
                        </button>
                      </>
                    )}
                    <ChevronDown size={15} className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                  </div>

                  {/* Body */}
                  {!isCollapsed && (
                    <div>
                      {/* 子カテゴリーごとのブロック */}
                      {section.children.map((cs) => {
                        const childKey = `${section.key}:${cs.category.id}`
                        const childCollapsed = collapsed.has(childKey)
                        return (
                          <div key={cs.category.id} className="border-t border-gray-100">
                            <div
                              onClick={() => toggleCollapsed(childKey)}
                              className="w-full flex items-center gap-2 pl-6 pr-4 py-3 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cs.category.color }} />
                              <span className="font-semibold text-gray-700 text-sm flex-1 text-left">
                                {cs.category.name}
                                <span className="ml-1.5 font-normal text-gray-400 text-xs">({cs.articles.length})</span>
                              </span>
                              {isAdmin && (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openEditModal(cs.category) }}
                                    className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-accel-lightest hover:text-[#1f7a00] text-gray-400 transition-colors flex-shrink-0"
                                    title="小カテゴリーを編集"
                                  >
                                    <Pencil size={11} />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cs.category) }}
                                    className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-500 text-gray-400 transition-colors flex-shrink-0"
                                    title="小カテゴリーを削除"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </>
                              )}
                              <ChevronDown size={14} className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${childCollapsed ? '-rotate-90' : ''}`} />
                            </div>
                            {!childCollapsed && cs.articles.length === 0 && (
                              <div className="pl-9 pr-4 py-3 text-xs text-gray-400 bg-gray-50/50 border-t border-gray-100">
                                記事はまだありません
                              </div>
                            )}
                            {!childCollapsed && cs.articles.length > 0 && (
                              <div className="bg-gray-50/50 px-5 py-6">
                                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                                  {cs.articles.slice(0, NOTE_MAX).map((article) => (
                                    <ArticleCard
                                      key={article.id}
                                      article={article}
                                      category={cs.category}
                                    />
                                  ))}
                                </div>
                                {cs.articles.length > NOTE_MAX && (
                                  <Link
                                    href={`/articles/category/${cs.category.id}`}
                                    className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#279300] hover:underline"
                                  >
                                    すべて見る（{cs.articles.length}件）
                                  </Link>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {section.totalCount === 0 && (
                        <div className="px-4 py-4 text-center text-xs text-gray-400 border-t border-gray-100">
                          記事はまだありません
                        </div>
                      )}

                      {/* 親カテゴリー直下の記事 (小カテゴリーに属さない記事) */}
                      {section.directArticles.length > 0 && (
                        <div
                          className={`px-5 py-6 ${
                            section.children.length > 0 ? 'border-t border-gray-100' : ''
                          }`}
                        >
                          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                            {section.directArticles.slice(0, NOTE_MAX).map((article) => (
                              <ArticleCard
                                key={article.id}
                                article={article}
                                category={article.article_categories}
                              />
                            ))}
                          </div>
                          {section.directArticles.length > NOTE_MAX && section.key !== UNCATEGORIZED_KEY && (
                            <Link
                              href={`/articles/category/${section.key}`}
                              className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#279300] hover:underline"
                            >
                              すべて見る（{section.directArticles.length}件）
                            </Link>
                          )}
                        </div>
                      )}
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
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#279300]/20 focus:border-[#279300]"
                  autoFocus
                  onKeyDown={(e) => {
                    // 日本語入力の変換確定でも Enter が飛んでくる
                    if (e.key !== 'Enter') return
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return
                    e.preventDefault()
                    handleCreateCategory()
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">親カテゴリー（任意）</label>
                <select
                  value={newCatParentId}
                  onChange={(e) => setNewCatParentId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#279300]/20 focus:border-[#279300] bg-white"
                >
                  <option value="">なし（大カテゴリーとして作成）</option>
                  {categories.filter((c) => !c.parent_id).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <p className="text-[14px] text-gray-400 mt-1">親を指定すると小カテゴリーとして作成されます</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">説明（任意）</label>
                <input
                  type="text"
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="このカテゴリーの説明"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#279300]/20 focus:border-[#279300]"
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
                  className="inline-block text-[14px] font-medium px-2.5 py-0.5 rounded-full text-white"
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
                className="flex-1 py-2.5 text-sm font-medium text-white bg-[#1f7a00] hover:bg-[#145200] rounded-xl transition-colors disabled:opacity-50"
              >
                {savingCat ? '作成中...' : '作成する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category edit modal */}
      {editingCat && (() => {
        const hasChildren = categories.some((c) => c.parent_id === editingCat.id)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900 text-base">カテゴリーを編集</h2>
                <button onClick={() => setEditingCat(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">カテゴリー名 *</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="例：マーケティング"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#279300]/20 focus:border-[#279300]"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleUpdateCategory()}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">親カテゴリー</label>
                  <select
                    value={editParentId}
                    onChange={(e) => setEditParentId(e.target.value)}
                    disabled={hasChildren}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#279300]/20 focus:border-[#279300] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">なし（大カテゴリー）</option>
                    {categories
                      .filter((c) => c.id !== editingCat.id && !c.parent_id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                  <p className="text-[14px] text-gray-400 mt-1">
                    {hasChildren
                      ? 'このカテゴリーには小カテゴリーがあるため、親は変更できません'
                      : '親を指定すると小カテゴリーになります'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">説明（任意）</label>
                  <input
                    type="text"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="このカテゴリーの説明"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#279300]/20 focus:border-[#279300]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">カラー</label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setEditColor(color)}
                        className={`w-7 h-7 rounded-full transition-transform ${editColor === color ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-400">カスタム:</span>
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="w-8 h-7 rounded border border-gray-200 cursor-pointer"
                    />
                    <span className="text-xs text-gray-500 font-mono">{editColor}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">プレビュー:</span>
                  <span
                    className="inline-block text-[14px] font-medium px-2.5 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: editColor }}
                  >
                    {editName || 'カテゴリー名'}
                  </span>
                </div>

                {/* ホーム画面のどのブロックに出すか。用途ごとに 1 カテゴリーまで */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                    ホームに出す場所
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: null, label: '出さない' },
                      { value: 'member', label: ROLE_LABEL.member },
                      { value: 'guide', label: ROLE_LABEL.guide },
                    ].map((opt) => {
                      const on = (editingCat.role ?? null) === opt.value
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => setCategoryRole(editingCat, opt.value)}
                          className={
                            on
                              ? 'rounded-xl border-2 border-[#279300] bg-accel-lightest px-3 py-1.5 text-xs font-semibold text-accel-deep'
                              : 'rounded-xl border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:border-[#279300]'
                          }
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] text-gray-400">
                    ホーム画面の「メンバーコンテンツ」「使い方ガイド」に、このカテゴリーの記事を出します。
                  </p>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => setEditingCat(null)}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleUpdateCategory}
                  disabled={savingEdit || !editName.trim()}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-[#1f7a00] hover:bg-[#145200] rounded-xl transition-colors disabled:opacity-50"
                >
                  {savingEdit ? '保存中...' : '保存する'}
                </button>
              </div>

              <button
                onClick={() => handleDeleteCategory(editingCat)}
                className="w-full mt-3 py-2.5 flex items-center justify-center gap-1.5 text-sm font-medium text-red-500 hover:bg-red-50 rounded-xl transition-colors"
              >
                <Trash2 size={14} /> このカテゴリーを削除
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
