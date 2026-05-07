'use client'

import { useState, FormEvent, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'

interface Props {
  onSubmit: (content: string) => Promise<void>
  channelName: string
  disabled?: boolean
}

export default function MessageForm({ onSubmit, channelName, disabled }: Props) {
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

  return (
    <div className="px-4 pb-4 pt-2">
      <form onSubmit={handleSubmit}>
        <div
          className={`flex items-end gap-2 border rounded-xl px-4 py-2.5 bg-white transition-all duration-200 ${
            disabled
              ? 'border-gray-200 bg-gray-50'
              : 'border-gray-300 focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100'
          }`}
        >
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={disabled ? '名前を設定してください' : `#${channelName} にメッセージを送信`}
            disabled={disabled || sending}
            rows={1}
            className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 text-[15px] outline-none leading-relaxed min-h-[24px] max-h-[200px] overflow-y-auto disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!content.trim() || sending || disabled}
            className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-200 ${
              content.trim() && !sending && !disabled
                ? 'bg-purple-700 hover:bg-purple-800 text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Send size={14} />
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5 px-1">
          ボタンをクリックして送信　<kbd className="font-mono">Shift+Enter</kbd> で改行
        </p>
      </form>
    </div>
  )
}
