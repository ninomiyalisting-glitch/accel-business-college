'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Lightbulb, Send, Image as ImageIcon, X, MessageCircle,
  Sparkles, Trash2, Loader2, ChevronDown, ChevronUp, Save, FileText, Film,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

const SLACK_USER_KEY = 'abc_slackUser'
const ADMIN_SLACK_USER_ID = 'U058FM3EFE0'

const CATEGORIES = ['ネタ', '気づき', '質問', '動画ネタ', 'コラムネタ', 'リクエスト'] as const
type Category = typeof CATEGORIES[number]

const CATEGORY_COLORS: Record<Category, string> = {
  'ネタ': 'bg-blue-100 text-blue-700',
  '気づき': 'bg-emerald-100 text-emerald-700',
  '質問': 'bg-violet-100 text-violet-700',
  '動画ネタ': 'bg-rose-100 text-rose-700',
  'コラムネタ': 'bg-amber-100 text-amber-700',
  'リクエスト': 'bg-cyan-100 text-cyan-700',
}

const REACTIONS = ['👍', '❤️', '😂', '💡', '🔥'] as const
type Reaction = typeof REACTIONS[number]

interface SlackUser {
  slack_user_id: string
  display_name: string
  avatar_url?: string
}

interface Idea {
  id: string
  author_slack_user_id: string
  author_name: string
  author_avatar: string | null
  content: string
  category: Category | string
  images: string[] | null
  ai_column: string | null
  ai_script: string | null
  created_at: string
  updated_at: string
}

interface IdeaReaction {
  id: string
  idea_id: string
  user_slack_id: string
  user_name: string
  reaction: string
}

interface IdeaComment {
  id: string
  idea_id: string
  author_slack_user_id: string
  author_name: string
  author_avatar: string | null
  content: string
  created_at: string
}

function initialOf(name: string) {
  return (name?.trim().charAt(0) || '?').toUpperCase()
}
function avatarColor(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return `hsl(${h % 360}, 65%, 55%)`
}
function Avatar({ name, url, size = 8 }: { name: string; url?: string | null; size?: number }) {
  const px = `${size * 4}px`
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} loading="lazy" decoding="async" width={size * 4} height={size * 4} className="rounded-full object-cover flex-shrink-0" style={{ width: px, height: px }} />
  }
  return (
    <span
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ width: px, height: px, background: avatarColor(name), fontSize: `${Math.max(size * 1.5, 10)}px` }}
    >
      {initialOf(name)}
    </span>
  )
}

