'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MapPin, Building2, MessageCircle, Pencil, Briefcase, Star, FileText, Clock, Lightbulb, Hash, MessageSquare } from 'lucide-react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import PracticePoints from '@/components/PracticePoints'

const SLACK_TEAM_ID = 'T058E88UB40'
const SLACK_USER_KEY = 'abc_slackUser'

interface DBUser {
  slack_user_id: string
  display_name: string
  avatar_url: string | null
}

interface RecentMessage {
  id: string
  channel_id: string
  content: string
  created_at: string
  files_json: { thumb_360?: string; url_private?: string; mimetype?: string }[] | null
}

interface MemberProfile {
  slack_user_id: string
  prefecture: string | null
  organization: string | null
  headline: string | null
  sub_headline: string | null
  expertise: string | null
  achievements: string | null
  bio: string | null
  availability: string | null
  appeal: string | null
}

function getAvatarColor(name: string): string {
  const colors = [
    'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500',
    'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500',
    'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500',
    'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

/**
 * プロフィールの各項目。
 * 白地に h2 の見出しと本文だけ。枠や影は付けない。
 * 項目ごとにカードで囲むと、数が増えたときに区切りが目立ちすぎる。
 */
function Section({ icon, label, content }: { icon: React.ReactNode; label: string; content: string }) {
  return (
    <section className="py-7 border-t border-gray-100 first:border-t-0">
      <h2 className="flex items-center gap-2 text-xl font-bold text-accel-dark mb-3">
        <span className="text-accel-active">{icon}</span>
        {label}
      </h2>
      <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{content}</p>
    </section>
  )
}

export default function MemberDetailPage({ params }: { params: Promise<{ slack_user_id: string }> }) {
  const { slack_user_id } = use(params)
  const router = useRouter()

  const [user, setUser] = useState<DBUser | null>(null)
  const [profile, setProfile] = useState<MemberProfile | null>(null)
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([])
  const [channelMap, setChannelMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [avatarError, setAvatarError] = useState(false)
  const [mySlackUserId, setMySlackUserId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SLACK_USER_KEY)
      if (saved) setMySlackUserId(JSON.parse(saved).slack_user_id ?? null)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const load = async () => {
      const [userRes, profileRes] = await Promise.all([
        supabase.from('users').select('slack_user_id, display_name, avatar_url').eq('slack_user_id', slack_user_id).maybeSingle(),
        supabase.from('member_profiles').select('*').eq('slack_user_id', slack_user_id).maybeSingle(),
      ])
      if (!userRes.data) { router.push('/members'); return }
      const u = userRes.data as DBUser
      setUser(u)
      setProfile(profileRes.data as MemberProfile | null)

      // Fetch recent messages by display_name
      const [msgsRes, channelsRes] = await Promise.all([
        supabase
          .from('messages')
          .select('id, channel_id, content, created_at, files_json')
          .eq('user_name', u.display_name)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('channels').select('id, name'),
      ])

      setRecentMessages((msgsRes.data ?? []) as RecentMessage[])
      const cmap: Record<string, string> = {}
      for (const c of channelsRes.data ?? []) cmap[c.id] = c.name
      setChannelMap(cmap)

      setLoading(false)
    }
    load()
  }, [slack_user_id, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7faf2] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#279300]/30 border-t-[#279300] rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return null

  const isOwnProfile = mySlackUserId === slack_user_id

  const handleSlackDM = () => {
    // Opens DM in Slack web/desktop app (works on PC and mobile)
    window.open(
      `https://app.slack.com/client/${SLACK_TEAM_ID}/${slack_user_id}`,
      '_blank'
    )
  }

  return (
    <div className="min-h-screen bg-[#f7faf2]">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-content mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/members" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm hidden sm:inline">メンバー一覧</span>
          </Link>
          <div className="w-px h-5 bg-gray-200" />
          <span className="font-bold text-gray-900 text-[17px] truncate">{user.display_name}</span>
          {isOwnProfile && (
            <Link
              href="/members/edit"
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#1f7a00] hover:bg-[#145200] text-white rounded-lg text-xs font-medium transition-colors"
            >
              <Pencil size={12} />
              プロフィールを編集
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-content mx-auto px-4 pt-6 pb-bottom-nav">
        {/* 冒頭。文章を左、写真を右に置く。
            写真は 1 枚しかないので、大きく出して人物が分かるようにする。 */}
        <div className="flex flex-col-reverse sm:flex-row items-start gap-6 sm:gap-10 pb-7">
          <div className="flex-1 min-w-0 w-full">
            <h1 className="text-3xl font-bold text-accel-dark">{user.display_name}</h1>

            <div className="flex flex-wrap gap-3 mt-3">
              {profile?.prefecture && (
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <MapPin size={14} className="text-gray-400" />
                  {profile.prefecture}
                </span>
              )}
              {profile?.organization && (
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <Building2 size={14} className="text-gray-400" />
                  {profile.organization}
                </span>
              )}
            </div>

            {profile?.headline && (
              <p className="mt-3 text-base font-semibold text-gray-800">{profile.headline}</p>
            )}
            {profile?.sub_headline && (
              <p className="mt-1 text-sm text-gray-500">{profile.sub_headline}</p>
            )}

            {!profile && (
              <p className="mt-3 text-gray-400">プロフィールはまだ入力されていません。</p>
            )}

            <button
              onClick={handleSlackDM}
              className="btn-secondary mt-5"
            >
              <MessageCircle size={18} />
              Slack でメッセージ
            </button>
          </div>

          {/* 写真。文章の右。スマホでは上に回る（flex-col-reverse） */}
          <div className="w-full sm:w-64 md:w-72 flex-shrink-0">
            {user.avatar_url && !avatarError ? (
              // next/image を使わない。未登録ドメインが混ざると
              // 例外でページ全体が落ちるため
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => setAvatarError(true)}
                className="w-full aspect-square object-cover rounded-3xl bg-accel-lightest/50"
              />
            ) : (
              <div className={`w-full aspect-square rounded-3xl flex items-center justify-center text-white font-bold text-6xl ${getAvatarColor(user.display_name)}`}>
                {user.display_name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Profile sections */}
        {profile?.expertise && (
          <Section icon={<Briefcase size={20} />} label="得意分野" content={profile.expertise} />
        )}
        {profile?.achievements && (
          <Section icon={<Star size={20} />} label="実績" content={profile.achievements} />
        )}
        {profile?.bio && (
          <Section icon={<FileText size={20} />} label="詳細紹介" content={profile.bio} />
        )}
        {profile?.availability && (
          <Section icon={<Clock size={20} />} label="仕事の稼働について" content={profile.availability} />
        )}
        {profile?.appeal && (
          <Section icon={<Lightbulb size={20} />} label="その他アピールポイント" content={profile.appeal} />
        )}

        {isOwnProfile && !profile && (
          <div className="bg-white rounded-2xl border border-dashed border-[#279300]/30 p-8 text-center">
            <p className="text-gray-500 text-sm mb-4">プロフィールを充実させてメンバーに自己紹介しましょう</p>
            <Link
              href="/members/edit"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1f7a00] hover:bg-[#145200] text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Pencil size={14} />
              プロフィールを入力する
            </Link>
          </div>
        )}

        <PracticePoints slackUserId={slack_user_id} />

        {/* Recent posts */}
        <div className="border-t border-gray-100 pt-7">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare size={20} className="text-accel-active" />
            <h2 className="text-xl font-bold text-accel-dark">最近の投稿</h2>
            {recentMessages.length > 0 && (
              <span className="ml-auto text-xs text-gray-400">{recentMessages.length}件</span>
            )}
          </div>

          {recentMessages.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">
              まだ投稿がありません
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {recentMessages.map((msg) => {
                const channelName = channelMap[msg.channel_id]
                const thumbFile = msg.files_json?.find(
                  (f) => f.mimetype?.startsWith('image/') && (f.thumb_360 || f.url_private)
                )
                const thumbUrl = thumbFile
                  ? `/api/slack/image-proxy?url=${encodeURIComponent(thumbFile.thumb_360 ?? thumbFile.url_private ?? '')}`
                  : null

                return (
                  <li key={msg.id}>
                    <Link
                      href={channelName ? `/chat?channel=${encodeURIComponent(channelName)}` : '/chat'}
                      className="flex gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {channelName && (
                            <span className="flex items-center gap-0.5 text-xs text-gray-400 shrink-0">
                              <Hash size={10} />
                              {channelName}
                            </span>
                          )}
                          <span className="text-xs text-gray-400 ml-auto shrink-0">
                            {format(new Date(msg.created_at), 'M/d HH:mm', { locale: ja })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 line-clamp-2 leading-relaxed">
                          {msg.content || '(添付ファイル)'}
                        </p>
                      </div>
                      {thumbUrl && (
                        <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={thumbUrl}
                            alt="添付画像"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
