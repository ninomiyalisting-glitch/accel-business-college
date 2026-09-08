'use client'

import Image from 'next/image'
import Link from 'next/link'
import { MessageSquare, Video, Users, ArrowRight } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Image src="/icon-192x192.png" alt="ロゴ" width={32} height={32} className="rounded-lg" />
          <span className="font-bold text-gray-900 text-[15px] hidden sm:block">アクセルビジネスカレッジ</span>
        </div>
        <a
          href="/api/auth/slack"
          className="flex items-center gap-2 px-4 py-2 bg-[#1f7a00] text-white text-sm font-medium rounded-lg hover:bg-[#145200] transition-colors"
        >
          Slackでログイン
        </a>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-8">
          <Image
            src="/icon-192x192.png"
            alt="アクセルビジネスカレッジ"
            width={96}
            height={96}
            className="rounded-2xl shadow-lg mx-auto"
          />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4 leading-tight">
          アクセルビジネスカレッジ
        </h1>
        <p className="text-xl sm:text-2xl text-[#1f7a00] font-medium mb-6">
          中小企業診断士として生きていく
        </p>
        <p className="text-gray-500 text-base max-w-md mb-10 leading-relaxed">
          中小企業の成長支援を通して1ミリでも日本社会に貢献したい。そのために企業と診断士を適切に繋げ、診断士の価値向上を目指すクローズコミュニティです。
        </p>
        <a
          href="/api/auth/slack"
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#1f7a00] text-white font-semibold rounded-xl hover:bg-[#145200] transition-colors shadow-md hover:shadow-lg text-base"
        >
          <svg viewBox="0 0 54 54" className="w-5 h-5" fill="currentColor">
            <path d="M19.712.133a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386h5.376V5.52A5.381 5.381 0 0 0 19.712.133m0 14.365H5.376A5.381 5.381 0 0 0 0 19.884a5.381 5.381 0 0 0 5.376 5.387h14.336a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386" />
            <path d="M53.76 19.884a5.381 5.381 0 0 0-5.376-5.386 5.381 5.381 0 0 0-5.376 5.386v5.387h5.376a5.381 5.381 0 0 0 5.376-5.387m-14.336 0V5.52A5.381 5.381 0 0 0 34.048.133a5.381 5.381 0 0 0-5.376 5.387v14.364a5.381 5.381 0 0 0 5.376 5.387 5.381 5.381 0 0 0 5.376-5.387" />
            <path d="M34.048 54a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386h-5.376v5.386A5.381 5.381 0 0 0 34.048 54m0-14.365h14.336a5.381 5.381 0 0 0 5.376-5.386 5.381 5.381 0 0 0-5.376-5.387H34.048a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386" />
            <path d="M0 34.249a5.381 5.381 0 0 0 5.376 5.386 5.381 5.381 0 0 0 5.376-5.386v-5.387H5.376A5.381 5.381 0 0 0 0 34.249m14.336 0v14.364A5.381 5.381 0 0 0 19.712 54a5.381 5.381 0 0 0 5.376-5.387V34.249a5.381 5.381 0 0 0-5.376-5.387 5.381 5.381 0 0 0-5.376 5.387" />
          </svg>
          Slackアカウントでログイン
        </a>
        <p className="mt-4 text-gray-400 text-sm">
          アクセルビジネスカレッジのSlackメンバーのみ利用できます
        </p>
      </main>

      {/* Features */}
      <section className="bg-[#f7faf2] py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900 text-center mb-10">主な機能</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
              <div className="w-12 h-12 bg-[#e8f5c9] rounded-xl flex items-center justify-center mx-auto mb-4">
                <MessageSquare size={22} className="text-[#1f7a00]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">チャット</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Slackのメッセージをリアルタイムで閲覧。スレッドやリアクションも表示。
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
              <div className="w-12 h-12 bg-[#e8f5c9] rounded-xl flex items-center justify-center mx-auto mb-4">
                <Video size={22} className="text-[#1f7a00]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">動画ライブラリ</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                勉強会の録画をいつでも視聴。フォルダ・タグで簡単に検索。
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
              <div className="w-12 h-12 bg-[#e8f5c9] rounded-xl flex items-center justify-center mx-auto mb-4">
                <Users size={22} className="text-[#1f7a00]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">コミュニティ</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                メンバー同士の知見を共有。過去の学びを永久保存。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-6 px-6 text-center">
        <p className="text-gray-400 text-sm">
          © {new Date().getFullYear()} アクセルビジネスカレッジ
        </p>
      </footer>
    </div>
  )
}
