import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

const notoSansJP = Noto_Sans_JP({ subsets: ["latin"], weight: ["400", "500", "700"] });

export const viewport: Viewport = {
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
    <html lang="ja" className="h-full">
      <head>
        <meta name="theme-color" content="#2563eb" />
      </head>
      <body className={`${notoSansJP.className} h-full pb-bottom-nav`}>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
