'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { X, Search, Hash, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

interface SearchResult {
  id: string
  channel_id: string
  user_name: string
  content: string
  created_at: string
  avatar_url: string | null
}

interface Props {
  channelMap: Record<string, string>  // id → name
  avatarMap: Record<string, string>   // display_name → avatar_url
  onClose: () => void
  onSelectChannel: (channelName: string) => void
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part}</mark>
      : part
  )
}

export default function ChatSearch({ channelMap, avatarMap, onClose, onSelectChannel }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    setSearched(true)

    const { data } = await supabase
      .from('messages')
      .select('id, channel_id, user_name, content, created_at, avatar_url')
      .ilike('content', `%${trimmed}%`)
      .order('created_at', { ascending: false })
      .limit(50)

    setResults((data ?? []) as SearchResult[])
    setLoading(false)
  }, [])

  const handleChange = (val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 400)
  }

  const handleResultClick = (result: SearchResult) => {
    const channelName = channelMap[result.channel_id]
    if (channelName) onSelectChannel(channelName)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-x-0 top-0 z-50 md:inset-x-auto md:right-0 md:left-auto md:w-[480px] md:h-full flex flex-col bg-white shadow-2xl md:rounded-l-2xl max-h-screen">
        {/* Search header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="メッセージを検索..."
            className="flex-1 text-sm text-gray-800 placeholder-gray-400 focus:outline-none bg-transparent"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); setSearched(false) }} className="text-gray-300 hover:text-gray-500 transition-colors">
              <X size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Hint */}
        {!searched && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-12 text-gray-400">
            <Search size={36} className="mb-3 opacity-30" />
            <p className="text-sm">キーワードを入力して検索</p>
            <p className="text-xs mt-1">Esc で閉じる</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#279300]/30 border-t-[#279300] rounded-full animate-spin" />
          </div>
        )}

        {/* Results */}
        {!loading && searched && (
          <div className="flex-1 overflow-y-auto">
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
                <Search size={32} className="mb-3 opacity-30" />
                <p>「{query}」に一致するメッセージが見つかりません</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-50">
                  {results.length}件の結果
                  {results.length === 50 && '（最大50件）'}
                </div>
                <ul className="divide-y divide-gray-50">
                  {results.map((result) => {
                    const channelName = channelMap[result.channel_id]
                    const avatar = result.avatar_url ?? avatarMap[result.user_name] ?? null
                    return (
                      <li key={result.id}>
                        <button
                          onClick={() => handleResultClick(result)}
                          className="w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors group"
                        >
                          {/* Meta row */}
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 bg-[#279300]/10 flex items-center justify-center">
                              {avatar ? (
                                <Image src={avatar} alt={result.user_name} width={24} height={24} className="w-full h-full object-cover" />
                              ) : (
                                <User size={12} className="text-[#1f7a00]" />
                              )}
                            </div>
                            <span className="text-xs font-semibold text-gray-700">{result.user_name}</span>
                            {channelName && (
                              <>
                                <span className="text-gray-300 text-xs">·</span>
                                <span className="flex items-center gap-0.5 text-xs text-gray-400">
                                  <Hash size={10} />
                                  {channelName}
                                </span>
                              </>
                            )}
                            <span className="ml-auto text-[11px] text-gray-400 flex-shrink-0">
                              {format(new Date(result.created_at), 'M/d HH:mm', { locale: ja })}
                            </span>
                          </div>
                          {/* Content */}
                          <p className="text-sm text-gray-700 line-clamp-3 leading-relaxed pl-8">
                            {highlight(result.content || '(添付ファイル)', query)}
                          </p>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
