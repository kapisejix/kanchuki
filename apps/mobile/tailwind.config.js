/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Navy palette — mirrors apps/web/tailwind.config.ts (docs/design/emil-design.md §3.1).
      // Hex only, no oklch(): react-native-css-interop's parseDeclaration.js treats
      // oklch as an "Invalid color unit" and silently drops it (RN has no CSS color
      // engine), which is why every screen but home/catalog rendered as unstyled
      // black-outline boxes. Keep these two files in sync by hand until
      // packages/shared grows a real token file (see doc §3.4, not built yet).
      colors: {
        ink: {
          50: '#F3F5F8',
          100: '#E2E7ED',
          200: '#C7D0DA',
          300: '#A4B2C0',
          400: '#7B8CA0',
          500: '#4E6178',
          // CSS var, not a static hex: ThemeProvider (src/lib/theme.tsx) sets
          // --color-ink-600 at runtime via nativewind's vars() from the
          // admin-configured theme API, so every bg-ink-600/text-ink-600/
          // border-ink-600 usage across the app updates without a rebuild.
          600: 'var(--color-ink-600, #1E2A3D)',
          700: '#182233',
          800: '#121A27',
          900: '#0C121C',
        },
        rust: {
          50: '#FDF2F3',
          100: '#FAE1E4',
          200: '#F3C7CD',
          300: '#E6A7AF',
          400: '#D2858F',
          500: '#BF6973',
          600: '#A24854',
          700: '#893540',
          800: '#64262D',
          900: '#41171B',
        },
        turmeric: {
          50: '#F8F0E8',
          100: '#EFDECE',
          200: '#DFC5AF',
          300: '#C5A488',
          400: '#AA8364',
          500: '#946A4B',
          600: '#7D5334',
          700: '#6E5742',
          800: '#452C1D',
          900: '#281910',
        },
        sand: {
          50: '#FBF8F4',
          100: '#F2EEE9',
          200: '#E3DDD7',
          300: '#CDC6BF',
          400: '#ABA39C',
          500: '#847B75',
          600: '#665B55',
          700: '#4B4039',
          800: '#312620',
          900: '#1D140F',
        },
        cotton: '#FBFAF8',
        charcoal: '#14100D',
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
