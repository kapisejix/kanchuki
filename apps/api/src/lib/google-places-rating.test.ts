/**
 * getPlaceRating: the shop's public Google rating for the storefront. Hidden (null) whenever it
 * cannot be shown honestly: no key, Google error, unknown place, implausible numbers. Never throws,
 * never invents a rating, and a failing Google must not be hit again on every page view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPlacesCounters, getPlaceRating } from './google-places.js';

type Reply = { status: number; body?: unknown };
let calls: { url: string; mask: string | null }[];

function stubGoogle(reply: Reply | (() => Reply)) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, mask: headers['X-Goog-FieldMask'] ?? null });
      const r = typeof reply === 'function' ? reply() : reply;
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
    }),
  );
}

beforeEach(() => {
  __resetPlacesCounters();
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(process.env, 'GOOGLE_PLACES_API_KEY');
});

describe('getPlaceRating', () => {
  it('no API key → null and Google is never called', async () => {
    Reflect.deleteProperty(process.env, 'GOOGLE_PLACES_API_KEY');
    stubGoogle({ status: 200, body: { rating: 4.6, userRatingCount: 10 } });
    expect(await getPlaceRating('ChIJabc')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('asks only for rating + userRatingCount and returns them', async () => {
    stubGoogle({ status: 200, body: { rating: 4.6, userRatingCount: 123 } });
    expect(await getPlaceRating('ChIJabc')).toEqual({ rating: 4.6, count: 123 });
    expect(calls[0]?.url).toContain('/places/ChIJabc');
    expect(calls[0]?.mask).toBe('rating,userRatingCount');
  });

  it('encodes the place id in the path', async () => {
    stubGoogle({ status: 200, body: { rating: 4, userRatingCount: 2 } });
    await getPlaceRating('a/b?c');
    expect(calls[0]?.url).toContain('/places/a%2Fb%3Fc');
  });

  it('serves repeat views from cache: one Google call', async () => {
    stubGoogle({ status: 200, body: { rating: 4.2, userRatingCount: 50 } });
    await getPlaceRating('ChIJabc');
    await getPlaceRating('ChIJabc');
    expect(calls).toHaveLength(1);
  });

  it('a Google error → null, no throw, and no retry storm on the next views', async () => {
    stubGoogle({ status: 500 });
    expect(await getPlaceRating('ChIJabc')).toBeNull();
    expect(await getPlaceRating('ChIJabc')).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('a network failure → null, no throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    expect(await getPlaceRating('ChIJabc')).toBeNull();
  });

  it('unknown place (404) → null', async () => {
    stubGoogle({ status: 404 });
    expect(await getPlaceRating('ChIJnope')).toBeNull();
  });

  it('a place with no ratings, or implausible numbers → null, never "0 ★"', async () => {
    for (const body of [
      {},
      { rating: 4.5 },
      { userRatingCount: 9 },
      { rating: 0, userRatingCount: 5 },
      { rating: 7, userRatingCount: 5 },
      { rating: 4.5, userRatingCount: 0 },
      { rating: '4.5', userRatingCount: 5 },
      { rating: 4.5, userRatingCount: 2.5 },
    ]) {
      __resetPlacesCounters();
      stubGoogle({ status: 200, body });
      expect(await getPlaceRating('ChIJabc'), JSON.stringify(body)).toBeNull();
    }
  });
});
