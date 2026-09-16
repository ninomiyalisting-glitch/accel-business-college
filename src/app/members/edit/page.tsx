'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, LogIn, Camera, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SOCIAL_SERVICES, type SocialKey } from '@/lib/socialLinks'
import { prepareAvatar } from '@/lib/imagePrep'
import Avatar from '@/components/Avatar'

const SLACK_USER_KEY = 'abc_slackUser'

interface FormData {
  prefecture: string
  organization: string
  headline: string
  sub_headline: string
  expertise: string
  achievements: string
  bio: string
  availability: string
  appeal: string
}

/** SNS・外部リンク。FormData とは別に持つ（項目が増えても本文の並びを崩さないため） */
type SocialForm = Record<SocialKey, string>
const EMPTY_SOCIAL: SocialForm = { x_url: '', note_url: '', instagram_url: '', website_url: '' }

const EMPTY: FormData = {
  prefecture: '',
  organization: '',
  headline: '',
  sub_headline: '',
  expertise: '',
  achievements: '',
  bio: '',
  availability: '',
  appeal: '',
}

const FIELDS: { key: keyof FormData; label: string; placeholder: string; multiline: boolean; rows?: number }[] = [
  { key: 'prefecture', label: '都道府県', placeholder: '例：東京都、大阪府', multiline: false },
  { key: 'organization', label: '所属組織', placeholder: '例：株式会社〇〇、フリーランス', multiline: false },
  { key: 'headline', label: '紹介見出し', placeholder: '例：中小企業診断士｜製造業専門', multiline: false },
  { key: 'sub_headline', label: 'サブ見出し', placeholder: '例：R5合格。経営改善を支援しています', multiline: false },
  { key: 'expertise', label: '得意分野', placeholder: '例：経営改善、販路開拓、IT化支援…', multiline: true, rows: 3 },
  { key: 'achievements', label: '実績', placeholder: '例：補助金申請支援50件以上…', multiline: true, rows: 3 },
  { key: 'bio', label: '詳細紹介文章', placeholder: '自己紹介を自由に書いてください', multiline: true, rows: 5 },
  { key: 'availability', label: '仕事の稼働について', placeholder: '例：週2〜3日稼働可。副業・兼業歓迎', multiline: true, rows: 3 },
  { key: 'appeal', label: 'その他アピールポイント', placeholder: '例：全国出張対応可。オンライン相談OK', multiline: true, rows: 3 },
]

