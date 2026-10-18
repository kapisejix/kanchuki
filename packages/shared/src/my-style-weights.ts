// F-045 My Style (docs/tasks/pending/my-style.md §3.4) — ranking constants. Constants, not
// admin settings: tuning is a code change with a test until we have data to justify a knob.

/** score = Σ weight·component, every component in 0..1. Must sum to 1 (tested). */
export const MY_STYLE_WEIGHTS = {
  fit: 0.45,
  trend: 0.2,
  rating: 0.15,
  freshness: 0.1,
  proximity: 0.1,
} as const;

/**
 * fit = clamp01(base + Σ part·signal). A neutral product sits at `base`, a palette "avoid"
 * hits the floor, a palette "good" plus matching occasion/colour/fabric reaches 1.
 * base + all parts = 1.
 */
export const MY_STYLE_FIT = {
  base: 0.3,
  palette: 0.4, // ×(+1 good family, −1 avoid family, 0 unknown/unmapped)
  occasion: 0.15,
  prefColor: 0.1,
  prefFabric: 0.05,
} as const;

/** Best-match only: at most `perStore` items per store inside the first `window` results. */
export const MY_STYLE_DIVERSITY = { perStore: 3, window: 12 } as const;

/** Freshness fades linearly to 0 at this age. */
export const MY_STYLE_FRESH_DAYS = 90;

/** Default search radius (km) used to turn distance into a 0..1 proximity score. */
export const MY_STYLE_DEFAULT_RADIUS_KM = 25;

export type MyStyleSort = 'best' | 'nearest' | 'price';
