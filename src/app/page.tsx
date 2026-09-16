import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  MessageSquare,
  Video,
  Users,
  CalendarDays,
  BookOpen,
  Award,
  Briefcase,
  GraduationCap,
  HeartHandshake,
  Smartphone,
  CheckCircle2,
  Mail,
  LogIn,
} from 'lucide-react'
import { getPublicStats, type PublicEvent } from '@/lib/publicStats'
import { CONTACT_MAILTO } from '@/lib/site'
import { EVENT_CATEGORY_STYLE } from '@/lib/eventCategories'

/**
 * ランディング（ログイン前のトップ）。
 *
 * 目的は「このコミュニティに入りたい」と思ってもらい、入口である実務従事への
 * 問い合わせにつなげること。メンバーはヘッダーの小さなログインから入る。
 *
 * 数字と募集中のイベントは DB から取る（10 分キャッシュ）。
 * イベントは題名と日程の状態だけで、人の名前・リンクは出さない。
 */
export const revalidate = 600

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
function dateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`
}

const PAINS = [
  { title: '登録はしたけれど、案件がない', body: '独立しても、勤めながらでも、最初の一歩は「誰かと一緒に」が近道です。実務従事はチームで企業を支援するので、経験がなくても現場に立てます。' },
  { title: '更新ポイントが貯まらない', body: '5年で30ポイント。実務従事に参加すれば、ポイントを貯めながら仲間と経験を積めます。アプリで進捗が見えるので、期限に慌てません。' },
  { title: '相談できる診断士の仲間がいない', body: '受任した案件の進め方、報酬の決め方、断り方。教科書に載っていないことを、同じ立場の仲間に聞けます。' },
]

const BENEFITS = [
  { icon: <Briefcase size={22} />, title: '実務従事で、実際の企業を支援', body: 'チームで中小企業の経営課題に取り組みます。先輩診断士と一緒なので、初めてでも大丈夫。更新ポイントの対象です。' },
  { icon: <GraduationCap size={22} />, title: '勉強会と録画で、いつでも学べる', body: '財務・マーケ・組織人事・コンサル手法。月例の勉強会は録画され、動画ライブラリからいつでも見返せます。' },
  { icon: <BookOpen size={22} />, title: '「診断士合格後の教科書」', body: '合格後に本当に必要な知識を、運営がコラムとして書き続けています。メンバー自身の記事も増えています。' },
  { icon: <HeartHandshake size={22} />, title: '相談できる仲間と、つながる案件', body: 'Slack で日々の相談。得意分野で仲間を探して、紹介や共同受任へ。全国の診断士がいます。' },
  { icon: <Smartphone size={22} />, title: '専用アプリで、全部ひとつに', body: 'チャット・動画・イベント・メンバー・記事・ポイント管理。スマホのホーム画面から開けます。' },
  { icon: <CalendarDays size={22} />, title: '勉強会だけでなく、食事会や旅も', body: '学びの場だけではなく、オフ会やレジャーも。オンラインとリアルの両方で、顔の見える関係を作ります。' },
]

const STEPS = [
  { title: '実務従事について問い合わせる', body: '下のボタンからメールを送ってください。次回の募集内容、日程、進め方をお返事します。' },
  { title: '実務従事に参加する', body: 'チームで企業支援に取り組みます。ここで得たポイントは登録更新に使えます。' },
  { title: 'コミュニティに参加する', body: '実務従事に参加した方を Slack とアプリに招待します。以後は勉強会・イベント・記事のすべてが使えます。' },
]

const FAQ = [
  { q: '誰でも入会できますか？', a: 'コミュニティへの参加は、アクセルビジネスカレッジの実務従事に参加した診断士の方に限っています。まず実務従事についてお問い合わせください。' },
  { q: '診断士の資格はまだですが、興味があります', a: '実務従事は診断士登録者（または登録予定の方）が対象です。受験中・登録前の方も、お問い合わせいただければ今後の募集をご案内します。' },
  { q: '会社勤めでも参加できますか？', a: '多くのメンバーが企業内診断士や副業・兼業です。勉強会は夜や土日が中心で、録画もあるので、参加できない回は動画で追えます。' },
  { q: '地方に住んでいます', a: '全国にメンバーがいます。チャット・勉強会・動画はすべてオンライン。実務従事もオンラインで進める案件があります。' },
]

function EventCard({ ev }: { ev: PublicEvent }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${EVENT_CATEGORY_STYLE[ev.category]}`}>
          {ev.category}
        </span>
        {ev.confirmedDate ? (
          <span className="rounded-full bg-accel-primary px-2.5 py-0.5 text-xs font-bold text-white">開催決定</span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">日程調整中</span>
        )}
      </div>
      <p className="line-clamp-2 font-bold leading-snug text-gray-900">{ev.title}</p>
      <p className="mt-auto text-sm text-gray-500">
        {ev.confirmedDate
          ? `${dateLabel(ev.confirmedDate)} 開催`
          : ev.candidateCount > 0
            ? `候補 ${ev.candidateCount} 日から調整中`
            : '日程を調整中'}
      </p>
    </div>
  )
}

