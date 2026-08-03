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
