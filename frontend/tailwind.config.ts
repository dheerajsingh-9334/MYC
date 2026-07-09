import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        olive: {
          DEFAULT: "var(--olive)",
          dark: "var(--olive-dark)",
          light: "var(--olive-light)",
          50: "var(--olive-50)",
          100: "var(--olive-100)",
          200: "var(--olive-200)",
        },
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          2: "var(--ink-2)",
        },
        muted: "var(--muted)",
        soft: "var(--soft)",
        border: "var(--border)",
        status: {
          green: "var(--green)",
          amber: "var(--amber)",
          red: "var(--red)",
          blue: "var(--blue)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ["Instrument Serif", "Georgia", "serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow)",
        lg: "var(--shadow-lg)",
      },
    },
  },
  plugins: [],
};

export default config;
