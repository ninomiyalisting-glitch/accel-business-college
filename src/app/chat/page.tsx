'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Channel, Message, ReactionsMap, SlackUser, CustomEmojis } from '@/types'
import Sidebar from '@/components/Sidebar'
import ChatArea from '@/components/ChatArea'
import UserNameDialog from '@/components/UserNameDialog'
import { MemberInfo } from '@/components/MemberPopup'
import { Menu } from 'lucide-react'

const SLACK_USER_KEY = 'abc_slackUser'
const USER_NAME_KEY = 'abc_userName'

type AvatarMap = Record<string, string>
type UserInfoMap = Record<string, MemberInfo>
type UserBySlackId = Record<string, { displayName: string; avatarUrl: string | null }>

// PostgreSQL TIMESTAMPTZ は初期 SELECT と Realtime payload で文字列書式
// (microsecond 精度・タイムゾーン表記) が一致しない場合があるため、
// reactionsMap のキーは epoch ms 文字列に正規化して照合する
function tsKey(ts: string | null | undefined): string {
  if (!ts) return ''
  const t = new Date(ts).getTime()
  return Number.isFinite(t) ? String(t) : ts
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full bg-[#f7faf2]">
        <div className="w-12 h-12 border-4 border-[#279300]/30 border-t-[#279300] rounded-full animate-spin" />
      </div>
    }>
      <ChatContent />
    </Suspense>
  )
}

function ChatContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [userName, setUserName] = useState<string>('')
  const [slackUser, setSlackUser] = useState<SlackUser | null>(null)
  const [avatarMap, setAvatarMap] = useState<AvatarMap>({})
  const [userInfoMap, setUserInfoMap] = useState<UserInfoMap>({})
  const [userBySlackId, setUserBySlackId] = useState<UserBySlackId>({})
  const [customEmojis, setCustomEmojis] = useState<CustomEmojis>({})
  const [showUserNameDialog, setShowUserNameDialog] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [reactionsMap, setReactionsMap] = useState<ReactionsMap>({})
  const loadingMoreRef = useRef(false)

  // OAuth コールバック後のログイン情報を URL から読み取り localStorage に保存
  useEffect(() => {
    const loginStatus = searchParams.get('login')
    if (loginStatus === 'success') {
      const slackUserId = searchParams.get('slack_user_id') ?? ''
      const displayName = searchParams.get('display_name') ?? ''
      const avatarUrl = searchParams.get('avatar_url') ?? ''

      if (slackUserId && displayName) {
        const user: SlackUser = { slack_user_id: slackUserId, display_name: displayName, avatar_url: avatarUrl }
        localStorage.setItem(SLACK_USER_KEY, JSON.stringify(user))
        localStorage.setItem(USER_NAME_KEY, displayName)
        setSlackUser(user)
        setUserName(displayName)
      }

      // URL をクリーン（channel パラメータは保持）
      const channel = searchParams.get('channel')
      const cleanUrl = channel ? `/chat?channel=${encodeURIComponent(channel)}` : '/chat'
      router.replace(cleanUrl)
      return
    }

    // localStorage からセッション復元
    const savedSlackUser = localStorage.getItem(SLACK_USER_KEY)
    if (savedSlackUser) {
      try {
        const user: SlackUser = JSON.parse(savedSlackUser)
        setSlackUser(user)
        setUserName(user.display_name)
        return
      } catch {
        localStorage.removeItem(SLACK_USER_KEY)
      }
    }

    const savedName = localStorage.getItem(USER_NAME_KEY)
    if (savedName) {
      setUserName(savedName)
    } else {
      setShowUserNameDialog(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // カスタム絵文字を取得
  useEffect(() => {
    fetch('/api/slack/emojis')
      .then((r) => r.json())
      .then((data) => { if (data.emojis) setCustomEmojis(data.emojis) })
      .catch(() => {})
  }, [])

  // users テーブルからアバターマップ + ユーザー情報マップ + slack_user_id マップを取得
  useEffect(() => {
    const fetchAvatars = async () => {
      const { data } = await supabase
        .from('users')
        .select('display_name, avatar_url, slack_user_id')
        .limit(5000)
      if (data) {
        const amap: AvatarMap = {}
        const umap: UserInfoMap = {}
        const byId: UserBySlackId = {}
        for (const u of data) {
          if (!u.display_name) continue
          if (u.avatar_url) amap[u.display_name] = u.avatar_url
          umap[u.display_name] = {
            displayName: u.display_name,
            avatarUrl: u.avatar_url ?? null,
            slackUserId: u.slack_user_id ?? null,
          }
          if (u.slack_user_id) {
            byId[u.slack_user_id] = {
              displayName: u.display_name,
              avatarUrl: u.avatar_url ?? null,
            }
          }
        }
        setAvatarMap(amap)
        setUserInfoMap(umap)
        setUserBySlackId(byId)
        console.log(`[fetchAvatars] users loaded: ${data.length} (slackId-keyed: ${Object.keys(byId).length})`)
      }
    }
    fetchAvatars()
  }, [])

  // チャンネル一覧を取得（Slack と Supabase を同期してから表示）
  useEffect(() => {
    const fetchChannels = async () => {
      setLoading(true)

      let data: Channel[] | null = null
      try {
        const res = await fetch('/api/slack/sync-channels', { method: 'POST' })
        const json = await res.json()
        console.log('[fetchChannels] sync result:', res.status, 'inserted:', json.inserted, 'deleted:', json.deleted, 'channels:', json.data?.length ?? 0, json.error ?? '')
        if (res.ok && Array.isArray(json.data) && json.data.length > 0) {
          data = json.data
        } else if (!res.ok) {
          console.warn('[fetchChannels] sync returned error:', json.error)
        }
      } catch (e) {
        console.warn('[fetchChannels] sync threw, fallback to Supabase:', e)
      }

      if (!data) {
        console.log('[fetchChannels] falling back to Supabase direct fetch')
        const { data: fallback, error } = await supabase
          .from('channels')
          .select('*')
          .order('name')
        if (error) {
          setError('チャンネルの読み込みに失敗しました')
          setLoading(false)
          return
        }
        data = fallback
      }

      if (data && data.length > 0) {
        const visible = data.filter((c) => !c.is_hidden)
        setChannels(visible)
        const channelParam = searchParams.get('channel')
        const initial = channelParam
          ? (visible.find((c) => c.name === channelParam) ?? visible[0])
          : visible[0]
        setSelectedChannel(initial ?? null)
      }
      setLoading(false)
    }

    fetchChannels()

    const channelsRealtime = supabase
      .channel('channels-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'channels' },
        (payload) => {
          const newChannel = payload.new as Channel
          if (newChannel.is_hidden) return
          setChannels((prev) => [...prev, newChannel].sort((a, b) => a.name.localeCompare(b.name, 'ja')))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'channels' },
        (payload) => {
          const updated = payload.new as Channel
          if (updated.is_hidden) {
            setChannels((prev) => prev.filter((c) => c.id !== updated.id))
            setSelectedChannel((cur) => (cur?.id === updated.id ? null : cur))
          } else {
            setChannels((prev) => {
              const exists = prev.some((c) => c.id === updated.id)
              const next = exists
                ? prev.map((c) => (c.id === updated.id ? updated : c))
                : [...prev, updated]
              return next.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
            })
            setSelectedChannel((cur) => (cur?.id === updated.id ? updated : cur))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'channels' },
        (payload) => {
          const deleted = payload.old as { id: string }
          setChannels((prev) => prev.filter((c) => c.id !== deleted.id))
          setSelectedChannel((cur) => {
            if (cur?.id !== deleted.id) return cur
            return null
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channelsRealtime) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 選択チャンネルのメッセージを取得 + リアルタイム購読
  useEffect(() => {
    if (!selectedChannel) return

    let isMounted = true
    setMessages([])
    setHasMore(false)
    setReactionsMap({})

    const fetchMessages = async () => {
      console.log(`[fetchMessages] channel: "${selectedChannel.name}" id: ${selectedChannel.id}`)

      // ① メッセージを先に取得（最新300件）
      const messagesResult = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', selectedChannel.id)
        .order('created_at', { ascending: false })
        .limit(300)

      console.log(`[fetchMessages] messages: count=${messagesResult.data?.length ?? 0} error=${messagesResult.error?.message ?? 'none'}`)

      if (!messagesResult.error && messagesResult.data && isMounted) {
        setMessages(messagesResult.data.reverse())
        setHasMore(messagesResult.data.length === 300)
      }

      // ② リアクションを取得: 取得したメッセージの最古 created_at 以降に絞り、
      //    message_created_at DESC + 高めの limit で新しい行が切れ落ちないようにする
      //    (デフォルトの 1000 行制限・id 昇順で古い側が返ってしまう問題を回避)
      let oldestMessageCreatedAt: string | null = null
      if (messagesResult.data && messagesResult.data.length > 0) {
        oldestMessageCreatedAt = messagesResult.data
          .map((m) => m.created_at)
          .reduce((a, b) => (a < b ? a : b))
      }

      let reactionsQuery = supabase
        .from('message_reactions')
        .select('message_created_at, reaction, user_name')
        .eq('channel_id', selectedChannel.id)
        .order('message_created_at', { ascending: false })
        .limit(10000)
      if (oldestMessageCreatedAt) {
        reactionsQuery = reactionsQuery.gte('message_created_at', oldestMessageCreatedAt)
      }
      const reactionsResult = await reactionsQuery

      console.log(`[fetchMessages] reactions: count=${reactionsResult.data?.length ?? 0} error=${reactionsResult.error?.message ?? 'none'} oldestBound=${oldestMessageCreatedAt ?? 'null'}`)

      if (!reactionsResult.error && reactionsResult.data && isMounted) {
        const counts: Record<string, Record<string, { count: number; users: string[] }>> = {}
        for (const r of reactionsResult.data) {
          const key = tsKey(r.message_created_at)
          counts[key] ??= {}
          counts[key][r.reaction] ??= { count: 0, users: [] }
          counts[key][r.reaction].count++
          if (r.user_name) counts[key][r.reaction].users.push(r.user_name)
        }
        const map: ReactionsMap = {}
        for (const [key, reactions] of Object.entries(counts)) {
          map[key] = Object.entries(reactions)
            .map(([reaction, { count, users }]) => ({ reaction, count, users }))
            .sort((a, b) => b.count - a.count)
        }
        setReactionsMap(map)

        // ③ 診断: 最新メッセージ3件のtsKeyと、その範囲のリアクションtsKey一致を確認
        if (messagesResult.data && messagesResult.data.length > 0) {
          const latest = messagesResult.data.slice(0, 3)
          const reactionKeys = new Set(reactionsResult.data.map((r) => tsKey(r.message_created_at)))
          console.log('[diag] latest 3 messages → reaction key match:',
            latest.map((m) => ({
              msgCreatedAt: m.created_at,
              msgKey: tsKey(m.created_at),
              hasReactionsInMap: reactionKeys.has(tsKey(m.created_at)),
            }))
          )
          console.log(`[diag] total reaction keys in map: ${Object.keys(map).length}`)
        }
      }
    }

    fetchMessages()

    const messagesChannel = supabase
      .channel(`room:${selectedChannel.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${selectedChannel.id}`,
        },
        (payload) => {
          if (isMounted) {
            setMessages((prev) => {
              const exists = prev.some((m) => m.id === (payload.new as Message).id)
              if (exists) return prev
              return [...prev, payload.new as Message]
            })
          }
        }
      )
      .subscribe()

    const reactionsChannel = supabase
      .channel(`reactions:${selectedChannel.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
          filter: `channel_id=eq.${selectedChannel.id}`,
        },
        (payload) => {
          if (!isMounted) return
          const { message_created_at, reaction, user_name } = payload.new as {
            message_created_at: string
            reaction: string
            user_name: string
          }
          const key = tsKey(message_created_at)
          console.log('[realtime] reaction INSERT', {
            message_created_at,
            reaction,
            user_name,
            tsKey: key,
          })
          setReactionsMap((prev) => {
            const hadKey = key in prev
            const msgReactions = [...(prev[key] ?? [])]
            const idx = msgReactions.findIndex((r) => r.reaction === reaction)
            if (idx >= 0) {
              const r = msgReactions[idx]
              if (r.users.includes(user_name)) return prev
              msgReactions[idx] = { ...r, count: r.count + 1, users: [...r.users, user_name] }
            } else {
              msgReactions.push({ reaction, count: 1, users: user_name ? [user_name] : [] })
            }
            console.log('[realtime] reaction INSERT applied', { key, hadKey, newCount: msgReactions.find((r) => r.reaction === reaction)?.count })
            return { ...prev, [key]: msgReactions }
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
          filter: `channel_id=eq.${selectedChannel.id}`,
        },
        (payload) => {
          if (!isMounted) return
          console.log('[realtime] reaction DELETE payload.old:', payload.old)
          const old = payload.old as Partial<{
            message_created_at: string
            reaction: string
            user_name: string
          }>
          if (!old?.message_created_at || !old.reaction) return
          const key = tsKey(old.message_created_at)
          setReactionsMap((prev) => {
            const msgReactions = [...(prev[key] ?? [])]
            const idx = msgReactions.findIndex((r) => r.reaction === old.reaction)
            if (idx < 0) return prev
            const r = msgReactions[idx]
            const newUsers = old.user_name ? r.users.filter((u) => u !== old.user_name) : r.users
            const newCount = Math.max(0, r.count - 1)
            if (newCount === 0) {
              msgReactions.splice(idx, 1)
            } else {
              msgReactions[idx] = { ...r, count: newCount, users: newUsers }
            }
            const next = { ...prev }
            if (msgReactions.length === 0) {
              delete next[key]
            } else {
              next[key] = msgReactions
            }
            return next
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_reactions',
          filter: `channel_id=eq.${selectedChannel.id}`,
        },
        (payload) => {
          if (!isMounted) return
          const oldRow = payload.old as Partial<{
            message_created_at: string
            reaction: string
            user_name: string
          }>
          const newRow = payload.new as {
            message_created_at: string
            reaction: string
            user_name: string
          }
          setReactionsMap((prev) => {
            const next = { ...prev }
            // remove old
            if (oldRow?.message_created_at && oldRow.reaction) {
              const oldKey = tsKey(oldRow.message_created_at)
              const list = [...(next[oldKey] ?? [])]
              const i = list.findIndex((r) => r.reaction === oldRow.reaction)
              if (i >= 0) {
                const r = list[i]
                const users = oldRow.user_name ? r.users.filter((u) => u !== oldRow.user_name) : r.users
                const cnt = Math.max(0, r.count - 1)
                if (cnt === 0) list.splice(i, 1)
                else list[i] = { ...r, count: cnt, users }
                if (list.length === 0) delete next[oldKey]
                else next[oldKey] = list
              }
            }
            // add new
            const newKey = tsKey(newRow.message_created_at)
            const list = [...(next[newKey] ?? [])]
            const i = list.findIndex((r) => r.reaction === newRow.reaction)
            if (i >= 0) {
              const r = list[i]
              if (!r.users.includes(newRow.user_name)) {
                list[i] = { ...r, count: r.count + 1, users: [...r.users, newRow.user_name] }
              }
            } else {
              list.push({ reaction: newRow.reaction, count: 1, users: newRow.user_name ? [newRow.user_name] : [] })
            }
            next[newKey] = list
            return next
          })
        }
      )
      .subscribe((status, err) => {
        console.log(`[realtime] reactions subscription status: ${status}`, err ?? '')
      })

    return () => {
      isMounted = false
      supabase.removeChannel(messagesChannel)
      supabase.removeChannel(reactionsChannel)
    }
  }, [selectedChannel])

  const handleLoadMore = useCallback(async () => {
    if (!selectedChannel || loadingMoreRef.current || messages.length === 0) return
    loadingMoreRef.current = true

    const oldest = messages[0].created_at
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('channel_id', selectedChannel.id)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(500)

    if (!error && data) {
      setMessages((prev) => [...data.reverse(), ...prev])
      setHasMore(data.length === 500)
    }
    loadingMoreRef.current = false
  }, [selectedChannel, messages])

  const handleSendMessage = useCallback(
    async (content: string, threadTs?: string) => {
      if (!selectedChannel || !userName) return

      const insertPayload: Record<string, unknown> = {
        channel_id: selectedChannel.id,
        user_name: userName,
        content: content,
      }
      if (threadTs) insertPayload.thread_ts = threadTs

      const { error } = await supabase.from('messages').insert(insertPayload)

      if (error) {
        console.error('メッセージ送信エラー:', error)
        throw error
      }

      fetch('/api/slack/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelName: selectedChannel.name,
          userName,
          content,
          avatarUrl: slackUser?.avatar_url ?? '',
          threadTs: threadTs ?? null,
        }),
      }).catch((err) => console.warn('Slack post failed:', err))
    },
    [selectedChannel, userName, slackUser]
  )

  const handleEditMessage = useCallback((msgId: string, newContent: string) => {
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: newContent } : m))
  }, [])

  const handleDeleteMessage = useCallback((msgId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId))
  }, [])

  const handleAddReaction = useCallback(
    async (msg: Message, reaction: string) => {
      if (!userName || !selectedChannel) return

      const key = tsKey(msg.created_at)
      setReactionsMap((prev) => {
        const msgReactions = [...(prev[key] ?? [])]
        const idx = msgReactions.findIndex((r) => r.reaction === reaction)
        if (idx >= 0) {
          const r = msgReactions[idx]
          const userIdx = r.users.indexOf(userName)
          if (userIdx >= 0) {
            const newUsers = r.users.filter((u) => u !== userName)
            if (newUsers.length === 0) {
              msgReactions.splice(idx, 1)
            } else {
              msgReactions[idx] = { ...r, count: r.count - 1, users: newUsers }
            }
          } else {
            msgReactions[idx] = { ...r, count: r.count + 1, users: [...r.users, userName] }
          }
        } else {
          msgReactions.push({ reaction, count: 1, users: [userName] })
        }
        const next = { ...prev }
        if (msgReactions.length === 0) delete next[key]
        else next[key] = msgReactions
        return next
      })

      fetch('/api/slack/reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: selectedChannel.id,
          channelName: selectedChannel.name,
          messageCreatedAt: msg.created_at,
          reaction,
          userName,
        }),
      }).catch((err) => console.warn('reaction failed:', err))
    },
    [userName, selectedChannel]
  )

  const handleSetUserName = (name: string) => {
    setUserName(name)
    localStorage.setItem(USER_NAME_KEY, name)
    setShowUserNameDialog(false)
  }

  const handleSelectChannel = (channel: Channel) => {
    setSelectedChannel(channel)
    setSidebarOpen(false)
    router.replace(`/chat?channel=${encodeURIComponent(channel.name)}`)
  }

  const handleSelectChannelByName = (name: string) => {
    const ch = channels.find((c) => c.name === name)
    if (ch) handleSelectChannel(ch)
  }

  const channelMap = Object.fromEntries(channels.map((c) => [c.id, c.name]))

  const handleUserNameClick = () => {
    if (slackUser) {
      if (confirm('ログアウトしますか？')) {
        localStorage.removeItem(SLACK_USER_KEY)
        localStorage.removeItem(USER_NAME_KEY)
        setSlackUser(null)
        setUserName('')
        setShowUserNameDialog(true)
      }
    } else {
      setShowUserNameDialog(true)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#f7faf2]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#279300]/30 border-t-[#279300] rounded-full animate-spin mx-auto mb-4" />
          <div className="text-gray-500 text-sm">読み込み中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden bg-[#f7faf2]">
      {showUserNameDialog && (
        <UserNameDialog
          onSubmit={handleSetUserName}
          currentChannel={selectedChannel?.name}
        />
      )}

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={`
          fixed md:relative inset-y-0 left-0 z-40 md:z-auto
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <Sidebar
          channels={channels}
          selectedChannel={selectedChannel}
          onSelectChannel={handleSelectChannel}
          userName={userName}
          slackUser={slackUser}
          onUserNameClick={handleUserNameClick}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white rounded-tl-xl overflow-hidden md:rounded-none">
        {error ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8">
              <div className="text-red-500 text-5xl mb-4">!</div>
              <p className="text-gray-700 font-medium">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-[#1f7a00] text-white rounded-lg hover:bg-[#145200] transition-colors text-sm"
              >
                再読み込み
              </button>
            </div>
          </div>
        ) : selectedChannel ? (
          <ChatArea
            channel={selectedChannel}
            messages={messages}
            onSendMessage={handleSendMessage}
            onMenuClick={() => setSidebarOpen(!sidebarOpen)}
            userName={userName}
            currentSlackUserId={slackUser?.slack_user_id ?? null}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
            reactionsMap={reactionsMap}
            avatarMap={avatarMap}
            userInfoMap={userInfoMap}
            userBySlackId={userBySlackId}
            customEmojis={customEmojis}
            channelMap={channelMap}
            onAddReaction={handleAddReaction}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onSelectChannelByName={handleSelectChannelByName}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={() => setSidebarOpen(true)}
              className="absolute top-4 left-4 md:hidden p-2 rounded-lg bg-gray-100"
            >
              <Menu size={20} className="text-gray-600" />
            </button>
            <div className="text-center text-gray-400">
              <p className="text-lg">チャンネルがありません</p>
              <p className="text-sm mt-1">Supabaseにチャンネルを追加してください</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
