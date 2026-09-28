import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPickedForYou } from '../pickedForYou';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchPickedForYou', () => {
  it('requests recommendations for the named store with its tab visit IDs and no cache', async () => {
    const product = { id: 'store-a-pick' };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { personalized: true, products: [product] } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPickedForYou('store-a', ['visited-a'])).resolves.toEqual({
      personalized: true,
      products: [product],
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ slug: 'store-a', visit_product_ids: ['visited-a'] }),
    });
  });

  it('does not request a store when no public slug is available', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPickedForYou('', [])).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null for HTTP, malformed-envelope, and network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    await expect(fetchPickedForYou('store-a', [])).resolves.toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ data: { products: 'bad' } }) })),
    );
    await expect(fetchPickedForYou('store-a', [])).resolves.toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(fetchPickedForYou('store-a', [])).resolves.toBeNull();
  });
});
