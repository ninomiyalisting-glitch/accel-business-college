'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Users, Pencil, MapPin, Building2, ArrowUpDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const SLACK_USER_KEY = 'abc_slackUser'
const SORT_KEY = 'abc_memberSort'

type SortOrder = 'activity' | 'latest' | 'alpha' | 'profile'

const SORT_LABELS: Record<SortOrder, string> = {
  activity: '投稿が多い順',
  latest: '最終投稿が新しい順',
  alpha: '名前順',
  profile: 'プロフィール充実度順',
}

interface DBUser {
  slack_user_id: string | null
  display_name: string
  avatar_url: string | null
}

interface MemberProfile {
  slack_user_id: string
  prefecture: string | null
  organization: string | null
  headline: string | null
  [key: string]: unknown  // future columns auto-included in search
}

interface MessageStats {
  count: number
  lastPost: string
}

type ProfileMap = Record<string, MemberProfile>
// Keyed by slack_user_id (primary) or user_name (fallback)
type StatsMap = Record<string, MessageStats>

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

function MemberCard({ user, profile, stats }: { user: DBUser; profile?: MemberProfile; stats?: MessageStats }) {
  const [avatarError, setAvatarError] = useState(false)
  const href = user.slack_user_id ? `/members/${user.slack_user_id}` : null

  const inner = (
    <>
      {user.avatar_url && !avatarError ? (
        <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
          <Image
            src={user.avatar_url}
            alt={user.display_name}
            width={56}
            height={56}
            className="w-full h-full object-cover"
            onError={() => setAvatarError(true)}
          />
        </div>
      ) : (
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${getAvatarColor(user.display_name)}`}>
          {user.display_name.charAt(0).toUpperCase()}
        </div>
      )}
      <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug w-full text-center">{user.display_name}</p>
      {(profile?.prefecture || profile?.organization) && (
        <div className="w-full space-y-0.5">
          {profile.organization && (
            <p className="text-[10px] text-gray-500 line-clamp-1 text-center leading-tight">{profile.organization}</p>
          )}
          {profile.prefecture && (
            <p className="text-[10px] text-gray-400 line-clamp-1 text-center leading-tight">{profile.prefecture}</p>
          )}
        </div>
      )}
      {profile?.headline && (
        <p className="text-[10px] text-[#1f7a00] line-clamp-1 text-center leading-tight w-full italic">{profile.headline}</p>
      )}
      {stats && stats.count > 0 && (
        <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full leading-tight">
          投稿 {stats.count}件
        </span>
      )}
    </>
  )

  const cls = "bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col items-center gap-1.5 hover:shadow-md hover:border-[#279300]/20 transition-all active:scale-95 text-center"

  return href ? (
    <Link href={href} className={cls}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

export default function MembersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<DBUser[]>([])
  const [profileMap, setProfileMap] = useState<ProfileMap>({})
  const [statsMap, setStatsMap] = useState<StatsMap>({})
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [mySlackUserId, setMySlackUserId] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<SortOrder>('profile')
  const [showSortMenu, setShowSortMenu] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SLACK_USER_KEY)
      if (saved) {
        const u = JSON.parse(saved)
        setMySlackUserId(u.slack_user_id ?? null)
      }
    } catch { /* ignore */ }
    try {
      const savedSort = localStorage.getItem(SORT_KEY) as SortOrder | null
      if (savedSort && savedSort in SORT_LABELS) setSortOrder(savedSort)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const load = async () => {
      const [usersRes, profilesRes, activityRes, latestRes] = await Promise.all([
        supabase.from('users').select('slack_user_id, display_name, avatar_url').order('display_name'),
        supabase.from('member_profiles').select('*'),
        supabase.from('messages').select('slack_user_id, user_name'),
        supabase.from('messages').select('slack_user_id, user_name, created_at').order('created_at', { ascending: false }).limit(10000),
      ])

      setUsers((usersRes.data as DBUser[]) ?? [])

      const pmap: ProfileMap = {}
      for (const p of (profilesRes.data ?? []) as MemberProfile[]) {
        pmap[p.slack_user_id] = p
      }
      setProfileMap(pmap)

      // Build stats keyed by slack_user_id (preferred) with user_name fallback
      const smapById: StatsMap = {}
      const smapByName: StatsMap = {}
      for (const row of activityRes.data ?? []) {
        const key = row.slack_user_id as string | null
        if (key) {
          if (!smapById[key]) smapById[key] = { count: 0, lastPost: '' }
          smapById[key].count++
        }
        const name = row.user_name as string
        if (name) {
          if (!smapByName[name]) smapByName[name] = { count: 0, lastPost: '' }
          smapByName[name].count++
        }
      }
      const seenId = new Set<string>()
      const seenName = new Set<string>()
      for (const row of latestRes.data ?? []) {
        const key = row.slack_user_id as string | null
        const name = row.user_name as string
        if (key && !seenId.has(key)) {
          seenId.add(key)
          if (!smapById[key]) smapById[key] = { count: 0, lastPost: row.created_at }
          else smapById[key].lastPost = row.created_at
        }
        if (name && !seenName.has(name)) {
          seenName.add(name)
          if (!smapByName[name]) smapByName[name] = { count: 0, lastPost: row.created_at }
          else smapByName[name].lastPost = row.created_at
        }
      }
      // Merge: prefer by-id stats, fall back to by-name
      const smap: StatsMap = { ...smapByName }
      for (const [id, stats] of Object.entries(smapById)) {
        smap[id] = stats
      }
      setStatsMap(smap)

      setLoading(false)
    }
    load()
  }, [])

  const handleSortChange = (order: SortOrder) => {
    setSortOrder(order)
    setShowSortMenu(false)
    try { localStorage.setItem(SORT_KEY, order) } catch { /* ignore */ }
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return users
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (u.display_name.toLowerCase().includes(q)) return true
      const p = u.slack_user_id ? profileMap[u.slack_user_id] : undefined
      if (!p) return false
      // Dynamically search all string columns (current and future)
      return Object.values(p).some(
        (v) => typeof v === 'string' && v.toLowerCase().includes(q)
      )
    })
  }, [users, query, profileMap])

  const getStats = (user: DBUser): MessageStats | undefined => {
    if (user.slack_user_id && statsMap[user.slack_user_id]) return statsMap[user.slack_user_id]
    return statsMap[user.display_name]
  }

  const countProfileFields = (profile: MemberProfile | undefined): number => {
    if (!profile) return 0
    return Object.entries(profile).filter(
      ([key, val]) => key !== 'slack_user_id' && typeof val === 'string' && val.trim() !== ''
    ).length
  }

  const sorted = useMemo(() => {
    const arr = [...filtered]
    if (sortOrder === 'alpha') {
      return arr.sort((a, b) => a.display_name.localeCompare(b.display_name, 'ja'))
    }
    if (sortOrder === 'activity') {
      return arr.sort((a, b) => {
        const as_ = a.slack_user_id ? (statsMap[a.slack_user_id] ?? statsMap[a.display_name]) : statsMap[a.display_name]
        const bs_ = b.slack_user_id ? (statsMap[b.slack_user_id] ?? statsMap[b.display_name]) : statsMap[b.display_name]
        return (bs_?.count ?? 0) - (as_?.count ?? 0)
      })
    }
    if (sortOrder === 'latest') {
      return arr.sort((a, b) => {
        const as_ = a.slack_user_id ? (statsMap[a.slack_user_id] ?? statsMap[a.display_name]) : statsMap[a.display_name]
        const bs_ = b.slack_user_id ? (statsMap[b.slack_user_id] ?? statsMap[b.display_name]) : statsMap[b.display_name]
        return (bs_?.lastPost ?? '').localeCompare(as_?.lastPost ?? '')
      })
    }
    if (sortOrder === 'profile') {
      return arr.sort((a, b) => {
        const ap = countProfileFields(a.slack_user_id ? profileMap[a.slack_user_id] : undefined)
        const bp = countProfileFields(b.slack_user_id ? profileMap[b.slack_user_id] : undefined)
        if (bp !== ap) return bp - ap
        // Tie-break: post count
        const as_ = a.slack_user_id ? (statsMap[a.slack_user_id] ?? statsMap[a.display_name]) : statsMap[a.display_name]
        const bs_ = b.slack_user_id ? (statsMap[b.slack_user_id] ?? statsMap[b.display_name]) : statsMap[b.display_name]
        return (bs_?.count ?? 0) - (as_?.count ?? 0)
      })
    }
    return arr
  }, [filtered, sortOrder, statsMap, profileMap])

  return (
    <div className="min-h-screen bg-[#f7faf2]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm hidden sm:inline">ダッシュボード</span>
          </Link>
          <div className="w-px h-5 bg-gray-200" />
          <Users size={17} className="text-[#1f7a00]" />
          <h1 className="font-bold text-gray-900 text-[15px]">メンバー一覧</h1>
          <div className="ml-auto flex items-center gap-2">
            {!loading && <span className="text-xs text-gray-400">{users.length}人</span>}
            {mySlackUserId && (
              <button
                onClick={() => router.push('/members/edit')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1f7a00] hover:bg-[#145200] text-white rounded-lg text-xs font-medium transition-colors"
              >
                <Pencil size={12} />
                プロフィールを編集
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 pb-bottom-nav">
        {/* 検索 + ソート */}
        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="名前・地域・所属・専門分野・自己紹介など..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#279300]/20 focus:border-[#279300]"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowSortMenu((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                sortOrder !== 'activity'
                  ? 'text-[#1f7a00] bg-[#279300]/5 border-[#279300]/20'
                  : 'text-gray-500 bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <ArrowUpDown size={14} />
              <span className="hidden sm:inline">{SORT_LABELS[sortOrder]}</span>
            </button>

            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-52">
                  {(Object.keys(SORT_LABELS) as SortOrder[]).map((order) => (
                    <button
                      key={order}
                      onClick={() => handleSortChange(order)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        sortOrder === order
                          ? 'text-[#1f7a00] font-semibold bg-[#279300]/5'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {sortOrder === order && <span className="mr-1">✓</span>}
                      {SORT_LABELS[order]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-3 flex flex-col items-center gap-2 animate-pulse">
                <div className="w-14 h-14 rounded-xl bg-gray-100" />
                <div className="h-3 bg-gray-100 rounded w-3/4" />
                <div className="h-2.5 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p>{query ? `"${query}" に一致するメンバーが見つかりません` : 'メンバーがいません'}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {sorted.map((user) => (
                <MemberCard
                  key={user.slack_user_id ?? user.display_name}
                  user={user}
                  profile={user.slack_user_id ? profileMap[user.slack_user_id] : undefined}
                  stats={getStats(user)}
                />
              ))}
            </div>
            {!query && (
              <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1"><MapPin size={11} />都道府県</span>
                <span className="flex items-center gap-1"><Building2 size={11} />所属組織</span>
                <span>で検索できます</span>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