export default async function LandingPage() {
  const stats = await getPublicStats()

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* ヘッダー */}
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-content items-center justify-between px-5 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Image src="/icon-192x192.png" alt="" width={36} height={36} className="rounded-xl" />
            <span className="hidden text-[17px] font-bold sm:block">アクセルビジネスカレッジ</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/auth/slack"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <LogIn size={16} /> メンバーログイン
            </a>
            <a
              href={CONTACT_MAILTO}
              className="hidden items-center gap-1.5 rounded-lg bg-accel-active px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-accel-text sm:inline-flex"
            >
              実務従事に参加する
            </a>
          </div>
        </div>
      </header>

      {/* ヒーロー */}
      <section className="relative overflow-hidden bg-surface-muted">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accel-lightest/70 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-accel-light/30 blur-3xl" />
        <div className="relative mx-auto grid max-w-content items-center gap-10 px-5 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-accel-light/60 bg-white px-3.5 py-1.5 text-xs font-bold text-accel-text">
              中小企業診断士のクローズドコミュニティ
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.25] tracking-tight sm:text-5xl">
              中小企業診断士として、
              <br />
              生きていく。
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-600">
              資格を取ったあとの「どうやって仕事にするか」を、一人で抱えなくていい場所。
              実務従事で現場に立ち、勉強会で学び、仲間と案件を分け合う。
              アクセルビジネスカレッジは、診断士が診断士として食べていくためのコミュニティです。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={CONTACT_MAILTO}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-accel-active px-7 py-4 text-base font-bold text-white shadow-lg shadow-accel-active/20 transition-all hover:bg-accel-text hover:shadow-xl"
              >
                <Mail size={18} /> 実務従事について問い合わせる
              </a>
              <a
                href="#about"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl px-5 py-4 text-base font-semibold text-accel-text transition-colors hover:bg-white"
              >
                コミュニティについて知る <ArrowRight size={16} />
              </a>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              入会は実務従事に参加した診断士の方に限っています。まずはお気軽にご連絡ください。
            </p>
          </div>

          {/* 数字カード。スマホでも 2 列に収める */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {stats.members !== null && (
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <Users size={22} className="text-accel-primary" />
                <p className="mt-3 text-3xl font-bold tabular-nums sm:text-4xl">{stats.members}<span className="ml-1 text-lg text-gray-500">名</span></p>
                <p className="mt-1 text-sm text-gray-500">全国の診断士が参加中</p>
              </div>
            )}
            {stats.videos !== null && (
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <Video size={22} className="text-accel-primary" />
                <p className="mt-3 text-3xl font-bold tabular-nums sm:text-4xl">{stats.videos}<span className="ml-1 text-lg text-gray-500">本</span></p>
                <p className="mt-1 text-sm text-gray-500">勉強会の録画をいつでも</p>
              </div>
            )}
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <Award size={22} className="text-accel-primary" />
              <p className="mt-3 text-2xl font-bold sm:text-4xl">実務従事</p>
              <p className="mt-1 text-sm text-gray-500">更新ポイントの対象。チームで企業支援</p>
            </div>
            <div className="rounded-3xl bg-accel-text p-6 text-white shadow-sm">
              <MessageSquare size={22} className="text-accel-light" />
              <p className="mt-3 text-lg font-bold leading-snug sm:text-2xl">Slack と専用アプリで、毎日つながる</p>
              <p className="mt-1 text-sm text-white/70">相談・勉強会・イベント・記事をひとつに</p>
            </div>
          </div>
        </div>
      </section>

      {/* 共感 */}
      <section id="about" className="mx-auto max-w-content px-5 py-16 sm:px-6 sm:py-24">
        <p className="text-sm font-bold text-accel-primary">こんな悩み、ありませんか</p>
        <h2 className="mt-2 text-2xl font-bold sm:text-3xl">合格したあとが、いちばん孤独だった。</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PAINS.map((p) => (
            <div key={p.title} className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold leading-snug">{p.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 得られるもの */}
      <section className="bg-surface-muted">
        <div className="mx-auto max-w-content px-5 py-16 sm:px-6 sm:py-24">
          <p className="text-sm font-bold text-accel-primary">ビジカレで得られるもの</p>
          <h2 className="mt-2 text-2xl font-bold sm:text-3xl">経験も、学びも、仲間も。ここに全部ある。</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title} className="flex gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-accel-lightest text-accel-text">
                  {b.icon}
                </span>
                <div>
                  <h3 className="font-bold leading-snug">{b.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{b.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* いま動いているイベント */}
      {stats.events.length > 0 && (
        <section className="mx-auto max-w-content px-5 py-16 sm:px-6 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-accel-primary">いま動いているイベント</p>
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">こんな集まりが、毎月あります。</h2>
            </div>
            <p className="text-sm text-gray-500">メンバーになると、日程調整や参加申込ができます</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stats.events.map((ev, i) => (
              <EventCard key={i} ev={ev} />
            ))}
          </div>
        </section>
      )}

      {/* 参加の流れ */}
      <section className="bg-accel-text text-white">
        <div className="mx-auto max-w-content px-5 py-16 sm:px-6 sm:py-24">
          <p className="text-sm font-bold text-accel-light">参加の流れ</p>
          <h2 className="mt-2 text-2xl font-bold sm:text-3xl">入口は、実務従事です。</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-white/80">
            ビジカレは「一緒に現場に立った人」のコミュニティです。だから入会は、実務従事に参加した方に限っています。
            まずは実務従事から。そこで得た経験とポイントが、そのままコミュニティへの入口になります。
          </p>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-3xl bg-white/10 p-6 ring-1 ring-white/15">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-base font-bold text-accel-text">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-bold leading-snug">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/80">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10">
            <a
              href={CONTACT_MAILTO}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-4 text-base font-bold text-accel-text shadow-lg transition-colors hover:bg-accel-lightest"
            >
              <Mail size={18} /> 実務従事について問い合わせる
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-16 sm:px-6 sm:py-24">
        <p className="text-sm font-bold text-accel-primary">よくある質問</p>
        <h2 className="mt-2 text-2xl font-bold sm:text-3xl">参加前に、よく聞かれること</h2>
        <dl className="mt-8 divide-y divide-gray-100 rounded-3xl border border-gray-100 bg-white shadow-sm">
          {FAQ.map((f) => (
            <div key={f.q} className="p-6">
              <dt className="flex items-start gap-2.5 font-bold leading-snug">
                <CheckCircle2 size={18} className="mt-1 flex-shrink-0 text-accel-primary" />
                {f.q}
              </dt>
              <dd className="mt-2 pl-7 text-sm leading-relaxed text-gray-600">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 最後の CTA */}
      <section className="bg-surface-muted">
        <div className="mx-auto max-w-content px-5 py-16 text-center sm:px-6 sm:py-24">
          <Image src="/icon-192x192.png" alt="" width={72} height={72} className="mx-auto rounded-2xl shadow-lg" />
          <h2 className="mt-6 text-2xl font-bold sm:text-3xl">中小企業の成長支援を通して、1ミリでも日本社会に貢献したい。</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-gray-600">
            そのために企業と診断士を適切に繋げ、診断士の価値向上を目指す。それがアクセルビジネスカレッジです。
            同じ想いの方と、現場でお会いできるのを楽しみにしています。
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={CONTACT_MAILTO}
              className="inline-flex items-center gap-2 rounded-xl bg-accel-active px-7 py-4 text-base font-bold text-white shadow-lg shadow-accel-active/20 transition-colors hover:bg-accel-text"
            >
              <Mail size={18} /> 実務従事について問い合わせる
            </a>
            <a
              href="/api/auth/slack"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-4 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              <LogIn size={18} /> メンバーの方はログイン
            </a>
          </div>
          <p className="mt-4 text-sm text-gray-400">
            入会したばかりの方は <Link href="/welcome" className="underline hover:text-gray-600">アプリへの入り方と使い方</Link> をご覧ください
          </p>
        </div>
      </section>

      <footer className="border-t border-gray-100 bg-white px-6 py-8 text-center">
        <p className="text-sm text-gray-400">© {new Date().getFullYear()} アクセルビジネスカレッジ</p>
      </footer>
    </div>
  )
}
