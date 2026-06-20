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
          DEFAULT: '#556B2F',
          dark: '#3A4A20',
          light: '#6B8A3A',
          50: '#F4F7EC',
          100: '#E4ECD0',
          200: '#C8D9A5',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          2: '#F5F4EF',
        },
        ink: {
          DEFAULT: '#1A1A1A',
          2: '#3D3D3D',
        },
        muted: '#6B6B6B',
        soft: '#9C9C9C',
        border: '#E5E4DC',
        status: {
          green: '#2A7F4F',
          amber: '#C58A1A',
          red: '#B23B2D',
          blue: '#2860A1',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        lg: '12px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.04)',
        DEFAULT: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
        lg: '0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
