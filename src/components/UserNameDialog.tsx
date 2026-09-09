'use client'

import { useState, FormEvent } from 'react'

interface Props {
  onSubmit: (name: string) => void
  currentChannel?: string
}

export default function UserNameDialog({ onSubmit, currentChannel }: Props) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('名前を入力してください')
      return
    }
    if (trimmed.length > 20) {
      setError('名前は20文字以内で入力してください')
      return
    }
    onSubmit(trimmed)
  }

  const handleSlackLogin = () => {
    const params = currentChannel
      ? `?channel=${encodeURIComponent(currentChannel)}`
      : ''
    window.location.href = `/api/auth/slack${params}`
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* ロゴ・タイトル */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-accel-primary to-accel-text rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white font-bold text-2xl">A</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">アクセルビジネスカレッジ</h1>
          <p className="text-gray-500 mt-2 text-sm">コミュニティへようこそ</p>
        </div>

        {/* Slack ログイン */}
        <button
          type="button"
          onClick={handleSlackLogin}
          className="w-full flex items-center justify-center gap-3 bg-slack-brand hover:bg-slack-brandDark text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 shadow-md mb-6"
        >
          <svg width="20" height="20" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19.712 33.399c0 2.896-2.355 5.248-5.256 5.248-2.9 0-5.256-2.352-5.256-5.248 0-2.895 2.356-5.247 5.256-5.247h5.256v5.247z" fill="#E01E5A"/>
            <path d="M22.348 33.399c0-2.895 2.356-5.247 5.256-5.247 2.9 0 5.256 2.352 5.256 5.247v13.147c0 2.895-2.356 5.247-5.256 5.247-2.9 0-5.256-2.352-5.256-5.247V33.399z" fill="#E01E5A"/>
            <path d="M27.604 19.712c-2.9 0-5.256-2.352-5.256-5.248 0-2.895 2.356-5.247 5.256-5.247 2.9 0 5.256 2.352 5.256 5.247v5.248h-5.256z" fill="#36C5F0"/>
            <path d="M27.604 22.348c2.9 0 5.256 2.352 5.256 5.247 0 2.896-2.356 5.248-5.256 5.248H14.456c-2.9 0-5.256-2.352-5.256-5.248 0-2.895 2.356-5.247 5.256-5.247h13.148z" fill="#36C5F0"/>
            <path d="M41.291 27.595c0 2.896-2.355 5.248-5.256 5.248-2.9 0-5.256-2.352-5.256-5.248 0-2.895 2.356-5.247 5.256-5.247h5.256v5.247z" fill="#2EB67D"/>
            <path d="M38.655 27.595c0-2.895 2.356-5.247 5.256-5.247 2.9 0 5.256 2.352 5.256 5.247v13.148c0 2.895-2.356 5.247-5.256 5.247-2.9 0-5.256-2.352-5.256-5.247V27.595z" fill="#2EB67D"/>
            <path d="M43.911 13.908c2.9 0 5.256 2.352 5.256 5.247 0 2.896-2.356 5.248-5.256 5.248h-5.256v-5.248c0-2.895 2.356-5.247 5.256-5.247z" fill="#ECB22E"/>
            <path d="M43.911 11.272c-2.9 0-5.256-2.352-5.256-5.247 0-2.896 2.356-5.248 5.256-5.248 2.9 0 5.256 2.352 5.256 5.248v13.147c0 2.895-2.356 5.247-5.256 5.247-2.9 0-5.256-2.352-5.256-5.247V11.272z" fill="#ECB22E"/>
          </svg>
          Slackでログイン
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="px-3 bg-white text-xs text-gray-400">または</span>
          </div>
        </div>

        {/* 手動入力 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              表示名を入力して参加
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder="例: 田中 太郎"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accel-primary focus:border-transparent transition"
              autoFocus
              maxLength={20}
            />
            {error && (
              <p className="mt-2 text-sm text-red-500">{error}</p>
            )}
          </div>
          <button
            type="submit"
            className="btn-primary w-full"
          >
            参加する
          </button>
        </form>
      </div>
    </div>
  )
}
