/**
 * Test setup for mobile app.
 *
 * Mocks required by React Native + Expo components so they can render
 * in Vitest's Node environment without native modules.
 *
 * NOTE: react-native is mocked at the Node.js CJS level via
 * Module._resolveFilename hook in vitest.config.ts — NOT here.
 */

import { vi } from 'vitest'

// ── expo-image ─────────────────────────────────────────────────────

vi.mock('expo-image', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react')

  const MockImage = React.forwardRef(
    (
      { source, style, ...props }: Record<string, unknown>,
      ref: React.Ref<unknown>,
    ) => {
      const uri =
        typeof source === 'object' && source
          ? (source as Record<string, string>).uri
          : null
      return React.createElement(
        'View' as never,
        { ref, style, ...props },
        React.createElement(
          'Text' as never,
          { testID: 'expo-image-uri' },
          uri ?? 'no-uri',
        ),
      )
    },
  )
  MockImage.displayName = 'MockImage'
  return { Image: MockImage }
})

// ── expo-router ────────────────────────────────────────────────────

vi.mock('expo-router', () => ({
  router: { push: vi.fn(), back: vi.fn(), replace: vi.fn() },
  useLocalSearchParams: vi.fn(() => ({})),
  useSegments: vi.fn(() => []),
  Stack: { Screen: () => null },
}))

// ── expo-constants ─────────────────────────────────────────────────

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} }, statusBarHeight: 0 },
}))

// ── react-native-safe-area-context ─────────────────────────────────

vi.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react')
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  }
})

// ── lucide-react-native (Proxy — catches any icon import) ──────────
// CRITICAL: the `get` trap must return undefined for `then`/`__esModule`/non-string
// keys. Returning a component function for `then` makes Promise.resolve() treat the
// Proxy as a thenable — `await import('lucide-react-native')` (and vitest's ESM
// interop on mocked modules) hangs forever waiting for a resolve() that never runs.
// Found 2026-08-02 while adding the first real-screen test (retailer-onboard);
// existing tests never imported lucide, so the broken trap went unnoticed.

vi.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react')

  return new Proxy(
    {},
    {
      // Vitest's ESM interop on a mocked module checks `iconName in mock` before
      // reading it — a bare Proxy has no own keys, so every named icon import
      // would throw "No X export is defined on the mock". Report every string
      // key as present (get returns the factory below).
      has: (_, key) =>
        typeof key === 'string' &&
        key !== 'then' &&
        key !== '__esModule' &&
        key !== 'default',
      getOwnPropertyDescriptor: (_, key) => {
        if (
          typeof key !== 'string' ||
          key === 'then' ||
          key === '__esModule' ||
          key === 'default'
        ) {
          return undefined
        }
        return { configurable: true, enumerable: true, value: undefined }
      },
      get:
        (_, iconName) => {
          if (
            iconName === 'then' ||
            iconName === '__esModule' ||
            iconName === 'default' ||
            typeof iconName !== 'string'
          ) {
            return undefined
          }
          return ({ size, color, ...props }: Record<string, unknown>) =>
            React.createElement(
              'View' as never,
              { testID: `lucide-${iconName}`, ...props },
              React.createElement(
                'Text' as never,
                {
                  style: {
                    fontSize: Number(size) || 16,
                    color: String(color || '#000'),
                  },
                },
                String(iconName),
              ),
            )
        },
    },
  )
})

// ── @kanchuki/shared (full mock with all exports) ───────────────────

