// Shop-pin review: after a pin is captured (GPS or pasted Google Maps link) we reverse-geocode it,
// show the retailer the nearby address, and warn when it clearly disagrees with the address they
// typed. Never blocks: no typed address, or no reverse-geocode result, just means less to show.

import * as Location from 'expo-location'

export type TypedAddress = { pincode?: string | null; state?: string | null }
export type PinPlace = {
  name?: string | null
  street?: string | null
  district?: string | null
  city?: string | null
  subregion?: string | null
  region?: string | null
  postalCode?: string | null
}
export type PinReview = { place: PinPlace; address: string; warning: string | null }

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

/**
 * A warning message when the pinned place clearly disagrees with the typed address, else null.
 * Pincode is compared by its first 3 digits (the postal sector): 160022 vs 160020 are
 * neighbours in one city and fine; 110xxx vs 160xxx is Delhi vs Chandigarh and is not.
 * With no usable pincode on both sides it falls back to the state name.
 */
export function pinMismatch(place: PinPlace | undefined, typed: TypedAddress): string | null {
  if (!place) return null
  const typedPin = (typed.pincode ?? '').trim()
  const placePin = (place.postalCode ?? '').trim()
  if (/^\d{6}$/.test(typedPin) && /^\d{6}$/.test(placePin)) {
    return typedPin.slice(0, 3) === placePin.slice(0, 3)
      ? null
      : `Your pin is near pincode ${placePin}, but you entered ${typedPin}.`
  }
  const typedState = letters(typed.state ?? '')
  const placeState = letters(place.region ?? '')
  if (typedState && placeState && !typedState.includes(placeState) && !placeState.includes(typedState)) {
    return `Your pin is in ${place.region}, but you entered ${typed.state}.`
  }
  return null
}

/** "12, Sector 22, Chandigarh, Chandigarh 160022" — parts de-duplicated, empty parts dropped. */
export function formatPlace(place: PinPlace | undefined): string {
  if (!place) return ''
  const seen = new Set<string>()
  const parts = [place.name, place.street, place.district, place.city ?? place.subregion, place.region]
    .map((p) => (p ?? '').trim())
    .filter((p) => {
      const key = p.toLowerCase()
      if (!p || seen.has(key)) return false
      seen.add(key)
      return true
    })
  return [parts.join(', '), (place.postalCode ?? '').trim()].filter(Boolean).join(' ')
}

/** Reverse-geocodes the pin. Any failure (offline, no service, no result) → null. */
export async function reviewPin(lat: number, lng: number, typed: TypedAddress): Promise<PinReview | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })
    if (!place) return null
    return { place, address: formatPlace(place), warning: pinMismatch(place, typed) }
  } catch {
    return null
  }
}
