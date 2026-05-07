import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        slack: {
          sidebar: "#3B2A4A",
          siderbarDark: "#2D1F3A",
          sidebarHover: "#4A3560",
          sidebarActive: "#5A4570",
          sidebarText: "#CFC3DA",
          sidebarTextMuted: "#9A8FAD",
          header: "#FFFFFF",
          headerBorder: "#E8E8E8",
        },
      },
    },
  },
  plugins: [],
};

export default config;