vi.mock('@kanchuki/shared', () => ({
  // Design tokens (mirrors packages/shared/src/colors.ts)
  COLORS: {
    ink: {
      50: '#EEF1F6',
      100: '#DCE2EC',
      200: '#B9C4D6',
      300: '#8FA0BC',
      400: '#5E7196',
      500: '#2C3F60',
      600: '#14213D',
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
      600: '#FCA311',
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
      600: '#8A5A12',
      700: '#6E4710',
      800: '#4E320C',
      900: '#2E1D07',
    },
    sand: {
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
    glow: '#FFC94D',
    veil: '#0B1322',
    danger: '#E3262D',
    dangerSurface: '#FFF1F1',
    dangerTint: '#FFDFDD',
    chartAccent: '#F75D59',
  },

  // Formatting
  formatPriceRange: (min: number | null, max: number | null) => {
    if (min == null && max == null) return '—'
    if (min === max)
      return `₹${((min ?? 0) / 100).toLocaleString('en-IN')}`
    return `₹${((min ?? 0) / 100).toLocaleString('en-IN')} – ₹${((max ?? 0) / 100).toLocaleString('en-IN')}`
  },
  normalizeIndianPhone: (v: string) =>
    v.replace(/\D/g, '').replace(/^91/, '').replace(/^0/, ''),
  normalizeSearchQuery: (q: string) => q.toLowerCase().trim(),

  // Constants
  PRODUCT_CATEGORIES: [
    'Ladies Suit',
    'Kurti',
    'Saree',
    'Lehenga',
    'Gown',
    'Dupatta',
    'Blouse',
    "Men's Kurta Pajama",
    'Sherwani',
    'Kids Ethnic Wear',
    'Readymade Suit',
    'Other',
  ],
  PRODUCT_TYPES: ['Unstitched', 'Semi-Stitched', 'Readymade'],
  FABRIC_TYPES: [
    'Cotton',
    'Silk',
    'Georgette',
    'Chiffon',
    'Chanderi',
    'Crepe',
    'Rayon',
    'Modal',
    'Net',
    'Organza',
    'Linen',
    'Cotton-Silk Blend',
    'Cotton-Poly Blend',
    'Satin',
  ],
  PATTERN_TYPES: [
    'Plain',
    'Printed',
    'Embroidered',
    'Block Print',
    'Bandhani',
    'Chikankari',
    'Phulkari',
    'Woven',
    'Checked',
    'Striped',
  ],
  EMBELLISHMENT_TYPES: [
    'Zari Work',
    'Zardozi',
    'Gota Patti',
    'Mirror Work',
    'Sequin',
    'Stone Work',
    'Resham Embroidery',
    'Thread Work',
    'None',
  ],
  OCCASION_TYPES: [
    'Casual',
    'Office Wear',
    'Party Wear',
    'Wedding',
    'Festive',
    'Sangeet',
    'Mehendi',
    'Pooja',
    'Daily Wear',
    'Special Occasion',
  ],

  // R2 paths
  R2_PATHS: {
    productPhoto: (r: string, p: string, f: string) =>
      `retailers/${r}/products/${p}/${f}`,
    tryonInput: (j: string) => `tryon/${j}/input.jpg`,
    tryonResult: (j: string) => `tryon/${j}/result.jpg`,
    measurementPhoto: (c: string, m: string, s: string) =>
      `measurements/${c}/${m}/${s}.jpg`,
  },

  // Queue names
  QUEUES: {
    AI_TAGGING: 'kanchuki-ai-tagging',
    EMBEDDINGS: 'kanchuki-embeddings',
    TRY_ON: 'kanchuki-try-on',
    CLEANUP: 'kanchuki-cleanup',
    MEASUREMENT_EXTRACTION: 'kanchuki-measurement-extraction',
  },

  // Hindi → English
  HINDI_TO_ENGLISH: { suit: 'ladies suit', kurta: 'kurta' },

  // Cache TTL
  CACHE_TTL: {
    AI_TAG_RESULT: 86400,
    SESSION: 900,
    COLLECTION_VIEWS: 300,
    RATE_LIMIT_WINDOW: 60,
  },

  // Config
  COLLECTION_SLUG_LENGTH: 8,
  COLLECTION_DEFAULT_EXPIRY_DAYS: 30,
}))

// ── @tanstack/react-query (minimal — test files override when needed) ─

vi.mock('@tanstack/react-query', () => {
  const noop = () => undefined
  return {
    useQuery: () => ({ data: undefined, isLoading: false, refetch: noop }),
    useMutation: () => ({ mutate: noop, isPending: false }),
    useQueryClient: () => ({ invalidateQueries: noop }),
  }
})

// ── react-native-css-interop (tailwind runtime — not needed in tests) ─
// The real package has ESM deps Node.js v22 can't parse.

vi.mock('react-native-css-interop', () => ({}))

// ── @testing-library/react-native (ESM deps Node.js v22 can't parse) ─
// Uses react-test-renderer for snapshot-compatible render.

vi.mock('@testing-library/react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./__mocks__/testing-library.js')
})
