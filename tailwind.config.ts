import type { Config } from "tailwindcss";

/**
 * アクセルパートナーズ共通デザイントークン
 * ここを変えると全ページ・全コンポーネントに一括反映される。
 * accel-dash（ポータル）と同じ値を使うこと。値の出典は
 * https://accel-dash.com/accel-design.css
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        accel: {
          lightest: "#e8f5c9",
          light: "#a8e67d",
          secondary: "#6fd433",
          hover: "#3db800",
          primary: "#279300",
          active: "#1f7a00",
          text: "#145200",
          dark: "#0d3800",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f7faf2",
        },
        "border-soft": "#dbe8c8",
        // フッター用のブルー。指定の #0097DB は白文字が 3.26:1 で
        // 本文サイズの基準（4.5）に届かないため、同じ色味で明度だけ下げた。
        // #007CB4 は白文字 4.62:1。ここより明るくすると読みにくくなる。
        footer: {
          DEFAULT: "#007CB4",
          dark: "#006899",
          light: "#0097DB",
        },
        // Slack のブランド色。Slack への導線ボタンにのみ使う
        slack: {
          brand: "#4A154B",
          brandDark: "#3e1140",
        },
      },
      fontFamily: {
        sans: [
          "Yu Gothic",
          "游ゴシック体",
          "YuGothic",
          "Yu Gothic Medium",
          "Hiragino Sans",
          "var(--font-noto-sans-jp)",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
      },
      // 文字サイズの底上げ。
      // このアプリは text-xs が 192 箇所、text-sm が 278 箇所という状態で、
      // 全部書き換えると細かいバッジまで巻き込んで崩れる。
      // トークンの実寸を上げることで、既存のクラスをそのまま大きくする。
      //   xs  12px → 14px（補助情報。これ以上小さくしない）
      //   sm  14px → 16px（本文。ブラウザ標準サイズ）
      //   base 16px → 18px
      // 行間はすべて 1.8。見出しだけ詰める。
      fontSize: {
        xs: ["14px", { lineHeight: "1.8" }],
        sm: ["16px", { lineHeight: "1.8" }],
        base: ["18px", { lineHeight: "1.8" }],
        lg: ["20px", { lineHeight: "1.7" }],
        xl: ["24px", { lineHeight: "1.6" }],
        "2xl": ["30px", { lineHeight: "1.5" }],
        "3xl": ["36px", { lineHeight: "1.4" }],
      },
      // コンテンツの最大幅。ヘッダー・見出し帯・本文をこれで揃える。
      // ページごとに max-w-2xl〜6xl がバラバラだったため、
      // 新しい画面ではこれを使うこと。
      // 幅の基準は 2 つだけにする。
      //   content … ヘッダー・見出し帯・一覧・カード（動画階層と同じ）
      //   prose   … 記事本文と入力フォーム。1200px まで伸ばすと
      //             一行が長くなり読みづらいので狭く保つ
      // 以前は max-w-2xl〜6xl が 35 箇所にバラバラに使われていた。
      maxWidth: {
        content: "1200px",
        prose: "780px",
      },
      minHeight: {
        control: "48px",
      },
      spacing: {
        control: "48px",
      },
    },
  },
  plugins: [],
};

export default config;
