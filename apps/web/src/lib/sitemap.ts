import { API_URL } from '@/lib/apiUrl';

// Shared logic for the storefront sitemap route handlers:
//   apps/web/src/app/sitemap.xml/route.ts     (sitemap index)
//   apps/web/src/app/sitemap/[id]/route.ts    (one chunk per file)
//
// A custom route handler is used instead of the app/sitemap.ts file
// convention because Next 14.2's MetadataRoute.Sitemap serializer does NOT
// emit the Google image-sitemap extension — its <url> output is limited to
// loc/lastmod/changefreq/priority and silently drops any `images` field.
// These handlers write the XML directly, including
// <image:image><image:loc>/<image:title> so product photos on each store's
// category and All Products pages get indexed by Google Images.
//
// ISR: `export const revalidate` on the route handlers regenerates at most
// hourly on demand, so new stores/categories/photos appear without a web
// redeploy. On any API failure we degrade to static-only entries rather than
// an empty sitemap (a stale sitemap is better than a broken one).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kanchuki.app';

// Google's hard per-file ceiling is 50,000 URLs; chunk well under it so each
// sitemap stays small and the index never risks an invalid oversized file.
export const URLS_PER_SITEMAP = 10_000;

export const SITEMAP_REVALIDATE = 3600;

interface DiscoveryPhoto {
  url: string;
  name: string | null;
}

export interface DiscoveryCollectionProduct extends DiscoveryPhoto {
  id: string;
}

export interface DiscoveryCollection {
  slug: string;
  products: DiscoveryCollectionProduct[];
}

export interface DiscoveryRetailer {
  public_slug: string | null;
  updated_at: string;
  categories: Array<{ id: string; name: string; photos?: DiscoveryPhoto[] }>;
  // Discovery collections are objects once the API ships per-collection
  // products; the legacy pre-product payload returned plain slugs. The union
  // keeps the runtime guard honest during a rolling deploy.
  collections: Array<DiscoveryCollection | string>;
  product_photos?: DiscoveryPhoto[];
}

export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
  images?: DiscoveryPhoto[];
}

// Static pages that don't depend on store data.
export function staticEntries(): SitemapEntry[] {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.2,
    },
  ];
}

