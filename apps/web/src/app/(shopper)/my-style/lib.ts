// F-045 My Style: feed request/response shapes and the one fetch the page uses.
// Prices are paise end to end; the page formats them with formatPriceRange.

export type FeedSort = 'best' | 'nearest' | 'price'

export interface FeedCard {
  id: string
  name: string | null
  price_min: number | null
  price_max: number | null
  primary_photo_url: string
  distance_km: number | null
  retailer: { shop_name: string; slug: string | null; city: string | null }
}

export interface FeedMeta {
  total: number
  page: number
  limit: number
  location_scope: 'radius' | 'city' | 'nationwide'
  rationale_source: 'none'
}

export interface FeedRequest {
  sort: FeedSort
  page: number
  limit: number
  occasion?: string
  budget_max?: number
  size?: string
  lat?: number
  lng?: number
  radius_km?: number
}

export type FeedResult =
  | { kind: 'ok'; data: FeedCard[]; meta: FeedMeta }
  | { kind: 'unauthorized' }
  | { kind: 'error' }

/** Rejects on abort so the caller can ignore a superseded request (RC-014). */
export async function fetchFeed(req: FeedRequest, signal: AbortSignal): Promise<FeedResult> {
  const res = await fetch('/api/my-style/feed', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  })
  if (res.status === 401) return { kind: 'unauthorized' }
  if (!res.ok) return { kind: 'error' }
  const json = (await res.json()) as { data: FeedCard[]; meta: FeedMeta }
  return { kind: 'ok', data: json.data, meta: json.meta }
}
