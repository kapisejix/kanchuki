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

export type EnquiryResult =
  | { kind: 'ok'; url: string; recorded: boolean }
  | { kind: 'unauthorized' }
  | { kind: 'error' }

/** One store's picks -> one F-044 enquiry. Never throws; a timeout counts as an error (RC-011). */
export async function sendEnquiry(slug: string, productIds: string[]): Promise<EnquiryResult> {
  try {
    const res = await fetch('/api/my-style/enquire', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ retailer_slug: slug, product_ids: productIds }),
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 401) return { kind: 'unauthorized' }
    if (!res.ok) return { kind: 'error' }
    const json = (await res.json()) as { data?: { whatsapp_url?: string; recorded?: boolean } }
    const url = json.data?.whatsapp_url
    return url ? { kind: 'ok', url, recorded: json.data?.recorded === true } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

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
