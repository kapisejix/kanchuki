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
        // "Black & Gold Elegance" palette (docs/design/emil-design.md §3.1,
        // revised 2026-08-03 from the given 5-swatch reference: bold black,
        // deep navy, regal gold, light grey, luminous white). Token names
        // kept from the Loom/Red Elegance passes before it — only the hues
        // changed — so every existing `ink-*`/`rust-*`/`turmeric-*` usage
        // repaints for free. All ramps are plain hex (dropped oklch this
        // pass): removes the hand-conversion step that made mobile/web
        // parity error-prone (docs/design/emil-design.md §3.4) — mobile's
        // ramp below is now a literal copy, not a derived one.
        // `stone` was renamed to `sand`: admin (`apps/web/src/app/admin/**`)
        // already uses Tailwind's *built-in* `stone-*` scale for its neutrals,
        // and this file's color overrides are project-wide — keeping the
        // marketing neutral under a different key is what keeps the admin
        // dashboard's palette untouched.
        ink: {
          // Deep navy — primary brand/action color, anchored on the
          // reference swatch's #14213D.
          50: '#EEF1F6',
          100: '#DCE2EC',
          200: '#B9C4D6',
          300: '#8FA0BC',
          400: '#5E7196',
          500: '#2C3F60',
          // References the same --color-ink custom property globals.css sets
          // (and RootLayout overrides per-request from the admin theme API) —
          // one lever for admin-configurable branding instead of two.
          600: 'var(--color-ink, #14213D)',
          700: '#101A30',
          800: '#0B1322',
          900: '#060A15',
        },
        rust: {
          // Regal Gold — primary hero accent (CTAs, links, active nav),
          // anchored on the reference swatch's #FCA311.
          50: '#FFF9EE',
          100: '#FFF0D1',
          200: '#FEE0A3',
          300: '#FDCB6E',
          400: '#FDB93F',
          500: '#FCAB22',
          600: '#FCA311',
          700: '#D6860A',
          800: '#9C6308',
          900: '#634006',
        },
        turmeric: {
          // Antique gold / bronze — tertiary grounding accent (badges,
          // checkmarks, star fill), a deeper step off the same gold hue.
          50: '#FBF3E8',
          100: '#F3E1C6',
          200: '#E6C595',
          300: '#D5A263',
          400: '#C0813F',
          500: '#A66528',
          600: '#8A5A12',
          700: '#6E4710',
          800: '#4E320C',
          900: '#2E1D07',
        },
        sand: {
          // Neutral grey (was warm-biased under Red Elegance) — anchored on
          // the reference swatch's #E5E5E5, reads clean against black/navy/gold.
          50: '#FCFCFC',
          100: '#F5F5F5',
          200: '#E5E5E5',
          300: '#D4D4D4',
          400: '#B8B8B8',
          500: '#969696',
          600: '#737373',
          700: '#525252',
          800: '#333333',
          900: '#1A1A1A',
        },
        cotton: '#FFFFFF',
        charcoal: '#000000',
        // Decorative-only hero-wash notes (was `icy`/`petal`, Red Elegance's
        // two cool notes — renamed, a cool sky/petal wash no longer fits a
        // black-and-gold identity). A soft gold glow + a navy-black shadow.
        glow: '#FFC94D',
        veil: '#0B1322',

        // ── Royal Orchid Luxury Suite (2026 Mobile & Web Palette) ──
        heliotrope: {
          50: '#F7F2F8',
          100: '#EBDDEE',
          500: '#6B4773',
          600: '#5A3962',
          700: '#492D50',
        },
        fuchsia: {
          400: '#D65CB3',
          500: '#BB3F95',
          600: '#A12E7E',
        },
        lavender: {
          50: '#FAF9FE',
          100: '#F2F1FA',
          200: '#E0E1F6',
          300: '#C8CAEE',
        },
        spaceCadet: {
          800: '#1D193E',
          900: '#231F48',
          950: '#16132F',
        },
        tyrian: {
          700: '#6D0E49',
          800: '#560A39',
          900: '#40062A',
        },

        // ── "CoLab" marketing palette (2026-08-11, colabs.com.au) ─────────
        // Added AFTER the legacy ink/rust/turmeric/sand set and used ONLY by
        // the marketing/content pages (apps/web/src/components/site + the
        // marketing page trees). The legacy tokens above stay untouched so
        // the customer storefront (/c, /store) and admin panel keep their
        // "Black & Gold" identity — this block is additive, not a repaint.
        //
        // Reference: colabs.com.au (Awwwards SOTD 2023). Warm off-white
        // canvas #F9F8F6, near-black ink #060606, yellow-lime accent
        // #D9DB4D, plus a rainbow of modular card colors — every service
        // block is a solid color chip, not a white card.
        cream: {
          // Canvas — warm off-white page background.
          DEFAULT: '#F9F8F6',
          50: '#FBFAF8',
          100: '#F5F2ED',
          200: '#EAE5DD',
        },
        carbon: {
          // Near-black ink for display type and dark sections.
          DEFAULT: '#060606',
          50: '#2A2A2A',
          100: '#1A1A1A',
        },
        volt: {
          // Yellow-lime — the single global accent (buttons, highlights).
          // DEFAULT so bare `bg-volt`/`text-volt` resolve (like `bg-cream`).
          DEFAULT: '#D9DB4D',
          50: '#FBFCE9',
          100: '#F6F8CE',
          200: '#EEF1A2',
          300: '#E5E974',
          400: '#DFE15E',
          500: '#D9DB4D',
          600: '#B9BC32',
          700: '#8E9126',
          800: '#65671C',
          900: '#3C3D10',
        },
        cobalt: {
          // Vivid blue — links + secondary accents on light backgrounds.
          50: '#EAF1FF',
          100: '#D6E3FF',
          200: '#ADC7FF',
          300: '#7FA8F5',
          400: '#4D84E8',
          500: '#1D62D4',
          600: '#0046C7',
          700: '#00379C',
          800: '#002A75',
          900: '#001C4E',
        },
        // Modular service/card colors — each feature block is its own chip.
        terracotta: '#B1653B',
        iris: '#5757A5',
        moss: '#66662A',
        fern: '#59C28A',
        lilac: '#BFB9E3',
        mint: '#32C58B',
        sandal: '#DCB688',
        mist: '#BED2F5',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        // MatterSemiMono (uploaded to src/fonts/, wired via next/font/local in
        // layout.tsx) is a semi-mono grotesque — mono fallback keeps the
        // character if the file ever fails to load, not a serif.
        display: ['var(--font-display)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        // Was a stray rgb(8 145 178 / ...) — cyan, a leftover from before the
        // Loom repaint that neither Loom nor Red Elegance ever caught. Navy-
        // tinted now, to actually match the shipping palette.
        soft: '0 8px 24px -10px rgb(20 33 61 / 0.18)',
        'soft-lg': '0 16px 40px -12px rgb(20 33 61 / 0.22)',
        selvedge: '0 1px 2px oklch(20% 0 0 / 6%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        spool: 'spool 0.7s linear infinite',
        // Infinite leftward marquee — the Colabs signature (service cards
        // scroll continuously). Track must contain exactly 2 copies of the
        // content and shift -50% for a seamless loop.
        marquee: 'marquee 45s linear infinite',
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
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
