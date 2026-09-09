'use client'

import Link from 'next/link'

import { useState, useEffect } from 'react'
import { Bell, Volume2, Shield, Award } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const ADMIN_SLACK_USER_ID = 'U058FM3EFE0'
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
  { key: 'notify_event', label: 'イベント通知', desc: '新しいイベントが作成されたとき' },
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
  // 診断士の更新期限。トップページでポイントの進捗を出すために使う。
  // 通知のトグルとは性質が違うので UserSettings には入れない。
  const [renewalDeadline, setRenewalDeadline] = useState('')

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
          setRenewalDeadline(data.renewal_deadline ?? '')
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
        {
          slack_user_id: slackUserId,
          ...settings,
          renewal_deadline: renewalDeadline || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'slack_user_id' }
      )
    setSaving(false)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 2500)
  }

  return (
    <div className="min-h-screen bg-[#f7faf2]">

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
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
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

        {/* 実務従事の更新期限。
            トップページで「期限までに 30 ポイント」の進捗を出すのに使う。
            未入力ならトップでは合計だけを出す。 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <Award size={15} className="text-[#1f7a00]" />
            <h2 className="font-semibold text-gray-900 text-sm">実務従事の更新期限</h2>
          </div>
          <div className="px-5 py-4">
            <label htmlFor="renewal" className="block text-sm text-gray-600 mb-2">
              登録更新の期限日を入れると、トップページで 30 ポイントまでの進捗が出ます。
            </label>
            <input
              id="renewal"
              type="date"
              value={renewalDeadline}
              onChange={(e) => setRenewalDeadline(e.target.value)}
              className="w-full max-w-xs px-4 py-3 bg-white border-2 border-border-soft rounded-xl focus:outline-none focus:border-accel-primary"
            />
            {renewalDeadline && (
              <button
                onClick={() => setRenewalDeadline('')}
                className="ml-3 text-sm text-gray-500 hover:text-red-600 underline"
              >
                消す
              </button>
            )}
          </div>
        </div>

        {/* 管理画面。サイドバーから移設した。
            使うのは管理者だけなので、設定の中に置く */}
        {slackUserId === ADMIN_SLACK_USER_ID && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
              <Shield size={15} className="text-[#1f7a00]" />
              <h2 className="font-semibold text-gray-900 text-sm">管理</h2>
            </div>
            <div className="px-5 py-4">
              <Link href="/admin" className="btn-secondary w-full">
                <Shield size={16} />
                管理画面を開く
              </Link>
              <p className="mt-3 text-xs text-gray-500">
                チャンネルの同期、過去ログの取得、スレッドとアバターの補完ができます。
              </p>
            </div>
          </div>
        )}

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
