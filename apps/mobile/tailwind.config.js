/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // "Black & Gold Elegance" — mirrors apps/web/tailwind.config.ts
      // (docs/design/emil-design.md §3.1, revised 2026-08-03). Hex only, no
      // oklch(): react-native-css-interop's parseDeclaration.js treats oklch
      // as an "Invalid color unit" and silently drops it (RN has no CSS color
      // engine), which is why every screen but home/catalog rendered as unstyled
      // black-outline boxes. Web dropped oklch this pass too, so these values
      // are now a literal copy, not a derived one — keep in sync by hand until
      // packages/shared grows a real token file (see doc §3.4, not built yet).
      colors: {
        ink: {
          50: '#EEF1F6',
          100: '#DCE2EC',
          200: '#B9C4D6',
          300: '#8FA0BC',
          400: '#5E7196',
          500: '#2C3F60',
          // CSS var, not a static hex: ThemeProvider (src/lib/theme.tsx) sets
          // --color-ink-600 at runtime via nativewind's vars() from the
          // admin-configured theme API, so every bg-ink-600/text-ink-600/
          // border-ink-600 usage across the app updates without a rebuild.
          600: 'var(--color-ink-600, #14213D)',
          700: '#101A30',
          800: '#0B1322',
          900: '#060A15',
        },
        rust: {
          50: '#FFF9EE',
          100: '#FFF0D1',
          200: '#FEE0A3',
          300: '#FDCB6E',
          400: '#FDB93F',
          500: '#FCAB22',
          // CSS var, not a static hex — ThemeProvider (src/lib/theme.tsx) sets
          // --color-rust-600 at runtime via nativewind's vars() from the
          // admin-configured theme API, so every bg-rust-600/text-rust-600/
          // border-rust-600 usage across the app updates without a rebuild.
          600: 'var(--color-rust-600, #FCA311)',
          700: '#D6860A',
          800: '#9C6308',
          900: '#634006',
        },
        turmeric: {
          50: '#FBF3E8',
          100: '#F3E1C6',
          200: '#E6C595',
          300: '#D5A263',
          400: '#C0813F',
          500: '#A66528',
          // Admin-configurable via --color-turmeric-600 (same mechanism as ink).
          600: 'var(--color-turmeric-600, #8A5A12)',
          700: '#6E4710',
          800: '#4E320C',
          900: '#2E1D07',
        },
        sand: {
          50: '#FCFCFC',
          // Admin-configurable surface fill via --color-sand-100.
          100: 'var(--color-sand-100, #F5F5F5)',
          200: '#E5E5E5',
          300: '#D4D4D4',
          400: '#B8B8B8',
          500: '#969696',
          600: '#737373',
          700: '#525252',
          800: '#333333',
          900: '#1A1A1A',
        },
        // Admin-configurable page background / body text via the same vars.
        cotton: 'var(--color-cotton, #FFFFFF)',
        charcoal: 'var(--color-charcoal, #000000)',
      },
      fontFamily: {
        // Loaded via @expo-google-fonts/inter in app/_layout.tsx.
        sans: ['Inter_400Regular'],
        'sans-medium': ['Inter_500Medium'],
        'sans-semibold': ['Inter_600SemiBold'],
        'sans-bold': ['Inter_700Bold'],
      },
    },
  },
  plugins: [],
}