export default function IdeasPage() {
  const [me, setMe] = useState<SlackUser | null>(null)
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [reactions, setReactions] = useState<IdeaReaction[]>([])
  const [comments, setComments] = useState<IdeaComment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Category | 'all'>('all')

  // post form state
  const [postContent, setPostContent] = useState('')
  const [postCategory, setPostCategory] = useState<Category>('ネタ')
  const [postImages, setPostImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // AI modal
  const [aiModal, setAiModal] = useState<{ idea: Idea; type: 'column' | 'script'; html: string; title: string | null; loading: boolean } | null>(null)

  const ideaIdsRef = useRef<string[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SLACK_USER_KEY)
      if (raw) setMe(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  const PAGE_SIZE = 30

  const loadIdeas = useCallback(async () => {
    const { data: iData } = await supabase
      .from('ideas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    const list = (iData ?? []) as Idea[]
    setIdeas(list)
    setLoading(false)

    if (list.length === 0) {
      setReactions([])
      setComments([])
      return
    }
    const ids = list.map((i) => i.id)
    const [rRes, cRes] = await Promise.all([
      supabase.from('idea_reactions').select('*').in('idea_id', ids),
      supabase.from('idea_comments').select('*').in('idea_id', ids).order('created_at', { ascending: true }),
    ])
    setReactions((rRes.data ?? []) as IdeaReaction[])
    setComments((cRes.data ?? []) as IdeaComment[])
  }, [])

  const reloadReactions = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    const { data } = await supabase.from('idea_reactions').select('*').in('idea_id', ids)
    setReactions((data ?? []) as IdeaReaction[])
  }, [])

  const reloadComments = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    const { data } = await supabase.from('idea_comments').select('*').in('idea_id', ids).order('created_at', { ascending: true })
    setComments((data ?? []) as IdeaComment[])
  }, [])

  useEffect(() => { loadIdeas() }, [loadIdeas])

  useEffect(() => {
    ideaIdsRef.current = ideas.map((i) => i.id)
  }, [ideas])

  useEffect(() => {
    const sub = supabase
      .channel('ideas-room')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ideas' }, () => loadIdeas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'idea_reactions' }, () => {
        reloadReactions(ideaIdsRef.current)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'idea_comments' }, () => {
        reloadComments(ideaIdsRef.current)
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [loadIdeas, reloadReactions, reloadComments])

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/ideas/upload-image', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) alert(json.error ?? 'アップロードに失敗しました')
      else if (json.url) setPostImages((prev) => [...prev, json.url])
    } catch (e) {
      alert(`アップロード失敗: ${e}`)
    }
    setUploading(false)
  }

  const submitPost = async () => {
    if (!me) return alert('Slackログインが必要です')
    if (!postContent.trim() && postImages.length === 0) return alert('内容または画像を入力してください')
    setPosting(true)
    const { error } = await supabase.from('ideas').insert({
      author_slack_user_id: me.slack_user_id,
      author_name: me.display_name,
      author_avatar: me.avatar_url ?? null,
      content: postContent.trim(),
      category: postCategory,
      images: postImages.length > 0 ? postImages : null,
    })
    setPosting(false)
    if (error) return alert(`投稿に失敗: ${error.message}`)
    setPostContent('')
    setPostImages([])
    setPostCategory('ネタ')
  }

  const deleteIdea = async (idea: Idea) => {
    if (!confirm('この投稿を削除しますか？')) return
    await supabase.from('ideas').delete().eq('id', idea.id)
  }

  const toggleReaction = async (idea: Idea, r: Reaction) => {
    if (!me) return alert('Slackログインが必要です')
    const existing = reactions.find((x) => x.idea_id === idea.id && x.user_slack_id === me.slack_user_id && x.reaction === r)
    if (existing) {
      await supabase.from('idea_reactions').delete().eq('id', existing.id)
    } else {
      await supabase.from('idea_reactions').insert({
        idea_id: idea.id,
        user_slack_id: me.slack_user_id,
        user_name: me.display_name,
        reaction: r,
      })
    }
  }

  const runAi = async (idea: Idea, type: 'column' | 'script') => {
    setAiModal({ idea, type, html: '', title: null, loading: true })
    try {
      const endpoint = type === 'column' ? '/api/ideas/ai-column' : '/api/ideas/ai-script'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: idea.content, category: idea.category }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error ?? '生成に失敗しました')
        setAiModal(null)
        return
      }
      // Save to ideas row for future reference
      const column = await supabase.from('ideas').update({
        [type === 'column' ? 'ai_column' : 'ai_script']: json.html,
        updated_at: new Date().toISOString(),
      }).eq('id', idea.id)
      void column
      setAiModal({ idea, type, html: json.html, title: json.title, loading: false })
    } catch (e) {
      alert(`エラー: ${e}`)
      setAiModal(null)
    }
  }

  const filtered = filter === 'all' ? ideas : ideas.filter((i) => i.category === filter)

  return (
    <div className="min-h-screen bg-[#f7faf2]">
      {/* 見出しは共通ヘッダーが出す。絞り込みだけ本文側に残す */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-content mx-auto px-4 py-3 overflow-x-auto">
          <div className="flex gap-1.5 min-w-max">
            <button
              onClick={() => setFilter('all')}
              className={`text-[14px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                filter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              すべて
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`text-[14px] px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                  filter === c ? 'bg-gray-900 text-white' : `${CATEGORY_COLORS[c]} hover:opacity-80`
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-content mx-auto px-4 py-4 pb-bottom-nav space-y-4">
        {/* Post form */}
        {me ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-start gap-2">
              <Avatar name={me.display_name} url={me.avatar_url} size={8} />
              <div className="flex-1 min-w-0 space-y-2">
                <textarea
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder="今思いついたこと、気づき、ネタを書こう"
                  rows={3}
                  className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 resize-none"
                />
                {postImages.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {postImages.map((u, i) => (
                      <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        <button
                          onClick={() => setPostImages((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={postCategory}
                    onChange={(e) => setPostCategory(e.target.value as Category)}
                    className="text-xs text-gray-700 border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1.5 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {uploading ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                    画像
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleFile(f)
                      e.target.value = ''
                    }}
                  />
                  <button
                    onClick={submitPost}
                    disabled={posting || (!postContent.trim() && postImages.length === 0)}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    {posting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    投稿
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            Slackログイン後に投稿できます。
          </div>
        )}

        {/* Ideas list */}
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={20} className="animate-spin text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Lightbulb size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">まだ投稿がありません</p>
          </div>
        ) : (
          filtered.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              me={me}
              reactions={reactions.filter((r) => r.idea_id === idea.id)}
              comments={comments.filter((c) => c.idea_id === idea.id)}
              onToggleReaction={(r) => toggleReaction(idea, r)}
              onDelete={() => deleteIdea(idea)}
              onAiColumn={() => runAi(idea, 'column')}
              onAiScript={() => runAi(idea, 'script')}
            />
          ))
        )}
      </main>

      {aiModal && (
        <AiResultModal
          idea={aiModal.idea}
          me={me}
          type={aiModal.type}
          html={aiModal.html}
          title={aiModal.title}
          loading={aiModal.loading}
          onClose={() => setAiModal(null)}
        />
      )}
    </div>
  )
}

function IdeaCard({
  idea, me, reactions, comments, onToggleReaction, onDelete, onAiColumn, onAiScript,
}: {
  idea: Idea
  me: SlackUser | null
  reactions: IdeaReaction[]
  comments: IdeaComment[]
  onToggleReaction: (r: Reaction) => void
  onDelete: () => void
  onAiColumn: () => void
  onAiScript: () => void
}) {
  const [showComments, setShowComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const isOwn = me?.slack_user_id === idea.author_slack_user_id
  const isAdmin = me?.slack_user_id === ADMIN_SLACK_USER_ID
  const canDelete = isOwn || isAdmin
  const canAi = isOwn || isAdmin

  const submitComment = async () => {
    if (!me) return alert('Slackログインが必要です')
    if (!newComment.trim()) return
    setPostingComment(true)
    await supabase.from('idea_comments').insert({
      idea_id: idea.id,
      author_slack_user_id: me.slack_user_id,
      author_name: me.display_name,
      author_avatar: me.avatar_url ?? null,
      content: newComment.trim(),
    })
    setPostingComment(false)
    setNewComment('')
  }

  const deleteComment = async (id: string) => {
    if (!confirm('コメントを削除しますか？')) return
    await supabase.from('idea_comments').delete().eq('id', id)
  }

  const category = idea.category as Category
  const catStyle = CATEGORY_COLORS[category] ?? 'bg-gray-100 text-gray-700'

  // Group reactions by emoji
  const reactionGroups = REACTIONS.map((r) => ({
    emoji: r,
    count: reactions.filter((x) => x.reaction === r).length,
    mine: !!reactions.find((x) => x.reaction === r && x.user_slack_id === me?.slack_user_id),
  }))

  return (
    <article className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start gap-2.5">
        <Avatar name={idea.author_name} url={idea.author_avatar} size={9} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm truncate">{idea.author_name}</span>
            <span className={`text-[14px] px-2 py-0.5 rounded-full font-medium ${catStyle}`}>{category}</span>
            <span className="text-[14px] text-gray-400">{format(new Date(idea.created_at), 'M/d HH:mm', { locale: ja })}</span>
            {canDelete && (
              <button
                onClick={onDelete}
                className="ml-auto text-gray-300 hover:text-red-400 transition-colors"
                title="削除"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
          {idea.content && <p className="mt-1.5 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{idea.content}</p>}
          {idea.images && idea.images.length > 0 && (
            <div className={`mt-2 grid gap-1 ${idea.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {idea.images.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={i} href={u} target="_blank" rel="noreferrer" className="block">
                  <img src={u} alt="" loading="lazy" decoding="async" className="w-full rounded-lg object-cover aspect-video" />
                </a>
              ))}
            </div>
          )}

          {/* Reactions */}
          <div className="flex gap-1.5 flex-wrap mt-3">
            {reactionGroups.map((g) => (
              <button
                key={g.emoji}
                onClick={() => onToggleReaction(g.emoji)}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${
                  g.mine ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span>{g.emoji}</span>
                {g.count > 0 && <span className="font-medium">{g.count}</span>}
              </button>
            ))}
            <button
              onClick={() => setShowComments((v) => !v)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <MessageCircle size={12} />
              {comments.length > 0 ? comments.length : ''}
              {showComments ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          </div>

          {/* AI actions */}
          {canAi && (
            <div className="flex gap-1.5 flex-wrap mt-2">
              <button
                onClick={onAiColumn}
                className="flex items-center gap-1 text-[14px] px-2 py-1 rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
              >
                <Sparkles size={11} /> AIでコラム化
              </button>
              <button
                onClick={onAiScript}
                className="flex items-center gap-1 text-[14px] px-2 py-1 rounded-lg border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors"
              >
                <Sparkles size={11} /> 動画台本を生成
              </button>
            </div>
          )}

          {showComments && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2.5">
              {comments.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">まだコメントはありません</p>
              )}
              {comments.map((c) => {
                const canDeleteComment = me?.slack_user_id === c.author_slack_user_id || isAdmin
                return (
                  <div key={c.id} className="flex items-start gap-2">
                    <Avatar name={c.author_name} url={c.author_avatar} size={6} />
                    <div className="flex-1 min-w-0">
                      <div className="bg-gray-50 rounded-xl px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-gray-800 text-[17px]">{c.author_name}</span>
                          <span className="text-[14px] text-gray-400">{format(new Date(c.created_at), 'M/d HH:mm', { locale: ja })}</span>
                          {canDeleteComment && (
                            <button
                              onClick={() => deleteComment(c.id)}
                              className="ml-auto text-gray-300 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                        <p className="text-[17px] text-gray-700 whitespace-pre-wrap mt-0.5">{c.content}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
              {me && (
                <div className="flex items-start gap-2 pt-1">
                  <Avatar name={me.display_name} url={me.avatar_url} size={6} />
                  <div className="flex-1 flex gap-1.5">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }}
                      placeholder="コメントを書く..."
                      className="flex-1 text-xs text-gray-800 border border-gray-200 rounded-full px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                    />
                    <button
                      onClick={submitComment}
                      disabled={postingComment || !newComment.trim()}
                      className="flex items-center justify-center w-8 h-8 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-full transition-colors"
                    >
                      {postingComment ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function AiResultModal({
  idea, me, type, html, title, loading, onClose,
}: {
  idea: Idea
  me: SlackUser | null
  type: 'column' | 'script'
  html: string
  title: string | null
  loading: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [editTitle, setEditTitle] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (title) setEditTitle(title)
  }, [title])

  const saveAsArticle = async () => {
    if (!me) return alert('Slackログインが必要です')
    if (!editTitle.trim()) return alert('タイトルを入力してください')
    setSaving(true)
    const { data, error } = await supabase.from('articles').insert({
      title: editTitle.trim(),
      content: html,
      category_id: null,
      author_slack_user_id: me.slack_user_id,
      author_name: me.display_name,
      author_avatar: me.avatar_url ?? null,
      cover_image_url: idea.images?.[0] ?? null,
      published: false,
    }).select('id').single()
    setSaving(false)
    if (error || !data) return alert(`保存に失敗: ${error?.message}`)
    router.push(`/articles/${data.id}/edit`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-content max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            {type === 'column' ? <FileText size={16} className="text-amber-600" /> : <Film size={16} className="text-rose-600" />}
            <h3 className="font-semibold text-gray-900 text-sm">
              {type === 'column' ? 'AIコラム下書き' : 'AI動画台本'}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={28} className="animate-spin text-amber-500" />
              <p className="text-sm text-gray-500">AIが{type === 'column' ? 'コラム' : '台本'}を生成しています…</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[14px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">タイトル</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5 mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                />
              </div>
              <div
                className="prose prose-sm max-w-none [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:mb-2 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </>
          )}
        </div>
        {!loading && (
          <div className="flex gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              閉じる
            </button>
            <button
              onClick={saveAsArticle}
              disabled={saving || !editTitle.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              記事として保存
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
