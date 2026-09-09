import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.slack-edge.com',
      },
      {
        // Slackbot のアバターだけこのドメインから配信される。
        // 未登録だと next/image が例外を投げ、ページ全体が落ちる
        // （「This page couldn't load」になる）。
        protocol: 'https',
        hostname: 'a.slack-edge.com',
      },
      {
        protocol: 'https',
        hostname: 'files.slack.com',
      },
      {
        protocol: 'https',
        hostname: 'secure.gravatar.com',
      },
      {
        protocol: 'https',
        hostname: 'i.vimeocdn.com',
      },
      {
        protocol: 'https',
        hostname: '*.vimeocdn.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

export default nextConfig;
