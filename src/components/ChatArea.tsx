'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Hash, Menu, Users, Search, Sparkles } from 'lucide-react'
import { Channel, Message, ReactionsMap, CustomEmojis } from '@/types'
import { MemberInfo } from './MemberPopup'
import MessageList from './MessageList'
import MessageForm from './MessageForm'
import ChatSearch from './ChatSearch'

type AvatarMap = Record<string, string>
type UserInfoMap = Record<string, MemberInfo>
type UserBySlackId = Record<string, { displayName: string; avatarUrl: string | null }>

interface Props {
  channel: Channel
  messages: Message[]
  onSendMessage: (content: string, threadTs?: string) => Promise<void>
  onMenuClick: () => void
  userName: string
  currentSlackUserId?: string | null
  memberCount?: number
  hasMore?: boolean
  onLoadMore?: () => void
  reactionsMap?: ReactionsMap
  avatarMap?: AvatarMap
  userInfoMap?: UserInfoMap
  userBySlackId?: UserBySlackId
  customEmojis?: CustomEmojis
  channelMap?: Record<string, string>
  onAddReaction?: (msg: Message, reaction: string) => void
  onEditMessage?: (msgId: string, newContent: string) => void
  onDeleteMessage?: (msgId: string) => void
  onSelectChannelByName?: (name: string) => void
}

export default function ChatArea({
  channel,
  messages,
  onSendMessage,
  onMenuClick,
  userName,
  currentSlackUserId,
  memberCount,
  hasMore,
  onLoadMore,
  reactionsMap,
  avatarMap,
  userInfoMap,
  userBySlackId,
  customEmojis,
  channelMap,
  onAddReaction,
  onEditMessage,
  onDeleteMessage,
  onSelectChannelByName,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const router = useRouter()

  // チャンネル切り替え時に返信モード解除
  useEffect(() => {
    setReplyTo(null)
  }, [channel.id])

  const handleSubmitWithThread = useCallback(
    async (content: string) => {
      const threadTs = replyTo?.created_at
      await onSendMessage(content, threadTs)
      setReplyTo(null)
    },
    [onSendMessage, replyTo]
  )

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      {/* ヘッダー: モバイルはfixed固定、PCはstickyでレイアウト内に留まる */}
      <div className="fixed top-0 left-0 right-0 z-50 md:sticky md:left-auto md:right-auto md:z-10 flex items-center justify-between px-4 bg-[#1a1d23] h-14 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* モバイル用メニューボタン: 常時表示 */}
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors flex-shrink-0"
          >
            <Menu size={18} className="text-white" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <Hash size={18} className="text-white/60 flex-shrink-0" />
            <h1 className="font-bold text-white text-[15px] truncate">{channel.name}</h1>
          </div>

          {channel.description && (
            <>
              <div className="w-px h-5 bg-white/20 hidden sm:block flex-shrink-0" />
              <span className="text-sm text-white/50 hidden sm:block truncate max-w-xs">
                {channel.description}
              </span>
            </>
          )}
        </div>

        {/* 右側: AIナビ・検索ボタン・メンバー数 */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {memberCount !== undefined && (
            <div className="flex items-center gap-1.5 text-sm text-white/60 mr-2">
              <Users size={15} />
              <span>{memberCount}</span>
            </div>
          )}
          <button
            onClick={() => router.push('/ai-chat')}
            className="flex flex-col items-center justify-center gap-0.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            title="AIアシスタント"
          >
            <Sparkles size={16} />
            <span className="text-[9px] font-medium leading-none">AIナビ</span>
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            title="検索 (Ctrl+K)"
          >
            <Search size={16} />
            <span className="text-[9px] font-medium leading-none">検索</span>
          </button>
        </div>
      </div>

      {/* 検索パネル */}
      {searchOpen && (
        <ChatSearch
          channelMap={channelMap ?? {}}
          avatarMap={avatarMap ?? {}}
          onClose={() => setSearchOpen(false)}
          onSelectChannel={(name) => {
            onSelectChannelByName?.(name)
            setSearchOpen(false)
          }}
        />
      )}

      {/* モバイルのfixedヘッダー分のスペーサー（PCでは非表示） */}
      <div className="h-14 flex-shrink-0 md:hidden" aria-hidden="true" />

      {/* メッセージ一覧 */}
      <MessageList
        messages={messages}
        currentUserName={userName}
        currentSlackUserId={currentSlackUserId}
        channelName={channel.name}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        reactionsMap={reactionsMap}
        avatarMap={avatarMap}
        userInfoMap={userInfoMap}
        userBySlackId={userBySlackId}
        customEmojis={customEmojis}
        onAddReaction={onAddReaction}
        onEditMessage={onEditMessage}
        onDeleteMessage={onDeleteMessage}
        onReplyMessage={(msg) => setReplyTo(msg)}
        replyingToId={replyTo?.id ?? null}
      />

      {/* 入力フォーム */}
      <div className="flex-shrink-0 border-t border-gray-100">
        <MessageForm
          onSubmit={handleSubmitWithThread}
          channelName={channel.name}
          disabled={!userName}
          replyTo={replyTo ? { userName: replyTo.user_name, content: replyTo.content } : null}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>
    </div>
  )
}
