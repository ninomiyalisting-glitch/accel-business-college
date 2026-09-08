'use client'

import { useState, useEffect, use } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BookOpen, Edit2, Trash2, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

const SLACK_USER_KEY = 'abc_slackUser'
const ADMIN_ID = 'U058FM3EFE0'

interface Article {
  id: string
  title: string
  content: string
  category_id: string | null
  author_slack_user_id: string
  author_name: string
  author_avatar: string | null
  cover_image_url: string | null
  published: boolean
  created_at: string
  updated_at: string
  article_categories: { id: string; name: string; color: string } | null
}

export default function ArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [mySlackUserId, setMySlackUserId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SLACK_USER_KEY)
      if (raw) setMySlackUserId(JSON.parse(raw).slack_user_id ?? null)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    supabase
      .from('articles')
      .select('*, article_categories(id, name, color)')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setArticle(data as Article | null)
        setLoading(false)
      })
  }, [id])

  const isAdmin = mySlackUserId === ADMIN_ID
  const canEdit = isAdmin || (mySlackUserId && article?.author_slack_user_id === mySlackUserId)

  const handleDelete = async () => {
    if (!confirm('この記事を削除しますか？')) return
    setDeleting(true)
    await supabase.from('articles').delete().eq('id', id)
    router.push('/articles')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7faf2]">
        <div className="max-w-3xl mx-auto px-4 py-16 animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-2/3" />
          <div className="h-4 bg-gray-100 rounded w-1/3" />
          <div className="h-64 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-[#f7faf2] flex items-center justify-center">
        <div className="text-center text-gray-400">
          <p className="mb-4">記事が見つかりません</p>
          <Link href="/articles" className="text-[#1f7a00] hover:underline text-sm">← 記事一覧に戻る</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7faf2]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/articles" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm hidden sm:inline">記事一覧</span>
          </Link>
          <div className="w-px h-5 bg-gray-200" />
          <BookOpen size={17} className="text-[#1f7a00]" />
          <h1 className="font-bold text-gray-900 text-[15px] flex-1 truncate">ナレッジベース</h1>
          {canEdit && (
            <div className="flex items-center gap-2">
              <Link
                href={`/articles/${id}/edit`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <Edit2 size={12} /> 編集
              </Link>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 size={12} /> 削除
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 pb-bottom-nav">
        <article className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {article.cover_image_url && (
            <div className="relative h-52 sm:h-72 bg-gray-100">
              <Image src={article.cover_image_url} alt={article.title} fill className="object-cover" />
            </div>
          )}
          <div className="p-6">
            {article.article_categories && (
              <span
                className="inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full text-white mb-3"
                style={{ backgroundColor: article.article_categories.color }}
              >
                {article.article_categories.name}
              </span>
            )}
            <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-4">{article.title}</h1>
            <div className="flex items-center gap-2.5 pb-5 mb-5 border-b border-gray-100">
              {article.author_avatar ? (
                <Image src={article.author_avatar} alt={article.author_name} width={28} height={28} className="rounded-full flex-shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <User size={14} className="text-gray-400" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-800">{article.author_name}</p>
                <p className="text-xs text-gray-400">{format(new Date(article.created_at), 'yyyy年M月d日', { locale: ja })}</p>
              </div>
              {!article.published && (
                <span className="ml-auto text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">下書き</span>
              )}
            </div>
            <div
              className="article-content"
              dangerouslySetInnerHTML={{ __html: article.content }}
            />
          </div>
        </article>
      </main>
    </div>
  )
}
