import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // "Red Elegance" palette (docs/design/emil-design.md §3.1, revised 2026-07-29).
        // Token names kept from the earlier Loom pass — only the hues changed —
        // so every existing `ink-*`/`rust-*`/`turmeric-*` usage repaints for free.
        // `stone` was renamed to `sand`: admin (`apps/web/src/app/admin/**`) already
        // uses Tailwind's *built-in* `stone-*` scale for its neutrals, and this file's
        // color overrides are project-wide — keeping the marketing neutral under a
        // different key is what keeps the admin dashboard's palette untouched.
        ink: {
          // Navy — primary brand/action color (revised 2026-07-29, was "Flaming
          // Cherry" red). Hex, not oklch, to stay pixel-identical with the mobile
          // scale in apps/mobile/tailwind.config.js (RN's style engine can't parse
          // oklch at all — see that file's comment).
          50: '#F3F5F8',
          100: '#E2E7ED',
          200: '#C7D0DA',
          300: '#A4B2C0',
          400: '#7B8CA0',
          500: '#4E6178',
          // References the same --color-ink custom property globals.css sets
          // (and RootLayout overrides per-request from the admin theme API) —
          // one lever for admin-configurable branding instead of two.
          600: 'var(--color-ink, #1E2A3D)',
          700: '#182233',
          800: '#121A27',
          900: '#0C121C',
        },
        rust: {
          // Juicy Details — secondary accent. Darkened a step past the raw
          // swatch (#D5777D) at the 600/700 text tiers so small colored
          // text still clears WCAG AA (4.5:1) against the cotton background.
          50: 'oklch(97% 0.012 8)',
          100: 'oklch(93% 0.028 9)',
          200: 'oklch(87% 0.05 10)',
          300: 'oklch(79% 0.075 11)',
          400: 'oklch(70% 0.095 12)',
          500: 'oklch(62% 0.11 13)',
          600: 'oklch(52% 0.12 14)',
          700: 'oklch(45% 0.115 15)',
          800: 'oklch(36% 0.09 16)',
          900: 'oklch(27% 0.065 17)',
        },
        turmeric: {
          // Tobacco Brown — tertiary/grounding accent.
          50: 'oklch(96% 0.014 68)',
          100: 'oklch(91% 0.028 66)',
          200: 'oklch(84% 0.042 64)',
          300: 'oklch(74% 0.055 62)',
          400: 'oklch(64% 0.065 60)',
          500: 'oklch(56% 0.07 58)',
          600: 'oklch(48% 0.072 56)',
          700: '#6E5742',
          800: 'oklch(32% 0.045 52)',
          900: 'oklch(23% 0.03 50)',
        },
        sand: {
          // Warm neutral (was `stone`, cool oklch hue 265) — reads with the
          // cocoa/cherry family instead of fighting it.
          50: 'oklch(98% 0.006 75)',
          100: 'oklch(95% 0.008 70)',
          200: 'oklch(90% 0.01 66)',
          300: 'oklch(83% 0.012 63)',
          400: 'oklch(72% 0.014 60)',
          500: 'oklch(59% 0.015 58)',
          600: 'oklch(48% 0.017 55)',
          700: 'oklch(38% 0.019 52)',
          800: 'oklch(28% 0.02 50)',
          900: 'oklch(20% 0.018 48)',
        },
        cotton: '#FBFAF8',
        charcoal: '#14100D',
        // Decorative-only cool notes from the Red Elegance swatch — used
        // sparingly (hero wash) since the rest of the palette is warm.
        icy: '#C5E8FC',
        petal: '#CBBBCF',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        soft: '0 8px 24px -10px rgb(8 145 178 / 0.18)',
        'soft-lg': '0 16px 40px -12px rgb(8 145 178 / 0.22)',
        selvedge: '0 1px 2px oklch(20% 0 0 / 6%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        spool: 'spool 0.7s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        spool: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
