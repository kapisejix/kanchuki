import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sitemap, { generateSitemaps } from '../sitemap';

// The sitemap reads the API base from @/lib/apiUrl at request time; pin it so
// the outbound URL is deterministic (no reliance on real env vars in tests).
vi.mock('@/lib/apiUrl', () => ({
  API_URL: 'https://api.test.invalid',
}));

const fetchMock = vi.fn();

function retailer(public_slug: string, categories = 1, collections = 1) {
  return {
    public_slug,
    updated_at: '2026-08-10T10:00:00.000Z',
    categories: Array.from({ length: categories }, (_, i) => ({
      id: `${public_slug}-cat-${i}`,
      name: `Cat ${i}`,
    })),
    collections: Array.from({ length: collections }, (_, i) => `col-${i}`),
  };
}

function mockRetailers(payload: unknown) {
  // mockImplementation, not mockResolvedValue: generateSitemaps() AND each
  // sitemap({ id }) call refetch the same discovery endpoint, and a Response
  // body can only be consumed once — every call needs a fresh Response with
  // the same payload (mirrors Next's fetch cache within a revalidate window).
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ data: payload }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

describe('sitemap generateSitemaps + chunking', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits a single chunk when the entry count is below the chunk size', async () => {
    mockRetailers([retailer('store-a', 2, 2), retailer('store-b', 1, 1)]);

    const chunks = await generateSitemaps();
    // 2 static + (3 + 3) + (3 + 2) = 13 entries → 1 chunk.
    expect(chunks).toEqual([{ id: 0 }]);
  });

  it('splits across chunks once the entry count exceeds the chunk size', async () => {
    // Each store contributes 3 + categories + collections = 3 + 2 + 2 = 7
    // entries; 2,000 stores → 14,002 entries → 2 chunks (10,000 per file).
    const stores = Array.from({ length: 2000 }, (_, i) => retailer(`store-${i}`, 2, 2));
    mockRetailers(stores);

    const chunks = await generateSitemaps();
    expect(chunks).toEqual([{ id: 0 }, { id: 1 }]);

    const first = await sitemap({ id: 0 });
    const second = await sitemap({ id: 1 });
    // Chunk 0 starts with the static entries (home page first, then /terms).
    expect(first[0]?.url).toBe('https://kanchuki.app');
    expect(first[1]?.url).toBe('https://kanchuki.app/terms');
    expect(first).toHaveLength(10_000);
    expect(second.length).toBe(14_002 - 10_000);
    // No overlap, no gaps.
    const urls = new Set([...first, ...second].map((e) => e.url));
    expect(urls.size).toBe(14_002);
  });

  it('returns an empty sitemap for an out-of-range chunk id', async () => {
    mockRetailers([retailer('store-a')]);

    const outOfRange = await sitemap({ id: 99 });
    expect(outOfRange).toEqual([]);
  });

  it('degrades to static-only entries when the API is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const chunks = await generateSitemaps();
    expect(chunks).toEqual([{ id: 0 }]);

    const entries = await sitemap({ id: 0 });
    // Only the two static pages — a stale-but-valid sitemap beats a broken one.
    expect(entries).toHaveLength(2);
  });
});
