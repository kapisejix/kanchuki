// F-045 My Style: feed request/response shapes and the one fetch the page uses.
// Prices are paise end to end; the page formats them with formatPriceRange.

import type { GarmentDescriptor } from '@kanchuki/shared'
import { RETURN_TO_PARAM } from '@/lib/return-to'

export type FeedSort = 'best' | 'nearest' | 'price'

/** Where a signed-out shopper goes to log in and come straight back. */
export const LOGIN_HREF = `/login?${RETURN_TO_PARAM}=${encodeURIComponent('/my-style')}`

/** The saved selfie read + the colour families that suit it. Null until analysed. */
export interface StyleProfile {
  undertone: string
  depth: string
  frame: string | null
  palette: { good: string[]; avoid: string[] } | null
}

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
  style_profile: StyleProfile | null
  /** Set only on a find-similar feed: which signal ranked it and how many had an embedding. */
  similar?: { source: 'embedding' | 'attributes'; embedded: number; total: number } | null
  /** Which extra tabs have something behind them. Absent = hide Festival and Trending. */
  tabs?: { festival: { name: string } | null; trending: boolean }
  /** Occasion tab only: how many products carry the picked tag (null on other tabs). */
  occasion_matches?: number | null
}

export type FeedTab = 'foryou' | 'festival' | 'occasion' | 'trending'

export interface FeedRequest {
  sort: FeedSort
  tab?: FeedTab
  page: number
  limit: number
  occasion?: string
  budget_max?: number
  size?: string
  lat?: number
  lng?: number
  radius_km?: number
  /** Find similar: the descriptor from the garment analysis, held in page state only. */
  similar?: GarmentDescriptor
}

/** "yellow Kurti, Printed, Zari Work" - what the shopper sees as the thing being matched. */
export function describeGarment(g: GarmentDescriptor): string {
  return [`${g.color_family} ${g.category}`, g.pattern, ...g.embellishments]
    .filter(Boolean)
    .join(', ')
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

export interface LookSlotResult {
  key: string
  label: string
  items: FeedCard[]
}

export type LookResult =
  | {
      kind: 'ok'
      anchor: { id: string; name: string | null }
      slots: LookSlotResult[]
      /** 'none_nearby' = nothing mapped or nothing in range; the page says so, no filler. */
      reason: 'none_nearby' | null
    }
  | { kind: 'unavailable' } // the anchor was sold, deleted or its store went away
  | { kind: 'unauthorized' }
  | { kind: 'error' }

/** Complete the look (PR-10b). Rejects on abort so a superseded request can be ignored (RC-014). */
export async function fetchLook(
  anchor: string,
  where: { lat: number; lng: number; radius_km: number } | null,
  signal: AbortSignal,
): Promise<LookResult> {
  const qs = new URLSearchParams({ anchor })
  if (where) {
    qs.set('lat', String(where.lat))
    qs.set('lng', String(where.lng))
    qs.set('radius_km', String(where.radius_km))
  }
  const res = await fetch(`/api/my-style/complete-look?${qs}`, { credentials: 'include', signal })
  if (res.status === 401) return { kind: 'unauthorized' }
  if (res.status === 404) return { kind: 'unavailable' }
  if (!res.ok) return { kind: 'error' }
  const json = (await res.json()) as {
    data: { anchor: { id: string; name: string | null }; slots: LookSlotResult[] }
    meta: { reason: 'none_nearby' | null }
  }
  return { kind: 'ok', anchor: json.data.anchor, slots: json.data.slots, reason: json.meta.reason }
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
