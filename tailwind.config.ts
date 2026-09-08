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
      fontSize: {
        xs: ["12px", { lineHeight: "1.8" }],
        sm: ["14px", { lineHeight: "1.8" }],
        base: ["16px", { lineHeight: "1.8" }],
        lg: ["18px", { lineHeight: "1.8" }],
        xl: ["22px", { lineHeight: "1.8" }],
        "2xl": ["28px", { lineHeight: "1.6" }],
        "3xl": ["32px", { lineHeight: "1.5" }],
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
