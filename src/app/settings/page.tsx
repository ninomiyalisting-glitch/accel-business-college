'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Bell, Volume2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const SLACK_USER_KEY = 'abc_slackUser'

interface UserSettings {
  notify_new_message: boolean
  notify_mention: boolean
  notify_reaction: boolean
  notify_event: boolean
  notify_new_member: boolean
  sound_enabled: boolean
}

const DEFAULT: UserSettings = {
  notify_new_message: true,
  notify_mention: true,
  notify_reaction: false,
  notify_event: true,
  notify_new_member: false,
  sound_enabled: true,
}

const NOTIFY_ITEMS: { key: keyof Omit<UserSettings, 'sound_enabled'>; label: string; desc: string }[] = [
  { key: 'notify_new_message', label: '新着メッセージ', desc: 'チャットに新しいメッセージが届いたとき' },
  { key: 'notify_mention', label: 'メンション', desc: '自分がメンションされたとき' },
  { key: 'notify_reaction', label: 'リアクション', desc: '自分の投稿にリアクションが付いたとき' },
  { key: 'notify_event', label: 'イベント通知', desc: '新しい日程調整が作成されたとき' },
  { key: 'notify_new_member', label: '新メンバー参加', desc: '新しいメンバーがコミュニティに参加したとき' },
]

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        enabled ? 'bg-[#279300]' : 'bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export default function SettingsPage() {
  const [slackUserId, setSlackUserId] = useState<string | null>(null)
  const [settings, setSettings] = useState<UserSettings>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SLACK_USER_KEY)
      if (raw) setSlackUserId(JSON.parse(raw).slack_user_id ?? null)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!slackUserId) { setLoading(false); return }
    supabase
      .from('user_settings')
      .select('*')
      .eq('slack_user_id', slackUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettings({
            notify_new_message: data.notify_new_message ?? true,
            notify_mention: data.notify_mention ?? true,
            notify_reaction: data.notify_reaction ?? false,
            notify_event: data.notify_event ?? true,
            notify_new_member: data.notify_new_member ?? false,
            sound_enabled: data.sound_enabled ?? true,
          })
        }
        setLoading(false)
      })
  }, [slackUserId])

  const toggle = (key: keyof UserSettings) =>
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))

  const handleSave = async () => {
    if (!slackUserId) return
    setSaving(true)
    await supabase
      .from('user_settings')
      .upsert(
        { slack_user_id: slackUserId, ...settings, updated_at: new Date().toISOString() },
        { onConflict: 'slack_user_id' }
      )
    setSaving(false)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 2500)
  }

  return (
    <div className="min-h-screen bg-[#f7faf2]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm hidden sm:inline">ダッシュボード</span>
          </Link>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="font-bold text-gray-900 text-[15px]">設定</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-bottom-nav space-y-4">
        {/* 通知 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <Bell size={15} className="text-[#1f7a00]" />
            <h2 className="font-semibold text-gray-900 text-sm">通知</h2>
          </div>
          <ul className="divide-y divide-gray-50">
            {NOTIFY_ITEMS.map(({ key, label, desc }) => (
              <li key={key} className="flex items-center justify-between px-5 py-4 gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-snug">{desc}</p>
                </div>
                <Toggle enabled={settings[key]} onToggle={() => toggle(key)} />
              </li>
            ))}
          </ul>
        </div>

        {/* サウンド */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <Volume2 size={15} className="text-[#1f7a00]" />
            <h2 className="font-semibold text-gray-900 text-sm">サウンド</h2>
          </div>
          <div className="flex items-center justify-between px-5 py-4 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-800">通知音</p>
              <p className="text-xs text-gray-400 mt-0.5">通知が届いたときに音を鳴らす</p>
            </div>
            <Toggle enabled={settings.sound_enabled} onToggle={() => toggle('sound_enabled')} />
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || loading || !slackUserId}
          className="w-full py-3 bg-[#1f7a00] hover:bg-[#145200] disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {saving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          {saveState === 'saved' ? '保存しました ✓' : saving ? '保存中...' : '設定を保存する'}
        </button>

        {!slackUserId && !loading && (
          <p className="text-center text-xs text-gray-400">Slackログイン後に設定を保存できます</p>
        )}
      </main>
    </div>
  )
}
