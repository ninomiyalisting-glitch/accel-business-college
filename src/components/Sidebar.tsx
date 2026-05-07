'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Hash, User, Settings, Video, MessageSquare, Shield, LayoutDashboard, ArrowUpDown, CalendarDays, Sparkles } from 'lucide-react'
import { Channel, SlackUser } from '@/types'
import { supabase } from '@/lib/supabase'

const ADMIN_SLACK_USER_ID = 'U058FM3EFE0'
const SORT_KEY = 'abc_channelSort'

type SortOrder = 'default' | 'activity' | 'latest' | 'alpha'

const SORT_LABELS: Record<SortOrder, string> = {
  default: 'デフォルト',
  activity: '投稿が多い順',
  latest: '最終投稿が新しい順',
  alpha: '名前順',
}

interface ChannelStats {
  count7d: number
  lastPost: string
}

interface Props {
  channels: Channel[]
  selectedChannel: Channel | null
  onSelectChannel: (channel: Channel) => void
  userName: string
  slackUser: SlackUser | null
  onUserNameClick: () => void
}

export default function Sidebar({
  channels,
  selectedChannel,
  onSelectChannel,
  userName,
  slackUser,
  onUserNameClick,
}: Props) {
  const pathname = usePathname()
  const [sortOrder, setSortOrder] = useState<SortOrder>('default')
  const [channelStats, setChannelStats] = useState<Record<string, ChannelStats>>({})
  const [statsLoaded, setStatsLoaded] = useState(false)
  const [showSortMenu, setShowSortMenu] = useState(false)

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY) as SortOrder | null
      if (saved && saved in SORT_LABELS) setSortOrder(saved)
    } catch { /* ignore */ }
  }, [])

  const fetchStats = useCallback(async () => {
    if (statsLoaded) return
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [activityRes, latestRes] = await Promise.all([
      supabase.from('messages').select('channel_id').gte('created_at', weekAgo),
      supabase.from('messages').select('channel_id, created_at').order('created_at', { ascending: false }).limit(2000),
    ])

    const stats: Record<string, ChannelStats> = {}

    for (const row of activityRes.data ?? []) {
      if (!stats[row.channel_id]) stats[row.channel_id] = { count7d: 0, lastPost: '' }
      stats[row.channel_id].count7d++
    }

    const seen = new Set<string>()
    for (const row of latestRes.data ?? []) {
      if (!seen.has(row.channel_id)) {
        seen.add(row.channel_id)
        if (!stats[row.channel_id]) stats[row.channel_id] = { count7d: 0, lastPost: row.created_at }
        else stats[row.channel_id].lastPost = row.created_at
      }
    }

    setChannelStats(stats)
    setStatsLoaded(true)
  }, [statsLoaded])

  // Fetch stats when a stats-based sort is selected
  useEffect(() => {
    if (sortOrder === 'activity' || sortOrder === 'latest') {
      fetchStats()
    }
  }, [sortOrder, fetchStats])

  const handleSortChange = (order: SortOrder) => {
    setSortOrder(order)
    setShowSortMenu(false)
    try { localStorage.setItem(SORT_KEY, order) } catch { /* ignore */ }
  }

  const sortedChannels = useMemo(() => {
    const arr = [...channels]
    if (sortOrder === 'alpha') {
      return arr.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    }
    if (sortOrder === 'activity') {
      return arr.sort((a, b) => (channelStats[b.id]?.count7d ?? 0) - (channelStats[a.id]?.count7d ?? 0))
    }
    if (sortOrder === 'latest') {
      return arr.sort((a, b) => {
        const al = channelStats[a.id]?.lastPost ?? ''
        const bl = channelStats[b.id]?.lastPost ?? ''
        return bl.localeCompare(al)
      })
    }
    return arr
  }, [channels, sortOrder, channelStats])

  return (
    <div className="flex flex-col h-full bg-[#f4f6f9] text-gray-800 w-64 flex-shrink-0 border-r border-gray-200">
      {/* ワークスペース名 */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-gray-200">
        <Image src="/icon-192x192.png" alt="ロゴ" width={28} height={28} className="rounded-lg flex-shrink-0" />
        <span className="font-bold text-gray-900 text-[15px] truncate leading-tight">
          アクセルビジネスカレッジ
        </span>
      </div>

      {/* ナビゲーション */}
      <div className="px-3 py-2 border-b border-gray-200 space-y-0.5">
        <Link href="/dashboard" className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${pathname === '/dashboard' ? 'bg-[#2563eb] text-white font-semibold' : 'text-gray-600 hover:bg-[#e8f0fe] hover:text-[#2563eb]'}`}>
          <LayoutDashboard size={15} /> ダッシュボード
        </Link>
        <Link href="/chat" className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${pathname === '/chat' ? 'bg-[#2563eb] text-white font-semibold' : 'text-gray-600 hover:bg-[#e8f0fe] hover:text-[#2563eb]'}`}>
          <MessageSquare size={15} /> チャット
        </Link>
        <Link href="/videos" className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${pathname === '/videos' ? 'bg-[#2563eb] text-white font-semibold' : 'text-gray-600 hover:bg-[#e8f0fe] hover:text-[#2563eb]'}`}>
          <Video size={15} /> 動画ライブラリ
        </Link>
        <Link href="/events" className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${pathname === '/events' || pathname.startsWith('/events/') ? 'bg-[#2563eb] text-white font-semibold' : 'text-gray-600 hover:bg-[#e8f0fe] hover:text-[#2563eb]'}`}>
          <CalendarDays size={15} /> 日程調整
        </Link>
        <Link href="/ai-chat" className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${pathname === '/ai-chat' ? 'bg-[#2563eb] text-white font-semibold' : 'text-gray-600 hover:bg-[#e8f0fe] hover:text-[#2563eb]'}`}>
          <Sparkles size={15} /> AIアシスタント
        </Link>
        {slackUser?.slack_user_id === ADMIN_SLACK_USER_ID && (
          <Link href="/admin" className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${pathname === '/admin' ? 'bg-[#2563eb] text-white font-semibold' : 'text-gray-600 hover:bg-[#e8f0fe] hover:text-[#2563eb]'}`}>
            <Shield size={15} /> 管理画面
          </Link>
        )}
      </div>

      {/* チャンネルリスト */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
        <div className="mt-2">
          {/* チャンネルヘッダー + ソートボタン */}
          <div className="flex items-center justify-between px-4 py-1 relative">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">チャンネル</span>
            <div className="relative">
              <button
                onClick={() => setShowSortMenu((v) => !v)}
                className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors ${
                  sortOrder !== 'default'
                    ? 'text-[#2563eb] bg-[#2563eb]/10'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'
                }`}
                title="並び替え"
              >
                <ArrowUpDown size={11} />
                <span className="hidden sm:inline">{sortOrder !== 'default' ? '並替中' : ''}</span>
              </button>

              {showSortMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-48">
                    {(Object.keys(SORT_LABELS) as SortOrder[]).map((order) => (
                      <button
                        key={order}
                        onClick={() => handleSortChange(order)}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                          sortOrder === order
                            ? 'text-[#2563eb] font-semibold bg-[#2563eb]/5'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {sortOrder === order && <span className="mr-1">✓</span>}
                        {SORT_LABELS[order]}
                        {order === 'activity' && channelStats[channels[0]?.id] !== undefined && (
                          <span className="text-gray-400 ml-1">(7日間)</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <ul className="mt-1 space-y-0.5">
            {sortedChannels.map((channel) => {
              const isActive = selectedChannel?.id === channel.id
              const stats = channelStats[channel.id]
              return (
                <li key={channel.id}>
                  <button
                    onClick={() => onSelectChannel(channel)}
                    className={`w-full flex items-center gap-2 px-4 py-1.5 text-sm rounded-lg mx-1 transition-colors duration-100 text-left ${
                      isActive
                        ? 'bg-[#2563eb] text-white font-semibold'
                        : 'text-gray-600 hover:bg-[#e8f0fe] hover:text-[#2563eb]'
                    }`}
                    style={{ width: 'calc(100% - 8px)' }}
                  >
                    <Hash size={15} className={isActive ? 'text-white' : 'text-gray-400'} />
                    <span className="truncate flex-1">{channel.name}</span>
                    {/* 投稿数バッジ（activity sort時のみ） */}
                    {sortOrder === 'activity' && stats?.count7d > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        isActive ? 'bg-white/20 text-white' : 'bg-[#2563eb]/10 text-[#2563eb]'
                      }`}>
                        {stats.count7d}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* ユーザープロフィール */}
      <div className="border-t border-gray-200 p-3">
        <button
          onClick={onUserNameClick}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-200 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden bg-[#2563eb]/10 flex items-center justify-center">
            {slackUser?.avatar_url ? (
              <Image
                src={slackUser.avatar_url}
                alt={userName}
                width={32}
                height={32}
                className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <User size={14} className="text-[#2563eb]" />
            )}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-gray-900 text-sm font-medium truncate">{userName || 'ゲスト'}</div>
            <div className="text-gray-400 text-xs">オンライン</div>
          </div>
          <Settings size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>
    </div>
  )
}
