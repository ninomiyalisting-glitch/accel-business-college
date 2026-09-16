import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import AppHeader from "@/components/AppHeader";

// 游ゴシックが無い端末（Android 等）のためのフォールバック。
// 先読みすると游ゴシックのある Mac / Windows で無駄になるので preload は切る。
const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-jp",
  preload: false,
  display: "swap",
});

/**
 * スマホのステータスバー（時刻・電池の帯）の色は themeColor。
 * ブラウザで開いたときはこの値、ホーム画面に追加したアプリは manifest.json の
 * theme_color が使われる（追加した時点の値が端末に保存されるので、色を変えたら
 * 一度削除して追加し直す必要がある）。2 つの値は必ず揃えること。
 */
export const viewport: Viewport = {
  themeColor: "#006899",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "アクセルビジネスカレッジ",
  description: "アクセルビジネスカレッジ コミュニティ",
  manifest: "/manifest.json",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "アクセルビジネスカレッジ",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`h-full ${notoSansJP.variable}`}>
      {/* 下余白は BodyPadding が付ける。body に直接付けると、
          自前で高さを計算するチャット画面で二重になり空白ができる */}
      <body className="h-full">
        <AppHeader />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
