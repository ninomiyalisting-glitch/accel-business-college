/**
 * イベントのカテゴリー。
 *
 * DB 側の CHECK 制約（events_category_check）と同じ 4 つ。
 * 増やすときは supabase/events_v2.sql の制約も直すこと。
 * 片方だけ変えると保存時に弾かれる。
 */
export const EVENT_CATEGORIES = ['勉強会', '食事会', 'レジャー', 'その他'] as const

export type EventCategory = typeof EVENT_CATEGORIES[number]

/** 一覧のタグの色。カテゴリーごとに区別が付くように分ける */
export const EVENT_CATEGORY_STYLE: Record<EventCategory, string> = {
  勉強会: 'bg-accel-lightest text-accel-text',
  食事会: 'bg-amber-100 text-amber-800',
  レジャー: 'bg-sky-100 text-sky-800',
  その他: 'bg-gray-100 text-gray-700',
}

/** DB の値を安全にカテゴリーへ変換する。未設定や想定外は「その他」 */
export function toCategory(value: string | null | undefined): EventCategory {
  return (EVENT_CATEGORIES as readonly string[]).includes(value ?? '')
    ? (value as EventCategory)
    : 'その他'
}
