// Google Places API (New) — shop lookup for Part A of
// docs/tasks/pending/google-business-profile-and-setup-checklist.md.
// Server key only; nothing from Google is passed through except id/name/address.
// No canned results: a missing key, a Google error or a timeout is reported as such.

import { Redis } from 'ioredis';
import { AppError } from '../plugins/error-handler.js';

const PLACES = 'https://places.googleapis.com/v1';
const TIMEOUT_MS = 8_000;
export const DAILY_SEARCH_LIMIT = 30;

export type PlaceHit = { place_id: string; name: string; address: string };

export function placesConfigured(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY;
}

function key(): string {
  const k = process.env.GOOGLE_PLACES_API_KEY;
  if (!k) throw new AppError('NOT_CONFIGURED', 'Google search is not available yet', 501);
  return k;
}

async function call(path: string, init: RequestInit, mask: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${PLACES}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key(),
        'X-Goog-FieldMask': mask,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('GOOGLE_UNAVAILABLE', 'Google did not respond. Try again.', 502);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new AppError('GOOGLE_UNAVAILABLE', 'Google search failed. Try again.', 502);
  return res.json();
}

type RawPlace = { id?: string; displayName?: { text?: string }; formattedAddress?: string };

export async function searchPlaces(
  query: string,
  near?: { latitude: number; longitude: number } | null,
): Promise<PlaceHit[]> {
  const body: Record<string, unknown> = { textQuery: query, regionCode: 'IN', maxResultCount: 5 };
  if (near) {
    body.locationBias = {
      circle: { center: { latitude: near.latitude, longitude: near.longitude }, radius: 20_000 },
    };
  }
  const data = (await call(
    '/places:searchText',
    { method: 'POST', body: JSON.stringify(body) },
    'places.id,places.displayName,places.formattedAddress',
  )) as { places?: RawPlace[] } | null;
  return (data?.places ?? [])
    .filter((p): p is RawPlace & { id: string } => !!p.id)
    .map((p) => ({
      place_id: p.id,
      name: p.displayName?.text ?? '',
      address: p.formattedAddress ?? '',
    }));
}

/** true = Google knows the id, false = it does not. Throws on provider failure. */
export async function placeExists(placeId: string): Promise<boolean> {
  const data = (await call(
    `/places/${encodeURIComponent(placeId)}`,
    { method: 'GET' },
    'id,displayName',
  )) as RawPlace | null;
  return !!data?.id;
}

// ─── Per-retailer daily search budget ───────────────────────────
const memCounts = new Map<string, number>();
export function __resetPlacesCounters(): void {
  memCounts.clear();
}

let client: Redis | null = null;
async function redis(): Promise<Redis> {
  client ??= new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 10_000,
  });
  if (client.status === 'ready') return client;
  const c = client;
  await new Promise<void>((resolve, reject) => {
    c.once('ready', () => resolve());
    c.once('error', reject);
  });
  return c;
}

/** Counts one search against the retailer's day; throws 429 past DAILY_SEARCH_LIMIT. */
export async function takeDailySearch(retailerId: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const k = `places:search:${day}:${retailerId}`;
  let n: number;
  if (process.env.VITEST === 'true') {
    n = (memCounts.get(k) ?? 0) + 1;
    memCounts.set(k, n);
  } else {
    const r = await redis();
    n = await r.incr(k);
    if (n === 1) await r.expire(k, 86_400);
  }
  if (n > DAILY_SEARCH_LIMIT) {
    throw new AppError('DAILY_LIMIT', 'Too many searches today. Paste your Place ID instead.', 429);
  }
}
