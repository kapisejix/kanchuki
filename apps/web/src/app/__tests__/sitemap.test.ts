import type { DiscoveryCollection, DiscoveryRetailer } from '@/lib/sitemap';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getIndex } from '../sitemap.xml/route';
import { GET as getChunk } from '../sitemap/[id]/route';

// The sitemap reads the API base from @/lib/apiUrl at request time; pin it so
// the outbound URL is deterministic (no reliance on real env vars in tests).
vi.mock('@/lib/apiUrl', () => ({
  API_URL: 'https://api.test.invalid',
}));

const fetchMock = vi.fn();

function retailer(public_slug: string, categories = 1, collections = 1): DiscoveryRetailer {
  return {
    public_slug,
    updated_at: '2026-08-10T10:00:00.000Z',
    categories: Array.from({ length: categories }, (_, i) => ({
      id: `${public_slug}-cat-${i}`,
      name: `Cat ${i}`,
      photos: [{ url: `https://img.test/${public_slug}-cat-${i}-1.jpg`, name: 'Kurti & Dupatta' }],
    })),
    collections: Array.from({ length: collections }, (_, i) => ({
      slug: `col-${i}`,
      products: [
        {
          id: `${public_slug}-prod-${i}`,
          name: `Product ${i}`,
          url: `https://img.test/${public_slug}-col-${i}-prod.jpg`,
        },
      ],
    })),
    product_photos: [
      { url: `https://img.test/${public_slug}-all-1.jpg`, name: 'All Products Shot' },
    ],
  };
}

function mockRetailers(payload: unknown) {
  // mockImplementation, not mockResolvedValue: the index AND each chunk route
  // refetch the same discovery endpoint, and a Response body can only be
  // consumed once — every call needs a fresh Response with the same payload
  // (mirrors Next's fetch cache within a revalidate window).
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ data: payload }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

async function indexBody() {
  const res = await getIndex();
  return res.text();
}

async function chunkBody(id: string) {
  const res = await getChunk(new Request('https://kanchuki.app/sitemap/0'), {
    params: Promise.resolve({ id }),
  });
  return res.text();
}

