import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight,
  MessageSquare,
  Video,
  CalendarDays,
  Users,
  BookOpen,
  Image as ImageIcon,
  Sparkles,
  Smartphone,
  LifeBuoy,
  CheckCircle2,
} from 'lucide-react'

/**
 * 入会したばかりで、まだログインしたことがない方向けの案内。
 *
 * ログイン不要で開ける（middleware の PUBLIC_PATHS に登録）。
 * 招待メールからここへ来て、「Slack でログイン」まで迷わず進めることが目的。
 * 検索エンジンには載せない（layout の robots と middleware の X-Robots-Tag で noindex）。
 */

export const metadata: Metadata = {
  title: 'アプリへの入り方と使い方 | アクセルビジネスカレッジ',
  robots: { index: false, follow: false },
}

const LOGIN_HREF = '/api/auth/slack'

const STEPS: { title: string; body: string; note?: string }[] = [
  {
    title: 'Slack の招待を受け取る',
    body: '運営から Slack ワークスペース「アクセルビジネスカレッジ」への招待が届きます。案内にしたがって Slack のアカウントを作り、ワークスペースに参加してください。',
    note: 'すでに Slack に参加している方は、この手順は済んでいます。',
  },
  {
    title: 'このサイトを開いて「Slackでログイン」を押す',
    body: 'college.accel-dash.com を開き、緑の「Slackアカウントでログイン」ボタンを押します。パスワードの登録は要りません。Slack のアカウントがそのままログインになります。',
  },
  {
    title: 'Slack の画面で「許可する」を押す',
    body: 'Slack の確認画面が開きます。内容を確認して「許可する」を押すと、自動でアプリに戻ります。',
    note: 'Slack アプリにログイン済みのスマホなら、そのまま許可するだけで入れます。',
  },
  {
    title: 'ホームが開いたら完了',
    body: 'イベント・投稿・動画などが並んだホーム画面が開けばログイン完了です。次回からはログイン状態が保たれます。',
  },
]

const FIRST_TASKS: { title: string; body: string }[] = [
  {
    title: 'プロフィールを書く',
    body: '「メンバー」→ 自分の名前 →「プロフィールを編集」。都道府県・所属・得意分野を書いておくと、相談や紹介につながります。写真も設定できます。',
  },
  {
    title: '実務従事の更新期限を登録する',
    body: '「設定」→「実務従事の更新期限」に日付を入れると、ホームに期限までのポイント進捗が出ます。',
  },
  {
    title: 'チャットでひと言あいさつ',
    body: '「チャット」から自己紹介をひと言。Slack にも同じ投稿が届くので、メンバーの目に留まります。',
  },
]

