'use client'

import { useState } from 'react'

/**
 * アバター画像。
 *
 * next/image は未登録のドメインだと例外を投げ、ページ全体が
 * 「This page couldn't load」になる。実際に Slackbot のアバターだけ
 * a.slack-edge.com から配信されていて、それでメンバーページが落ちた。
 *
 * アバターは外部の任意ドメインから来るので、next/image の最適化に
 * 乗せる意味が薄い。素の img を使い、読み込み失敗時は頭文字に
 * 差し替える。これでドメインが増えても画面は落ちない。
 */
export default function Avatar({
  src,
  name,
  size = 40,
  className = '',
  rounded = 'rounded-full',
}: {
  src?: string | null
  name: string
  size?: number
  className?: string
  rounded?: string
}) {
  const [failed, setFailed] = useState(false)
  const initial = name?.trim()?.[0]?.toUpperCase() ?? '?'

  if (!src || failed) {
    return (
      <div
        className={`${rounded} bg-accel-lightest flex items-center justify-center flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <span
          className="font-bold text-accel-active leading-none"
          style={{ fontSize: Math.max(11, Math.round(size * 0.4)) }}
        >
          {initial}
        </span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`${rounded} object-cover flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
