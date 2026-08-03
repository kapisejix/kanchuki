// Admin-configurable platform theme — the "one-click repaint" contract.
//
// The admin panel (apps/web/src/app/admin/settings/theme) edits these six
// tokens; the API (apps/api/src/routes/admin-settings.ts) stores them; the
// mobile retailer app (apps/mobile/src/lib/theme.tsx) fetches them at launch
// and overlays them onto the static COLORS palette via applyThemeOverrides().
// Every brand-colored surface that reads through useTheme()/COLORS repaints
// when these change — no app-store release needed.
//
// Each token maps onto a COLORS ramp key (see colors.ts), so a partial theme
// (e.g. an old saved setting that only has primary_color) merges cleanly over
// DEFAULT_PLATFORM_THEME and every other token keeps its current value.

export type PlatformTheme = {
  /** ink 600 — brand primary: buttons, active nav, selected states */
  primary_color: string
  /** rust 600 — hero accent: CTAs, links, gold */
  accent_color: string
  /** turmeric 600 — grounding accent: badges, checkmarks, star fill */
  tertiary_color: string
  /** cotton — page background */
  background_color: string
  /** charcoal — body text */
  text_color: string
  /** sand 100 — card / surface fills */
  surface_color: string
}

export const DEFAULT_PLATFORM_THEME: PlatformTheme = {
  primary_color: '#14213D',
  accent_color: '#FCA311',
  tertiary_color: '#8A5A12',
  background_color: '#FFFFFF',
  text_color: '#000000',
  surface_color: '#F5F5F5',
}

/**
 * Overlay an admin theme onto the static COLORS palette. Pure and typed so
 * the API defaults, the mobile ThemeProvider, and tests all share one
 * definition of "what a palette change touches".
 *
 * Ramps keep every non-overridden step as-is; only the six brand-anchor
 * steps (600 tiers + cotton/charcoal/sand-100) are replaced by the theme.
 */
export function applyThemeOverrides(
  base: typeof import('./colors.js').COLORS,
  theme: PlatformTheme,
): typeof import('./colors.js').COLORS {
  // The `as const` COLORS shape has literal hex types (e.g. cotton is
  // '#FFFFFF', not string) — the theme replaces those with runtime strings,
  // so the result is cast back to the COLORS shape for ergonomic access
  // (colors.cotton etc.). Values are valid hex by API contract.
  return {
    ...base,
    ink: { ...base.ink, 600: theme.primary_color },
    rust: { ...base.rust, 600: theme.accent_color },
    turmeric: { ...base.turmeric, 600: theme.tertiary_color },
    sand: { ...base.sand, 100: theme.surface_color },
    cotton: theme.background_color,
    charcoal: theme.text_color,
  } as typeof import('./colors.js').COLORS
}