const FEATURES: { icon: React.ReactNode; title: string; body: string }[] = [
  { icon: <MessageSquare size={20} />, title: 'チャット', body: 'Slack と連携。アプリから読む・書く・リアクションができます。' },
  { icon: <Video size={20} />, title: '動画ライブラリ', body: '勉強会の録画をいつでも。参加できなかった回もここで。' },
  { icon: <CalendarDays size={20} />, title: 'イベント・勉強会', body: '候補日に回答して日程調整。自分で勉強会を立てることもできます。' },
  { icon: <Users size={20} />, title: 'メンバー', body: '全員のプロフィール。得意分野で探して、Slack でメッセージ。' },
  { icon: <BookOpen size={20} />, title: 'ビジカレnote', body: '「診断士合格後の教科書」やコラム。自分でも記事を書けます。' },
  { icon: <ImageIcon size={20} />, title: '活動写真', body: 'イベントの写真。撮った写真の共有もここから。' },
  { icon: <Sparkles size={20} />, title: 'AI に聞く', body: 'コミュニティの情報をもとに答える AI。探しものや相談に。' },
]

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ヘッダー。ランディングと同じ作り */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-5 py-3 backdrop-blur sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/icon-192x192.png" alt="" width={32} height={32} className="rounded-lg" />
          <span className="hidden text-[17px] font-bold text-gray-900 sm:block">アクセルビジネスカレッジ</span>
        </Link>
        <a
          href={LOGIN_HREF}
          className="flex items-center gap-2 rounded-lg bg-[#1f7a00] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#145200]"
        >
          Slackでログイン
        </a>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-10 sm:px-6 sm:pt-14">
        {/* 見出し */}
        <p className="text-sm font-semibold text-[#1f7a00]">入会された方へ</p>
        <h1 className="mt-2 text-3xl font-bold leading-snug text-gray-900 sm:text-4xl">
          アプリへの入り方と使い方
        </h1>
        <p className="mt-4 leading-relaxed text-gray-600">
          アクセルビジネスカレッジ（ビジカレ）へようこそ。このページは、まだアプリにログインしたことがない方のための案内です。
          上から順に進めば、5分ほどでログインして使い始められます。
        </p>

        {/* 入り方 */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-gray-900">アプリへの入り方</h2>
          <ol className="mt-5 space-y-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 rounded-2xl border border-gray-100 bg-[#f7faf2] p-5">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#1f7a00] text-base font-bold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{s.body}</p>
                  {s.note && (
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-[#1f7a00]">
                      <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
                      {s.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6 text-center">
            <a
              href={LOGIN_HREF}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1f7a00] px-8 py-3.5 text-base font-semibold text-white shadow-md transition-colors hover:bg-[#145200] hover:shadow-lg"
            >
              Slackアカウントでログイン <ArrowRight size={18} />
            </a>
            <p className="mt-3 text-sm text-gray-400">アクセルビジネスカレッジの Slack メンバーのみ利用できます</p>
          </div>
        </section>

        {/* スマホ */}
        <section className="mt-12 rounded-2xl border border-gray-100 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Smartphone size={20} className="text-[#1f7a00]" />
            スマホではホーム画面に追加すると便利です
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            ブラウザでこのサイトを開いた状態で、<strong>iPhone</strong> は共有ボタン →「ホーム画面に追加」、
            <strong>Android</strong> はメニュー →「ホーム画面に追加」。アプリのようにアイコンから起動でき、通知も受け取れます。
          </p>
        </section>

        {/* 最初にやること */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-gray-900">ログインしたら、最初にやること（3つ）</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {FIRST_TASKS.map((t, i) => (
              <div key={t.title} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <span className="text-xs font-bold text-[#1f7a00]">STEP {i + 1}</span>
                <h3 className="mt-1 font-bold text-gray-900">{t.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{t.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 機能 */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-gray-900">アプリでできること</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3 rounded-2xl bg-[#f7faf2] p-4">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white text-[#1f7a00] shadow-sm">
                  {f.icon}
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900">{f.title}</h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-gray-600">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-gray-500">
            くわしい使い方は、ログイン後にホームの「使い方ガイド」からご覧ください。
          </p>
        </section>

        {/* 困ったとき */}
        <section className="mt-12 rounded-2xl border border-amber-100 bg-amber-50/60 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <LifeBuoy size={20} className="text-amber-600" />
            うまく入れないとき
          </h2>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-gray-700">
            <li>
              <strong>Slack からのメールが届かない</strong> — 迷惑メールフォルダを確認してください。会社のメール（Outlook など）は届きにくいことがあります。
              スマホの Slack アプリにログイン済みなら、メールを待たずにそのスマホからこのサイトを開いて「Slackでログイン」を押せば入れます。
            </li>
            <li>
              <strong>「許可する」のあと戻ってこない</strong> — もう一度このサイトを開いて「Slackでログイン」を押してください。2回目は確認画面なしで入れることが多いです。
            </li>
            <li>
              <strong>ログインできない・メンバーとして認識されない</strong> — Slack のワークスペースが「アクセルビジネスカレッジ」になっているか確認してください。別のワークスペースにログインしていると入れません。
            </li>
            <li>
              <strong>それでも解決しない</strong> — 招待メールに返信するか、Slack で運営（にのみー）までご連絡ください。
            </li>
          </ul>
        </section>

        <div className="mt-12 text-center">
          <a
            href={LOGIN_HREF}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1f7a00] px-8 py-3.5 text-base font-semibold text-white shadow-md transition-colors hover:bg-[#145200]"
          >
            Slackアカウントでログイン <ArrowRight size={18} />
          </a>
          <p className="mt-4 text-sm text-gray-400">
            <Link href="/" className="underline hover:text-gray-600">トップページへ戻る</Link>
          </p>
        </div>
      </main>

      <footer className="border-t border-gray-100 px-6 py-6 text-center">
        <p className="text-sm text-gray-400">© {new Date().getFullYear()} アクセルビジネスカレッジ</p>
      </footer>
    </div>
  )
}