export default function EditProfilePage() {
  const router = useRouter()
  const [slackUserId, setSlackUserId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY)
  const [social, setSocial] = useState<SocialForm>(EMPTY_SOCIAL)
  /** プロフィール写真。表示中の URL と、アプリで設定したものかどうか */
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [hasCustomAvatar, setHasCustomAvatar] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SLACK_USER_KEY)
      if (saved) {
        const u = JSON.parse(saved) as { slack_user_id?: string; display_name?: string; avatar_url?: string | null }
        setSlackUserId(u.slack_user_id ?? null)
        setDisplayName(u.display_name ?? '')
        setAvatarUrl(u.avatar_url ?? null)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!slackUserId) { setLoading(false); return }
    const load = async () => {
      const { data } = await supabase
        .from('member_profiles')
        .select('*')
        .eq('slack_user_id', slackUserId)
        .maybeSingle()
      if (data) {
        setForm({
          prefecture: data.prefecture ?? '',
          organization: data.organization ?? '',
          headline: data.headline ?? '',
          sub_headline: data.sub_headline ?? '',
          expertise: data.expertise ?? '',
          achievements: data.achievements ?? '',
          bio: data.bio ?? '',
          availability: data.availability ?? '',
          appeal: data.appeal ?? '',
        })
        if (data.avatar_url) {
          setAvatarUrl(data.avatar_url)
          setHasCustomAvatar(true)
        }
        setSocial({
          x_url: data.x_url ?? '',
          note_url: data.note_url ?? '',
          instagram_url: data.instagram_url ?? '',
          website_url: data.website_url ?? '',
        })
      }
      setLoading(false)
    }
    load()
  }, [slackUserId])

  /** localStorage の自分情報の写真を差し替える。ヘッダーやホームに即反映するため */
  function rememberAvatar(url: string | null) {
    try {
      const saved = localStorage.getItem(SLACK_USER_KEY)
      if (!saved) return
      const u = JSON.parse(saved)
      localStorage.setItem(SLACK_USER_KEY, JSON.stringify({ ...u, avatar_url: url }))
      // ヘッダーのアイコンも同じ画面内で差し替わるように知らせる
      window.dispatchEvent(new CustomEvent('abc:user-updated'))
    } catch { /* ignore */ }
  }

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0]
    e.target.value = ''
    if (!original) return
    setAvatarBusy(true)
    setAvatarError(null)
    try {
      // 中央を正方形に切って 512px の JPEG にしてから送る
      const file = await prepareAvatar(original)
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/me/avatar', { method: 'POST', body })
      const json = (await res.json()) as { avatar_url?: string; error?: string }
      if (!res.ok || !json.avatar_url) throw new Error(json.error ?? '保存に失敗しました')
      setAvatarUrl(json.avatar_url)
      setHasCustomAvatar(true)
      rememberAvatar(json.avatar_url)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setAvatarBusy(false)
    }
  }

  const handleAvatarRemove = async () => {
    if (!confirm('アプリで設定した写真を削除して、Slack の写真に戻しますか？')) return
    setAvatarBusy(true)
    setAvatarError(null)
    try {
      const res = await fetch('/api/me/avatar', { method: 'DELETE' })
      const json = (await res.json()) as { avatar_url?: string | null; error?: string }
      if (!res.ok) throw new Error(json.error ?? '削除に失敗しました')
      setAvatarUrl(json.avatar_url ?? null)
      setHasCustomAvatar(false)
      rememberAvatar(json.avatar_url ?? null)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : '削除に失敗しました')
    } finally {
      setAvatarBusy(false)
    }
  }

  const handleSave = async () => {
    if (!slackUserId || saving) return
    setSaving(true)
    setSaved(false)

    const payload = {
      slack_user_id: slackUserId,
      updated_at: new Date().toISOString(),
      ...Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v.trim() || null])
      ),
      ...Object.fromEntries(
        Object.entries(social).map(([k, v]) => [k, v.trim() || null])
      ),
    }

    const { error } = await supabase
      .from('member_profiles')
      .upsert(payload, { onConflict: 'slack_user_id' })

    setSaving(false)
    if (error) {
      alert(`保存に失敗しました: ${error.message}`)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f3f8fc] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#007cb4]/30 border-t-[#007cb4] rounded-full animate-spin" />
      </div>
    )
  }

  if (!slackUserId) {
    return (
      <div className="min-h-screen bg-[#f3f8fc] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center max-w-sm w-full">
          <LogIn size={40} className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 font-medium mb-2">Slackログインが必要です</p>
          <p className="text-gray-400 text-sm mb-6">プロフィールを編集するにはSlackでログインしてください</p>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#006899] text-white rounded-xl text-sm hover:bg-[#004f75] transition-colors"
          >
            ログインページへ
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f3f8fc]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-prose mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            href={`/members/${slackUserId}`}
            className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm hidden sm:inline">プロフィール</span>
          </Link>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="font-bold text-gray-900 text-[17px]">プロフィールを編集</h1>
          <button
            onClick={handleSave}
            disabled={saving}
            className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-[#006899] hover:bg-[#004f75] disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? (
              <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 保存中...</>
            ) : (
              <><Save size={13} /> 保存</>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-prose mx-auto px-4 pt-6 pb-bottom-nav">
        {saved && (
          <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">
            ✓ プロフィールを保存しました
          </div>
        )}

        {/* プロフィール写真。保存ボタンとは独立して、選んだ時点で反映される */}
        <div className="mb-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <label className="block text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
            プロフィール写真
          </label>
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <Avatar src={avatarUrl} name={displayName} size={88} className="ring-2 ring-gray-100" />
              {avatarBusy && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70">
                  <div className="w-6 h-6 border-2 border-[#007cb4]/30 border-t-[#007cb4] rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarBusy}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#006899] hover:bg-[#004f75] disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Camera size={15} /> 写真を選ぶ
                </button>
                {hasCustomAvatar && (
                  <button
                    type="button"
                    onClick={handleAvatarRemove}
                    disabled={avatarBusy}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Trash2 size={15} /> Slack の写真に戻す
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                {hasCustomAvatar
                  ? 'アプリで設定した写真を表示しています。'
                  : 'いまは Slack の写真を表示しています。ここで選ぶとアプリ内の表示が置き換わります。'}
                正方形に切り抜かれます。
              </p>
              {avatarError && <p className="mt-2 text-xs text-red-600">{avatarError}</p>}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarPick}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {FIELDS.map(({ key, label, placeholder, multiline, rows }) => (
            <div key={key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                {label}
              </label>
              {multiline ? (
                <textarea
                  value={form[key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  rows={rows ?? 3}
                  className="w-full text-sm text-gray-800 placeholder-gray-300 border-0 focus:outline-none resize-none"
                />
              ) : (
                <input
                  type="text"
                  value={form[key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full text-sm text-gray-800 placeholder-gray-300 border-0 focus:outline-none"
                />
              )}
            </div>
          ))}

          {/* SNS・外部リンク。URL か ID を入れると、メンバーページにボタンで出る */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
              SNS・リンク
            </label>
            <p className="text-xs text-gray-400 mb-3">
              URL か ID を入れると、あなたのページにボタンで表示されます。空欄のものは出ません。
            </p>
            <div className="space-y-3">
              {SOCIAL_SERVICES.map((sv) => (
                <div key={sv.key} className="flex items-center gap-3">
                  <span className="w-20 flex-shrink-0 text-sm font-bold text-gray-700">{sv.label}</span>
                  <input
                    type="text"
                    inputMode="url"
                    autoCapitalize="none"
                    value={social[sv.key]}
                    onChange={(e) => setSocial((prev) => ({ ...prev, [sv.key]: e.target.value }))}
                    placeholder={sv.placeholder}
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:border-[#007cb4] focus:outline-none focus:ring-2 focus:ring-[#007cb4]/20"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#006899] hover:bg-[#004f75] disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {saving ? (
              <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 保存中...</>
            ) : (
              <><Save size={15} /> 変更を保存</>
            )}
          </button>
          <Link
            href={`/members/${slackUserId}`}
            className="px-6 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl text-sm font-medium transition-colors"
          >
            キャンセル
          </Link>
        </div>
      </main>
    </div>
  )
}
