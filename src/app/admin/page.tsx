'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff, Shield, LogIn, Users, History, ImageIcon, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Channel } from '@/types'

const ADMIN_SLACK_USER_ID = 'U058FM3EFE0'
const SLACK_USER_KEY = 'abc_slackUser'

export default function AdminPage() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [slackUserId, setSlackUserId] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [joinResult, setJoinResult] = useState<{ joined: number; already_member: number; failed: number } | null>(null)
  const [fetchingHistory, setFetchingHistory] = useState(false)
  const [historyResult, setHistoryResult] = useState<{ channels_processed: number; messages_saved: number; messages_skipped: number; errors: string[] } | null>(null)
  const [backfillingAvatars, setBackfillingAvatars] = useState(false)
  const [backfillResult, setBackfillResult] = useState<{ members_fetched: number; users_upserted: number; messages_updated: number; skipped: number } | null>(null)
  const [fetchingReplies, setFetchingReplies] = useState(false)
  const [repliesResult, setRepliesResult] = useState<{ channels_processed: number; threads_found: number; replies_saved: number; replies_skipped: number; errors: string[] } | null>(null)

  // Restore Slack user from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SLACK_USER_KEY)
      if (saved) {
        const user = JSON.parse(saved)
        setSlackUserId(user.slack_user_id ?? null)
      }
    } catch {
      // ignore
    }
  }, [])

  // Load all channels (including hidden ones) for admin view
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .order('name')
      if (!error && data) setChannels(data as Channel[])
      setLoading(false)
    }
    load()

    // Realtime subscription for live updates
    const sub = supabase
      .channel('admin-channels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, () => {
        load()
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [])

  const isAdmin = slackUserId === ADMIN_SLACK_USER_ID

  const toggleHidden = async (channel: Channel) => {
    if (!isAdmin || toggling) return
    setToggling(channel.id)

    const newValue = !channel.is_hidden

    // Optimistic update
    setChannels((prev) =>
      prev.map((c) => (c.id === channel.id ? { ...c, is_hidden: newValue } : c))
    )

    const res = await fetch(`/api/slack/channels/${channel.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-slack-user-id': slackUserId ?? '',
      },
      body: JSON.stringify({ is_hidden: newValue }),
    })

    if (!res.ok) {
      // Revert on error
      setChannels((prev) =>
        prev.map((c) => (c.id === channel.id ? { ...c, is_hidden: !newValue } : c))
      )
      const err = await res.json().catch(() => ({}))
      alert(`エラー: ${err.error ?? res.statusText}`)
    }

    setToggling(null)
  }

  const joinAllChannels = async () => {
    if (!isAdmin || joining) return
    setJoining(true)
    setJoinResult(null)
    try {
      const res = await fetch('/api/slack/join-all-channels', {
        method: 'POST',
        headers: { 'x-slack-user-id': slackUserId ?? '' },
      })
      const json = await res.json()
      if (res.ok) {
        setJoinResult({ joined: json.joined, already_member: json.already_member, failed: json.failed })
      } else {
        alert(`エラー: ${json.error}`)
      }
    } catch (e) {
      alert(`通信エラー: ${e}`)
    }
    setJoining(false)
  }

  const fetchHistory = async () => {
    if (!isAdmin || fetchingHistory) return
    setFetchingHistory(true)
    setHistoryResult(null)
    try {
      const res = await fetch('/api/slack/fetch-history', {
        method: 'POST',
        headers: { 'x-slack-user-id': slackUserId ?? '' },
      })
      const json = await res.json()
      if (res.ok) {
        setHistoryResult(json)
      } else {
        alert(`エラー: ${json.error}`)
      }
    } catch (e) {
      alert(`通信エラー: ${e}`)
    }
    setFetchingHistory(false)
  }

  const fetchReplies = async () => {
    if (!isAdmin || fetchingReplies) return
    setFetchingReplies(true)
    setRepliesResult(null)
    try {
      const res = await fetch('/api/slack/fetch-replies', {
        method: 'POST',
        headers: { 'x-slack-user-id': slackUserId ?? '' },
      })
      const json = await res.json()
      if (res.ok) {
        setRepliesResult(json)
      } else {
        alert(`エラー: ${json.error}`)
      }
    } catch (e) {
      alert(`通信エラー: ${e}`)
    }
    setFetchingReplies(false)
  }

  const backfillAvatars = async () => {
    if (!isAdmin || backfillingAvatars) return
    setBackfillingAvatars(true)
    setBackfillResult(null)
    try {
      const res = await fetch('/api/slack/backfill-avatars', {
        method: 'POST',
        headers: { 'x-slack-user-id': slackUserId ?? '' },
      })
      const json = await res.json()
      if (res.ok) {
        setBackfillResult(json)
      } else {
        alert(`エラー: ${json.error}`)
      }
    } catch (e) {
      alert(`通信エラー: ${e}`)
    }
    setBackfillingAvatars(false)
  }

  const visibleCount = channels.filter((c) => !c.is_hidden).length
  const hiddenCount = channels.filter((c) => c.is_hidden).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1f7a00] text-white px-4 h-14 flex items-center gap-3 shadow-md">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="text-sm hidden sm:inline">ダッシュボード</span>
        </Link>
        <div className="w-px h-5 bg-white/20" />
        <Shield size={16} className="text-accel-lightest" />
        <h1 className="font-bold text-white text-[15px]">管理画面 — チャンネル管理</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Auth check */}
        {!slackUserId ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
            <LogIn size={40} className="text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 font-medium mb-2">Slackログインが必要です</p>
            <p className="text-gray-400 text-sm mb-6">管理画面にアクセスするにはSlackでログインしてください</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1f7a00] text-white rounded-xl text-sm hover:bg-[#145200] transition-colors"
            >
              ダッシュボードへ戻る
            </Link>
          </div>
        ) : !isAdmin ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
            <Shield size={40} className="text-red-300 mx-auto mb-4" />
            <p className="text-gray-600 font-medium mb-2">管理者権限がありません</p>
            <p className="text-gray-400 text-sm mb-6">このページは管理者のみアクセスできます</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1f7a00] text-white rounded-xl text-sm hover:bg-[#145200] transition-colors"
            >
              <ArrowLeft size={15} />
              ダッシュボードへ戻る
            </Link>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="flex gap-3 mb-6">
              <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                <div className="text-2xl font-bold text-gray-900">{visibleCount}</div>
                <div className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
                  <Eye size={12} /> 表示中
                </div>
              </div>
              <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                <div className="text-2xl font-bold text-gray-400">{hiddenCount}</div>
                <div className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
                  <EyeOff size={12} /> 非表示
                </div>
              </div>
              <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                <div className="text-2xl font-bold text-[#1f7a00]">{channels.length}</div>
                <div className="text-xs text-gray-500 mt-0.5">合計</div>
              </div>
            </div>

            {/* Join all channels */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Bot を全チャンネルに参加させる</p>
                  <p className="text-xs text-gray-400 mt-0.5">未参加チャンネルの投稿を受信できるようになります</p>
                </div>
                <button
                  onClick={joinAllChannels}
                  disabled={joining}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-[#1f7a00] hover:bg-[#145200] disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  {joining ? (
                    <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 参加中...</>
                  ) : (
                    <><Users size={15} /> 全チャンネル参加</>
                  )}
                </button>
              </div>
              {joinResult && (
                <div className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 flex gap-4">
                  <span className="text-green-700 font-medium">新規参加: {joinResult.joined}</span>
                  <span className="text-gray-500">参加済み: {joinResult.already_member}</span>
                  {joinResult.failed > 0 && <span className="text-red-500">失敗: {joinResult.failed}</span>}
                </div>
              )}
            </div>

            {/* Fetch history */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700">過去の投稿を取得</p>
                  <p className="text-xs text-gray-400 mt-0.5">Bot参加前のメッセージを全チャンネルから取得してSupabaseに保存します</p>
                </div>
                <button
                  onClick={fetchHistory}
                  disabled={fetchingHistory}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-accel-active hover:bg-accel-text disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  {fetchingHistory ? (
                    <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 取得中...</>
                  ) : (
                    <><History size={15} /> 過去ログを取得</>
                  )}
                </button>
              </div>
              {historyResult && (
                <div className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 space-y-1">
                  <div className="flex gap-4">
                    <span className="text-accel-active font-medium">取得チャンネル: {historyResult.channels_processed}</span>
                    <span className="text-green-700 font-medium">保存: {historyResult.messages_saved}件</span>
                    <span className="text-gray-400">スキップ: {historyResult.messages_skipped}件</span>
                  </div>
                  {historyResult.errors.length > 0 && (
                    <div className="text-red-500">エラー: {historyResult.errors.slice(0, 3).join(' / ')}</div>
                  )}
                </div>
              )}
            </div>

            {/* Fetch thread replies */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700">スレッド返信を取得</p>
                  <p className="text-xs text-gray-400 mt-0.5">過去のスレッド返信（conversations.replies）を全チャンネルから取得して保存します</p>
                </div>
                <button
                  onClick={fetchReplies}
                  disabled={fetchingReplies}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-accel-active hover:bg-accel-text disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  {fetchingReplies ? (
                    <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 取得中...</>
                  ) : (
                    <><MessageSquare size={15} /> 返信を取得</>
                  )}
                </button>
              </div>
              {repliesResult && (
                <div className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 space-y-1">
                  <div className="flex gap-4 flex-wrap">
                    <span className="text-accel-active font-medium">スレッド数: {repliesResult.threads_found}</span>
                    <span className="text-green-700 font-medium">保存: {repliesResult.replies_saved}件</span>
                    <span className="text-gray-400">スキップ: {repliesResult.replies_skipped}件</span>
                  </div>
                  {repliesResult.errors.length > 0 && (
                    <div className="text-red-500">エラー: {repliesResult.errors.slice(0, 3).join(' / ')}</div>
                  )}
                </div>
              )}
            </div>

            {/* Backfill avatars */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700">過去メッセージにアバターを反映</p>
                  <p className="text-xs text-gray-400 mt-0.5">usersテーブルのavatar_urlを既存メッセージに一括反映します</p>
                </div>
                <button
                  onClick={backfillAvatars}
                  disabled={backfillingAvatars}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  {backfillingAvatars ? (
                    <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 反映中...</>
                  ) : (
                    <><ImageIcon size={15} /> アバターを反映</>
                  )}
                </button>
              </div>
              {backfillResult && (
                <div className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 space-y-1">
                  <div className="flex gap-4 flex-wrap">
                    <span className="text-accel-active font-medium">Slackメンバー取得: {backfillResult.members_fetched}人</span>
                    <span className="text-teal-700 font-medium">アバター更新: {backfillResult.messages_updated}件</span>
                    {backfillResult.skipped > 0 && (
                      <span className="text-red-500">エラー: {backfillResult.skipped}件</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Channel list */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">チャンネル一覧</span>
                <span className="text-xs text-gray-400">{channels.length} 件</span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                  <div className="w-5 h-5 border-2 border-gray-200 border-t-[#279300] rounded-full animate-spin" />
                  <span className="text-sm">読み込み中...</span>
                </div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {channels.map((channel) => {
                    const hidden = channel.is_hidden ?? false
                    const isToggling = toggling === channel.id
                    return (
                      <li
                        key={channel.id}
                        className={`flex items-center gap-3 px-4 py-3 transition-colors ${hidden ? 'bg-gray-50/80' : 'hover:bg-gray-50/50'}`}
                      >
                        <span className={`flex-1 text-sm font-medium truncate ${hidden ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          # {channel.name}
                        </span>

                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                          hidden
                            ? 'bg-gray-100 text-gray-400'
                            : 'bg-green-50 text-green-700'
                        }`}>
                          {hidden ? '非表示' : '表示中'}
                        </span>

                        <button
                          onClick={() => toggleHidden(channel)}
                          disabled={isToggling}
                          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            isToggling
                              ? 'opacity-50 cursor-wait'
                              : hidden
                              ? 'bg-[#1f7a00] hover:bg-[#145200] text-white'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          {isToggling ? (
                            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                          ) : hidden ? (
                            <><Eye size={12} /> 表示する</>
                          ) : (
                            <><EyeOff size={12} /> 非表示</>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <p className="text-center text-xs text-gray-400 mt-4">
              変更はサイドバーにリアルタイムで反映されます
            </p>
          </>
        )}
      </div>
    </div>
  )
}