export async function fetchRetailers(): Promise<DiscoveryRetailer[]> {
  if (!API_URL) return [];
  try {
    const res = await fetch(`${API_URL}/v1/public/retailers`, {
      next: { revalidate: SITEMAP_REVALIDATE },
      // Hard cap: the discovery endpoint aggregates every live store. A slow
      // API must degrade the sitemap, never hang it.
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: DiscoveryRetailer[] };
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

// The complete ordered entry list — static pages first, then every store's
// storefront pages. Shared by the index (to count chunks) and each chunk (to
// slice one file), so both agree on boundaries from the same fetch-cached
// data. Google's image extension rides on the category and All Products
// entries — the pages that actually render those photos.
export async function buildAllEntries(): Promise<SitemapEntry[]> {
  const retailers = await fetchRetailers();

  const storeEntries = retailers.flatMap<SitemapEntry>((r) => {
    const slug = r.public_slug;
    if (!slug) return [];
    const lastModified = r.updated_at ? new Date(r.updated_at) : undefined;

    const hub: SitemapEntry[] = [
      {
        url: `${SITE_URL}/${slug}`,
        lastModified,
        changeFrequency: 'daily',
        priority: 0.9,
      },
      {
        url: `${SITE_URL}/${slug}/categories`,
        lastModified,
        changeFrequency: 'daily',
        priority: 0.8,
      },
      {
        // All Products — attach every store photo so Google indexes the
        // product images on this page.
        url: `${SITE_URL}/${slug}/all`,
        lastModified,
        changeFrequency: 'daily',
        priority: 0.8,
        images: r.product_photos?.length ? r.product_photos : undefined,
      },
      // Category pages — the deep-links Google's local pack surfaces, each
      // with its own product photos attached.
      ...r.categories.map(
        (c): SitemapEntry => ({
          url: `${SITE_URL}/${slug}/categories/${c.id}`,
          lastModified,
          changeFrequency: 'daily',
          priority: 0.7,
          images: c.photos?.length ? c.photos : undefined,
        }),
      ),
      // Collections — the links retailers share on WhatsApp — and each
      // collection's shared-product pages. Product entries carry the product
      // photo as a Google image extension (those pages lead with it), so the
      // product images on shared links get indexed by Google Images too.
      ...r.collections.flatMap((collection): SitemapEntry[] => {
        // Rolling-deploy tolerance: before the discovery API carried
        // per-collection products, `collections` was an array of plain slugs.
        // Keep emitting the collection page URL for those (product URLs
        // appear once the API catches up) — never emit malformed /undefined
        // URLs; a stale-but-valid sitemap beats a broken one.
        if (typeof collection === 'string') {
          if (collection.length === 0) return [];
          return [
            {
              url: `${SITE_URL}/${slug}/${collection}`,
              lastModified,
              changeFrequency: 'daily',
              priority: 0.6,
            },
          ];
        }
        if (!collection.slug) return [];
        return [
          {
            url: `${SITE_URL}/${slug}/${collection.slug}`,
            lastModified,
            changeFrequency: 'daily',
            priority: 0.6,
          },
          ...collection.products.map(
            (p): SitemapEntry => ({
              url: `${SITE_URL}/${slug}/${collection.slug}/product/${p.id}`,
              lastModified,
              changeFrequency: 'daily',
              priority: 0.5,
              images: [{ url: p.url, name: p.name }],
            }),
          ),
        ];
      }),
    ];
    return hub;
  });

  return [...staticEntries(), ...storeEntries];
}

// ─── XML serialization ──────────────────────────────────────────────────────
// All dynamic text (URLs, product names) is escaped — a & or < inside a
// product title would otherwise produce invalid XML and break the whole file.

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function serializeUrlset(entries: SitemapEntry[]): string {
  const hasImages = entries.some((e) => e.images?.length);
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${
      hasImages ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ''
    }>`,
  ];

  for (const item of entries) {
    const lines = ['  <url>', `    <loc>${escapeXml(item.url)}</loc>`];
    if (item.lastModified) {
      const iso =
        item.lastModified instanceof Date ? item.lastModified.toISOString() : item.lastModified;
      lines.push(`    <lastmod>${iso}</lastmod>`);
    }
    if (item.changeFrequency) lines.push(`    <changefreq>${item.changeFrequency}</changefreq>`);
    if (typeof item.priority === 'number') lines.push(`    <priority>${item.priority}</priority>`);
    for (const image of item.images ?? []) {
      lines.push('    <image:image>', `      <image:loc>${escapeXml(image.url)}</image:loc>`);
      if (image.name) lines.push(`      <image:title>${escapeXml(image.name)}</image:title>`);
      lines.push('    </image:image>');
    }
    lines.push('  </url>');
    parts.push(lines.join('\n'));
  }

  parts.push('</urlset>');
  return parts.join('\n');
}

// Sitemap index pointing at each chunk file (/sitemap/0, /sitemap/1, ...),
// with the index's own lastmod so crawlers can skip unchanged chunks.
export function serializeSitemapIndex(chunkCount: number, lastModified?: Date): string {
  const lastmod = lastModified ? `\n    <lastmod>${lastModified.toISOString()}</lastmod>` : '';
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (let i = 0; i < chunkCount; i++) {
    parts.push(
      '  <sitemap>',
      `    <loc>${escapeXml(`${SITE_URL}/sitemap/${i}`)}</loc>${lastmod}`,
      '  </sitemap>',
    );
  }
  parts.push('</sitemapindex>');
  return parts.join('\n');
}

// Shared XML response helper so both route handlers send the same headers.
export function xmlResponse(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Crawlers cache sitemaps independently of the ISR window.
      'Cache-Control': `public, s-maxage=${SITEMAP_REVALIDATE}`,
    },
  });
}
