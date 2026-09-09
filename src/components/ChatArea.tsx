'use client'

import { useState, useCallback, useEffect } from 'react'
import { Hash, Users, ArrowLeft } from 'lucide-react'
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
  /** スマホでチャンネル一覧に戻る */
  onBackToList: () => void
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
  onBackToList,
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

  // 共通ヘッダーの検索ボタンから開く。
  // ヘッダーは layout にあり props を渡せないためイベントで受ける。
  useEffect(() => {
    const open = () => setSearchOpen(true)
    window.addEventListener('abc:open-chat-search', open)
    return () => window.removeEventListener('abc:open-chat-search', open)
  }, [])
  const [replyTo, setReplyTo] = useState<Message | null>(null)

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
      {/* チャンネル名の帯（スマホのみ）。
          PC はサイドバーで現在のチャンネルが分かるので出さない。
          左端は「←」でチャンネル一覧へ戻る。Slack と同じ二画面の作り。
          AIナビと検索は共通ヘッダーに移した。 */}
      <div className="md:hidden flex items-center gap-2 px-2 bg-white border-b border-gray-200 h-14 flex-shrink-0">
        <button
          onClick={onBackToList}
          aria-label="チャンネル一覧に戻る"
          className="w-11 h-11 rounded-xl flex items-center justify-center text-accel-dark hover:bg-accel-lightest active:bg-accel-lightest transition-colors flex-shrink-0"
        >
          <ArrowLeft size={24} />
        </button>

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Hash size={18} className="text-accel-active flex-shrink-0" />
          <h1 className="font-bold text-accel-dark text-[17px] truncate">{channel.name}</h1>
        </div>

        {memberCount !== undefined && (
          <div className="flex items-center gap-1.5 text-sm text-gray-500 flex-shrink-0 pr-1">
            <Users size={16} />
            <span>{memberCount}</span>
          </div>
        )}
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
