'use client'

// Shared by the /stores directory and the homepage store teaser: the store
// card data shape, the segment → label map, and the browser-location hook.
import { useCallback, useEffect, useState } from 'react'

export interface StoreCardData {
  public_slug: string
  shop_name: string
  city: string | null
  address: string | null
  logo_url: string | null
  product_count: number
  is_featured: boolean
  store_types: string[]
  /** null unless the list was fetched with the shopper's coordinates */
  distance_km: number | null
}

/** Store type = product audience segment. Only segments are shown. */
export const SEGMENT_LABEL: Record<string, string> = {
  LADIES: 'Ladies',
  MEN: 'Gents',
  KIDS: 'Kids',
}

export type Coords = { lat: number; lng: number }
export type LocationStatus = 'idle' | 'asking' | 'granted' | 'denied'

export function useUserLocation() {
  const [status, setStatus] = useState<LocationStatus>('idle')
  const [coords, setCoords] = useState<Coords | null>(null)

  // Must run from a tap: browsers reject/ignore permission prompts without a
  // user gesture, and an unprompted popup on page load reads as spam.
  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('denied')
      return
    }
    setStatus('asking')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setStatus('granted')
      },
      () => setStatus('denied'),
      { timeout: 10_000, maximumAge: 5 * 60_000 },
    )
  }, [])

  // Already allowed on an earlier visit → no prompt, so resolve straight away.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((p) => {
        if (p.state === 'granted') request()
      })
      .catch(() => {})
  }, [request])

  return { status, coords, request }
}

/** `lat`/`lng` query params for a granted location, else nothing. */
export function locationParams(coords: Coords | null): Record<string, string> {
  return coords ? { lat: String(coords.lat), lng: String(coords.lng) } : {}
}
