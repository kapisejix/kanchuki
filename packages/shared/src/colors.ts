// Single source of truth for JS-level color values (RN literal `color=`/
// inline-style props, icon libraries, ActivityIndicator — anywhere a
// Tailwind className can't reach because the target isn't CSS). This is
// the piece from docs/design/emil-design.md §3.4 ("shared-token gap") that
// closes: import COLORS instead of hardcoding hex, and the whole app
// repaints from one file.
//
// apps/web/tailwind.config.ts and apps/mobile/tailwind.config.js still carry
// their own copy of these same values for className-based theming (bg-ink-600
// etc) — Tailwind's config is loaded at build time by each platform's own
// bundler (Next's SWC / Metro), before this package's dist output is
// guaranteed to exist, so wiring those configs to import from here directly
// risks breaking the build if @kanchuki/shared hasn't been built yet. Keep
// all three in sync by hand on a repaint; this file is the one that matters
// for every non-className color reference across web, mobile, and api.
export const COLORS = {
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
  // ── Royal Orchid Luxury Tokens (2026 Mobile Palette) ──────────
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
  // ── Semantic status colors ────────────────────────────────────
  // Deliberately NOT part of the admin-configurable brand palette: they
  // carry meaning (destructive action, error state, chart series), not
  // brand. Replacing raw literals like '#E3262D' with these keys keeps
  // every surface consistent and gives the next repaint one place to edit.
  danger: '#E3262D',
  dangerSurface: '#FFF1F1',
  dangerTint: '#FFDFDD',
  chartAccent: '#F75D59',
} as const
