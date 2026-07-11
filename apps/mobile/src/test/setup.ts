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

vi.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react')

  return new Proxy(
    {},
    {
      get:
        (_, iconName: string) =>
        ({ size, color, ...props }: Record<string, unknown>) =>
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
          ),
    },
  )
})

// ── @kanchuki/shared (full mock with all exports) ───────────────────

vi.mock('@kanchuki/shared', () => ({
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
