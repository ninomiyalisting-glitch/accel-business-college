'use client'

/**
 * カテゴリーごとの記事一覧。
 *
 * ホームや note から「すべて見る」で来る先。
 * 親カテゴリーで来たときは、その下の小カテゴリーの記事もまとめて出す。
 * note の一覧は全カテゴリーを俯瞰する場、ここは1つを掘る場、と役割を分けている。
 */
import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, BookOpen, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

interface Category {
  id: string
  name: string
  description: string | null
  color: string
  parent_id: string | null
}

interface Article {
  id: string
  title: string
  cover_image_url: string | null
  author_name: string
  author_avatar: string | null
  created_at: string
  category_id: string | null
}

/** 画像が無いときの下地色。タイトルから決めるので並べても見分けがつく */
const TONES = [
  'bg-accel-lightest text-accel-secondary',
  'bg-[#dff0c4] text-[#279300]',
  'bg-[#e6f2f8] text-[#0097DB]',
  'bg-[#f3f0dc] text-[#8a7f2e]',
  'bg-[#eae7f5] text-[#6b5fa8]',
]
function toneOf(seed: string): string {
  let n = 0
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0
  return TONES[n % TONES.length]
}

export default function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [category, setCategory] = useState<Category | null>(null)
  const [children, setChildren] = useState<Category[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const { data: cat } = await supabase
        .from('article_categories')
        .select('id, name, description, color, parent_id')
        .eq('id', id)
        .maybeSingle()

      if (!cat) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setCategory(cat as Category)

      // 小カテゴリーの記事も含める。親を開いたのに空、を避ける
      const { data: kids } = await supabase
        .from('article_categories')
        .select('id, name, description, color, parent_id')
        .eq('parent_id', id)
        .order('sort_order')
      const childList = (kids ?? []) as Category[]
      setChildren(childList)

      const ids = [id, ...childList.map((c) => c.id)]
      const { data: arts } = await supabase
        .from('articles')
        .select('id, title, cover_image_url, author_name, author_avatar, created_at, category_id')
        .eq('published', true)
        .in('category_id', ids)
        .order('created_at', { ascending: false })
      setArticles((arts ?? []) as Article[])
      setLoading(false)
    }
    load()
  }, [id])

  if (notFound) {
    return (
      <div className="min-h-screen bg-surface-muted">
        <main className="max-w-content mx-auto px-4 py-16 text-center">
          <p className="mb-4 text-gray-500">カテゴリーが見つかりませんでした。</p>
          <Link href="/articles" className="font-semibold text-accel-active hover:underline">
            ビジカレnote へ戻る
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-muted">
      <main className="max-w-content mx-auto px-4 py-8 pb-bottom-nav">
        <Link
          href="/articles"
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={15} />
          ビジカレnote
        </Link>

        <div className="mb-8">
          <div className="mb-1.5 flex items-center gap-2.5">
            {category && (
              <span
                className="h-3.5 w-3.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
              />
            )}
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              {category?.name ?? '　'}
            </h1>
          </div>
          {category?.description && <p className="text-gray-500">{category.description}</p>}
          {!loading && (
            <p className="mt-1 text-sm text-gray-400">{articles.length} 件の記事</p>
          )}
        </div>

        {/* 小カテゴリーがあれば、そこへも行けるようにする */}
        {children.length > 0 && (
          <div className="mb-8 flex flex-wrap gap-2">
            {children.map((c) => (
              <Link
                key={c.id}
                href={`/articles/category/${c.id}`}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-accel-secondary"
              >
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                {c.name}
              </Link>
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="mb-2 aspect-[16/10] rounded-2xl bg-gray-100" />
                <div className="h-4 w-3/4 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 px-5 py-12 text-center text-gray-400">
            このカテゴリーにはまだ記事がありません。
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {articles.map((a) => (
              <Link key={a.id} href={`/articles/${a.id}`} className="group">
                <div
                  className={`relative mb-2.5 aspect-[16/10] overflow-hidden rounded-2xl ${toneOf(a.title)}`}
                >
                  {a.cover_image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={a.cover_image_url}
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
                <h2 className="line-clamp-2 font-bold leading-snug text-gray-900">{a.title}</h2>
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400">
                  {a.author_avatar ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={a.author_avatar}
                      alt=""
                      className="h-5 w-5 flex-shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <User size={12} className="flex-shrink-0" />
                  )}
                  <span className="truncate">{a.author_name}</span>
                  <span className="ml-auto flex-shrink-0">
                    {format(new Date(a.created_at), 'M/d', { locale: ja })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
