/**
 * サイト共通の連絡先など。公開ページ（ランディング・案内）から参照する。
 * 変えるときはここだけ直せばよい。
 */

/** 実務従事の問い合わせ先。ランディングの「実務従事に参加する」ボタンが開くメールの宛先 */
export const CONTACT_EMAIL = 'ninomiya@accel-partners.co.jp'

export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  '【アクセルビジネスカレッジ】実務従事について問い合わせ'
)}&body=${encodeURIComponent(
  'アクセルビジネスカレッジ 運営 ご担当者様\n\n実務従事への参加について、詳しい内容を教えてください。\n\nお名前：\n診断士登録：（済／受験中／勉強中）\nお住まいの都道府県：\nひとこと：\n'
)}`