describe('sitemap route handlers', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves a plain urlset when everything fits in one chunk', async () => {
    mockRetailers([retailer('store-a', 2, 2), retailer('store-b', 1, 1)]);

    const xml = await indexBody();
    // 2 static + (3 + 2 + 2 + 2) + (3 + 1 + 1 + 1) = 17 entries (each store
    // adds its category pages, collection page AND collection product pages)
    // → single urlset, no index.
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).not.toContain('<sitemapindex');
    expect(xml).toContain('<loc>https://kanchuki.app/store-a/all</loc>');
    expect(xml).toContain('<loc>https://kanchuki.app/store-b/categories</loc>');
    expect(xml).toContain('</urlset>');
  });

  it('emits a sitemap index pointing at chunk files past the chunk size', async () => {
    // Each store contributes 3 + categories + (collections + products) =
    // 3 + 2 + 2 + 2 = 9 entries; 2,000 stores → 18,002 entries → 2 chunks
    // (10,000 per file).
    const stores = Array.from({ length: 2000 }, (_, i) => retailer(`store-${i}`, 2, 2));
    mockRetailers(stores);

    const xml = await indexBody();
    expect(xml).toContain('<sitemapindex');
    expect(xml).toContain('<loc>https://kanchuki.app/sitemap/0</loc>');
    expect(xml).toContain('<loc>https://kanchuki.app/sitemap/1</loc>');
    expect(xml).not.toContain('<loc>https://kanchuki.app/sitemap/2</loc>');

    const first = await chunkBody('0');
    const second = await chunkBody('1');
    // Chunk 0 starts with the static entries (home page first, then /terms).
    expect(first).toContain('<loc>https://kanchuki.app</loc>');
    expect(first).toContain('<loc>https://kanchuki.app/terms</loc>');
    // Each chunk is a well-formed urlset; combined they cover every URL.
    const urlsFirst = (first.match(/<loc>/g) ?? []).length;
    const urlsSecond = (second.match(/<loc>/g) ?? []).length;
    expect(urlsFirst).toBe(10_000);
    expect(urlsFirst + urlsSecond).toBe(18_002);
  });

  it('attaches Google image extensions to category, All Products, and product entries', async () => {
    mockRetailers([retailer('store-a', 2, 1)]);

    const xml = await indexBody();

    // All Products entry carries its store-wide photos.
    expect(xml).toContain('<image:loc>https://img.test/store-a-all-1.jpg</image:loc>');
    expect(xml).toContain('<image:title>All Products Shot</image:title>');
    // Category entry carries its own photos.
    expect(xml).toContain('<image:loc>https://img.test/store-a-cat-0-1.jpg</image:loc>');
    // Shared-product URLs carry the product photo as an image extension.
    expect(xml).toContain('<loc>https://kanchuki.app/store-a/col-0/product/store-a-prod-0</loc>');
    expect(xml).toContain('<image:loc>https://img.test/store-a-col-0-prod.jpg</image:loc>');
    expect(xml).toContain('<image:title>Product 0</image:title>');
    // The image namespace is declared when any image is present.
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
  });

  it('tolerates the pre-product discovery payload (string collection slugs)', async () => {
    // Rolling-deploy guard: if the API hasn't shipped the per-collection
    // product shape yet, plain-slug collections must be skipped, not turned
    // into /undefined product URLs.
    const store = retailer('store-a', 1, 1);
    // Legacy payload: collections was an array of plain slugs.
    store.collections = ['col-old'];
    mockRetailers([store]);

    const xml = await indexBody();
    expect(xml).not.toContain('undefined');
    // The legacy string slug still yields the collection page URL (product
    // URLs appear once the API ships the new shape) and the rest of the
    // storefront entries still render.
    expect(xml).toContain('<loc>https://kanchuki.app/store-a/col-old</loc>');
    expect(xml).toContain('<loc>https://kanchuki.app/store-a/all</loc>');
    expect(xml).not.toContain('/product/');
  });

  it('XML-escapes product names and URLs', async () => {
    const store = retailer('store-a', 1, 1);
    store.categories[0].photos = [
      { url: 'https://img.test/a&b.jpg?x=1&y=2', name: 'Kurti <Super> & "Saree"' },
    ];
    // The fixture always produces an object for index 0 (union-typed because
    // the legacy payload could be a plain slug).
    (store.collections[0] as DiscoveryCollection).products = [
      {
        id: 'prod-esc',
        name: 'Kurti <Super> & "Saree"',
        url: 'https://img.test/a&b.jpg?x=1&y=2',
      },
    ];
    mockRetailers([store]);

    const xml = await indexBody();
    expect(xml).toContain('<image:loc>https://img.test/a&amp;b.jpg?x=1&amp;y=2</image:loc>');
    expect(xml).toContain('<image:title>Kurti &lt;Super&gt; &amp; &quot;Saree&quot;</image:title>');
    // Product URLs are escaped the same way (URLs and names in <loc>/<image:loc>).
    expect(xml).toContain('<loc>https://kanchuki.app/store-a/col-0/product/prod-esc</loc>');
  });

  it('serves the chunk for a legacy .xml-suffixed chunk URL', async () => {
    const stores = Array.from({ length: 2000 }, (_, i) => retailer(`store-${i}`, 2, 2));
    mockRetailers(stores);

    // Old generateSitemaps chunk URLs were /sitemap/{id}.xml — those must
    // keep resolving to real data, not an empty urlset.
    const xml = await chunkBody('0.xml');
    expect(xml).toContain('<loc>https://kanchuki.app</loc>');
    expect(xml.match(/<loc>/g) ?? []).toHaveLength(10_000);
  });

  it('returns an empty-but-valid urlset for an out-of-range chunk id', async () => {
    mockRetailers([retailer('store-a')]);

    const xml = await chunkBody('99');
    expect(xml).toContain('<urlset');
    expect(xml).toContain('</urlset>');
    expect(xml.match(/<url>/g)).toBeNull();
  });

  it('degrades to static-only entries when the API is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const xml = await indexBody();
    // Only the two static pages — a stale-but-valid sitemap beats a broken one.
    expect(xml).toContain('<loc>https://kanchuki.app</loc>');
    expect(xml).toContain('<loc>https://kanchuki.app/terms</loc>');
    expect(xml).not.toContain('store-');
  });
});
