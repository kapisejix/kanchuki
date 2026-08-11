// Pure-data accent maps for the Colabs-style ColorCard chips.
//
// Kept in their own module WITHOUT a 'use client' directive on purpose: the
// marketing content pages (for-retailers, for-customers, how-it-works) are
// Server Components and index into these maps at render time — a value
// imported from a 'use client' module can't be dotted into on the server
// ("Cannot access cobalt.toString on the server"). These are just
// string->Tailwind-class lookups, so they live server-safe here; Chrome.tsx
// re-exports them for the client components that also need them.

export type ColorAccent = 'cobalt' | 'terracotta' | 'iris' | 'moss' | 'fern' | 'lilac' | 'mint' | 'sandal' | 'volt' | 'mist'

// Solid chip background — one saturated block per accent (colabs.com.au
// modular service modules).
export const ACCENT_BG: Record<ColorAccent, string> = {
  cobalt: 'bg-cobalt-600',
  terracotta: 'bg-terracotta',
  iris: 'bg-iris',
  moss: 'bg-moss',
  fern: 'bg-fern',
  lilac: 'bg-lilac',
  mint: 'bg-mint',
  sandal: 'bg-sandal',
  volt: 'bg-volt',
  mist: 'bg-mist',
}

// Title/icon text on the chip — light chips get near-black text; saturated
// chips get white.
export const ACCENT_TEXT: Record<ColorAccent, string> = {
  cobalt: 'text-white',
  terracotta: 'text-white',
  iris: 'text-white',
  moss: 'text-white',
  fern: 'text-carbon',
  lilac: 'text-carbon',
  mint: 'text-carbon',
  sandal: 'text-carbon',
  volt: 'text-carbon',
  mist: 'text-carbon',
}

// Body/description text on the same chips — one step softer than the title.
// Dark chips keep near-white body text (high opacity for AA contrast at 14px);
// light chips drop to a slightly muted carbon.
export const ACCENT_SUBTLE: Record<ColorAccent, string> = {
  cobalt: 'text-white/90',
  terracotta: 'text-white/90',
  iris: 'text-white/90',
  moss: 'text-white/90',
  fern: 'text-carbon/75',
  lilac: 'text-carbon/75',
  mint: 'text-carbon/75',
  sandal: 'text-carbon/75',
  volt: 'text-carbon/75',
  mist: 'text-carbon/75',
}
