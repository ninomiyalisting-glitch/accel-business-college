'use client'

import { useState, FormEvent, useRef, useEffect } from 'react'
import { Send, X, CornerDownRight } from 'lucide-react'

interface ReplyContext {
  userName: string
  content: string
}

interface Props {
  onSubmit: (content: string) => Promise<void>
  channelName: string
  disabled?: boolean
  replyTo?: ReplyContext | null
  onCancelReply?: () => void
}

export default function MessageForm({ onSubmit, channelName, disabled, replyTo, onCancelReply }: Props) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // テキストエリアの高さを自動調整
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [content])

  // 返信モードになったら入力欄にフォーカス
  useEffect(() => {
    if (replyTo) textareaRef.current?.focus()
  }, [replyTo])

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = content.trim()
    if (!trimmed || sending || disabled) return

    setSending(true)
    try {
      await onSubmit(trimmed)
      setContent('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } finally {
      setSending(false)
    }
  }

  const placeholder = disabled
    ? '名前を設定してください'
    : replyTo
      ? `${replyTo.userName}さんへの返信...`
      : `#${channelName} にメッセージを送信`

  return (
    <div className="px-2 md:px-4 pb-4 pt-2">
      {replyTo && (
        <div className="flex items-start gap-2 mb-1.5 px-3 py-2 bg-accel-lightest border border-accel-light rounded-lg">
          <CornerDownRight size={14} className="text-accel-active mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-accel-active">
              {replyTo.userName} さんへの返信
            </div>
            <div className="text-xs text-gray-600 truncate mt-0.5">
              {replyTo.content || '(添付ファイル)'}
            </div>
          </div>
          <button
            onClick={onCancelReply}
            className="flex-shrink-0 p-1 rounded hover:bg-accel-lightest text-accel-active hover:text-accel-active"
            title="返信をキャンセル"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div
          className={`flex items-end gap-2.5 border-2 rounded-2xl px-4 py-3 bg-white transition-all duration-200 ${
            disabled
              ? 'border-gray-200 bg-gray-50'
              : replyTo
                ? 'border-accel-light focus-within:border-accel-primary focus-within:ring-2 focus-within:ring-accel-lightest'
                : 'border-gray-300 focus-within:border-accel-secondary focus-within:ring-2 focus-within:ring-accel-lightest'
          }`}
        >
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            disabled={disabled || sending}
            rows={1}
            className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 text-[17px] outline-none leading-relaxed min-h-[24px] max-h-[200px] overflow-y-auto disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!content.trim() || sending || disabled}
            title="送信"
            className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-150 ${
              content.trim() && !sending && !disabled
                ? 'bg-accel-primary hover:bg-accel-active text-white shadow-md hover:shadow-lg active:translate-y-px'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Send size={20} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2 px-1">
          ボタンをクリックして送信　<kbd className="font-mono">Shift+Enter</kbd> で改行
        </p>
      </form>
    </div>
  )
}
