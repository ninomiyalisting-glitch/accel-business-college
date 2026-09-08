'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function ErrorContent() {
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason') ?? 'unknown'

  const messages: Record<string, string> = {
    no_code: 'Slackから認証コードが取得できませんでした',
    token_error: 'アクセストークンの取得に失敗しました',
    invalid_code: '認証コードが無効です。もう一度お試しください',
    redirect_uri_mismatch: 'リダイレクトURIが一致しません（Slackアプリ設定を確認してください）',
    missing_env: 'サーバーの設定が不完全です（環境変数）',
    no_user_token: 'ユーザートークンが取得できませんでした',
    identity_error: 'ユーザー情報の取得に失敗しました',
    token_fetch_failed: 'Slackへの接続に失敗しました',
    identity_fetch_failed: 'Slackへの接続に失敗しました',
  }

  const message = messages[reason] ?? `不明なエラーが発生しました (${reason})`

  return (
    <div className="min-h-screen bg-[#0d3800] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-red-500 text-3xl">!</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">ログインエラー</h1>
        <p className="text-gray-600 mb-1">{message}</p>
        <p className="text-xs text-gray-400 mb-6 font-mono bg-gray-50 rounded px-2 py-1">{reason}</p>
        <a
          href="/"
          className="inline-block bg-accel-active hover:bg-accel-text text-white font-semibold py-3 px-8 rounded-xl transition-colors"
        >
          トップへ戻る
        </a>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d3800]" />}>
      <ErrorContent />
    </Suspense>
  )
}
