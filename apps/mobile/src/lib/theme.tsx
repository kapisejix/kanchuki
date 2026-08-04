import {
  COLORS,
  DEFAULT_PLATFORM_THEME,
  type PlatformTheme,
  applyThemeOverrides,
} from '@kanchuki/shared';
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { themeApi } from './api';
import { getItem, setItem, subscribeStorage } from './storage';

// bg-ink-600/text-ink-600/border-ink-600 classNames pick up the primary color
// for free via nativewind's vars() (see AppShell in app/_layout.tsx) — no
// edits needed there. useTheme()/getPrimaryColor() below are for the
// remaining spots that bypass className entirely: raw `color="#hex"` props
// (icon libraries, ActivityIndicator) and inline style objects.
//
// The palette is the six admin-configurable tokens from
// packages/shared/src/theme.ts. applyThemeOverrides() lays them onto the
// static COLORS ramps so `colors.ink[600]`, `colors.rust[600]`,
// `colors.cotton` … all return the admin-set values — meaning every
// component that reads through useTheme() repaints when the admin changes
// the theme, without an app-store release. The static COLORS import stays
// only for module-scope constants that can't call a hook (status maps, etc.).
//
// Persistence is PER-USER: the fetched palette is cached under
// `theme_palette:{retailer_id}`, so a shared shop device (owner + staff, or
// two owners on one tablet) never flashes the previous account's palette.
// The cache is hydrated before first render (_layout.tsx passes
// `initialPalette`), so a theme change shows instantly on next launch —
// the network fetch only refreshes in the background.
const LEGACY_GLOBAL_KEY = 'theme_palette';
const LEGACY_COLOR_KEY = 'theme_primary_color';

function cacheKeyFor(retailerId: string | null): string {
  return retailerId ? `theme_palette.${retailerId}` : 'theme_palette.anon';
}

/**
 * Read the last persisted palette for a user — never hits the network.
 * Order: per-user key → legacy global key (pre-per-user builds) → legacy
 * single-color key (pre-full-palette builds). Returns null when nothing
 * usable is stored (first launch on this account/device).
 */
export async function loadPersistedPalette(
  retailerId: string | null,
): Promise<PlatformTheme | null> {
  for (const key of [cacheKeyFor(retailerId), LEGACY_GLOBAL_KEY]) {
    const cached = await getItem(key).catch(() => null);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Partial<PlatformTheme>;
        return { ...DEFAULT_PLATFORM_THEME, ...parsed };
      } catch {
        // Corrupt cache — try the next key, the network fetch replaces it.
      }
    }
  }
  const legacy = await getItem(LEGACY_COLOR_KEY).catch(() => null);
  if (legacy && /^#[0-9A-Fa-f]{6}$/.test(legacy)) {
    return { ...DEFAULT_PLATFORM_THEME, primary_color: legacy };
  }
  return null;
}

// PlatformTheme's keys are snake_case (API wire format); expose camelCase
// aliases too so components can destructure `{ primaryColor, colors }` —
// the pre-existing convention across the app.
type ThemeValue = PlatformTheme & {
  colors: typeof COLORS;
  primaryColor: string;
  accentColor: string;
  tertiaryColor: string;
  backgroundColor: string;
  textColor: string;
  surfaceColor: string;
};

const DEFAULT_VALUE: ThemeValue = {
  ...DEFAULT_PLATFORM_THEME,
  colors: COLORS,
  primaryColor: DEFAULT_PLATFORM_THEME.primary_color,
  accentColor: DEFAULT_PLATFORM_THEME.accent_color,
  tertiaryColor: DEFAULT_PLATFORM_THEME.tertiary_color,
  backgroundColor: DEFAULT_PLATFORM_THEME.background_color,
  textColor: DEFAULT_PLATFORM_THEME.text_color,
  surfaceColor: DEFAULT_PLATFORM_THEME.surface_color,
};

const ThemeContext = createContext<ThemeValue>(DEFAULT_VALUE);

// ponytail: plain module-level mirror of the context value, for the rare
// module-scope color constant that can't call a hook. Not reactive — read
// once at module load — so prefer useTheme() inside components; this is
// the fallback only for cases that used a hardcoded literal at module scope.
let currentPrimary = DEFAULT_PLATFORM_THEME.primary_color;
export function getPrimaryColor(): string {
  return currentPrimary;
}

export function ThemeProvider({
  children,
  initialPalette,
}: {
  children: ReactNode;
  /** Palette hydrated from the per-user cache before first render (instant launch). */
  initialPalette?: PlatformTheme | null;
}) {
  // Initialize the state AND the module-level getPrimaryColor() mirror from
  // the hydrated palette, so module-scope constants read the right primary
  // from the very first frame (not after the post-mount sync effect fires).
  const [palette, setPalette] = useState<PlatformTheme>(() => {
    const p = initialPalette ?? DEFAULT_PLATFORM_THEME;
    currentPrimary = p.primary_color;
    return p;
  });

  useEffect(() => {
    let cancelled = false;
    let lastRetailerId: string | null | undefined = undefined;

    const applyPalette = (merged: PlatformTheme) => {
      currentPrimary = merged.primary_color;
      setPalette(merged);
    };

    // Load the per-user cache, then refresh from the network in the
    // background. Runs on mount and again whenever retailer_id changes
    // (login, logout, account switch on a shared device).
    const sync = async () => {
      const retailerId = await getItem('retailer_id').catch(() => null);
      if (cancelled || retailerId === lastRetailerId) return;
      lastRetailerId = retailerId;

      // Serve the persisted palette for THIS user first — display never
      // waits on the network fetch.
      const cached = await loadPersistedPalette(retailerId);
      if (!cancelled && cached) applyPalette(cached);

      // Background refresh — picks up admin theme changes since the last
      // fetch. Persist under the per-user key (and the legacy global key so
      // pre-per-user readers still see it).
      themeApi
        .get()
        .then(({ data }) => {
          if (cancelled) return;
          const merged = { ...DEFAULT_PLATFORM_THEME, ...(data ?? {}) };
          applyPalette(merged);
          void setItem(cacheKeyFor(retailerId), JSON.stringify(merged));
          void setItem(LEGACY_GLOBAL_KEY, JSON.stringify(merged));
        })
        .catch(() => {
          // Network unavailable — keep cached/default palette
        });
    };

    void sync();
    const unsubscribe = subscribeStorage('retailer_id', () => void sync());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const colors = useMemo(() => applyThemeOverrides(COLORS, palette), [palette]);
  const value = useMemo<ThemeValue>(
    () => ({
      ...palette,
      colors,
      primaryColor: palette.primary_color,
      accentColor: palette.accent_color,
      tertiaryColor: palette.tertiary_color,
      backgroundColor: palette.background_color,
      textColor: palette.text_color,
      surfaceColor: palette.surface_color,
    }),
    [palette, colors],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
