// Approximate geocoding of a retailer's typed address for the one-off location backfill
// (scripts/backfill-retailer-location.ts). OpenStreetMap Nominatim, India only.
//
// The result is a GUESS (street, pincode or city level), never a shop pin. Callers must store it
// as location_source = 'GEOCODED_APPROX' so a retailer's own pin can replace it.

import { isInIndia } from './geo.js';

export type AddressParts = {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
};

export type GeocodeLevel = 'address' | 'pincode' | 'city';
export type GeocodeQuery = { level: GeocodeLevel; q: string };
export type GeocodeHit = { lat: number; lng: number; level: GeocodeLevel; display: string };

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Queries most specific first. Empty when there is nothing usable to search for. */
export function buildQueries(a: AddressParts): GeocodeQuery[] {
  const pin = /^\d{6}$/.test(clean(a.pincode)) ? clean(a.pincode) : '';
  const city = clean(a.city);
  const state = clean(a.state);
  const street = [clean(a.address_line1), clean(a.address_line2)].filter(Boolean).join(', ');
  const out: GeocodeQuery[] = [];
  if (street && (city || pin)) {
    out.push({
      level: 'address',
      q: [street, city, state, pin, 'India'].filter(Boolean).join(', '),
    });
  }
  if (pin) out.push({ level: 'pincode', q: `${pin}, India` });
  if (city) out.push({ level: 'city', q: [city, state, 'India'].filter(Boolean).join(', ') });
  return out;
}

/** First Nominatim result that lands inside India, else null. */
export function parseNominatim(json: unknown, level: GeocodeLevel): GeocodeHit | null {
  if (!Array.isArray(json)) return null;
  for (const r of json as Record<string, unknown>[]) {
    const lat = Number(r?.lat);
    const lng = Number(r?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng) && isInIndia(lat, lng)) {
      return { lat, lng, level, display: String(r?.display_name ?? '') };
    }
  }
  return null;
}

/** Tries each query in order; politeness: one request per second (Nominatim usage policy). */
export async function geocodeAddress(
  a: AddressParts,
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<GeocodeHit | null> {
  for (const { level, q } of buildQueries(a)) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=in&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'Kanchuki-location-backfill/1.0 (admin one-off)' },
      signal: AbortSignal.timeout(15_000),
    });
    await sleep(1100);
    if (!res.ok) continue;
    const hit = parseNominatim(await res.json(), level);
    if (hit) return hit;
  }
  return null;
}
