import { API_URL } from '@/lib/apiUrl';
import type { MetadataRoute } from 'next';

// /sitemap.xml — App Router file convention (sitemap index when split).
// Enumerates every live store's storefront pages so Google can index each
// retailer's catalog without discovering links organically: store home,
// categories hub, All Products, every category page, and every active
// collection (the WhatsApp-shared links). Data comes from
// GET /v1/public/retailers — the public discovery endpoint that returns live
// retailers + their categories + collections in one request (cached
// server-side 60s).
//
// ISR: `revalidate` regenerates the sitemap at most hourly on demand, so new
// stores/categories/collections appear without a web redeploy. On any API
// failure we return just the static pages rather than an empty sitemap (a
// stale sitemap is better than a broken one — Google keeps the old copy).
//
// Splitting: past the Google limit of 50,000 URLs per sitemap file, the entry
// list is chunked via generateSitemaps() into /sitemap/N.xml files with a
// sitemap index at /sitemap.xml. generateSitemaps() and sitemap({id}) both
// derive their boundaries from the SAME buildAllEntries() result, so chunk
// counts and slices stay consistent within a revalidate window.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kanchuki.app';

// Google's hard per-file ceiling is 50,000 URLs; chunk well under it so each
// sitemap stays small and the index never risks an invalid oversized file.
const URLS_PER_SITEMAP = 10_000;

export const revalidate = 3600;

interface DiscoveryRetailer {
  public_slug: string | null;
  updated_at: string;
  categories: Array<{ id: string; name: string }>;
  collections: string[];
}

// Static pages that don't depend on store data.
function staticEntries(): MetadataRoute.Sitemap {
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

async function fetchRetailers(): Promise<DiscoveryRetailer[]> {
  if (!API_URL) return [];
  try {
    const res = await fetch(`${API_URL}/v1/public/retailers`, {
      next: { revalidate: 3600 },
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
// storefront pages. Shared by generateSitemaps() (to count chunks) and
// sitemap({ id }) (to slice one chunk), so both functions agree on boundaries
// from the same fetch-cached data.
async function buildAllEntries(): Promise<MetadataRoute.Sitemap> {
  const retailers = await fetchRetailers();

  const storeEntries = retailers.flatMap<MetadataRoute.Sitemap[number]>((r) => {
    const slug = r.public_slug;
    if (!slug) return [];
    const lastModified = r.updated_at ? new Date(r.updated_at) : undefined;

    const hub = [
      {
        url: `${SITE_URL}/${slug}`,
        lastModified,
        changeFrequency: 'daily' as const,
        priority: 0.9,
      },
      {
        url: `${SITE_URL}/${slug}/categories`,
        lastModified,
        changeFrequency: 'daily' as const,
        priority: 0.8,
      },
      {
        url: `${SITE_URL}/${slug}/all`,
        lastModified,
        changeFrequency: 'daily' as const,
        priority: 0.8,
      },
      // Category pages — the deep-links Google's local pack surfaces.
      ...r.categories.map((c) => ({
        url: `${SITE_URL}/${slug}/categories/${c.id}`,
        lastModified,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      })),
      // Collections — the links retailers share on WhatsApp.
      ...r.collections.map((collectionSlug) => ({
        url: `${SITE_URL}/${slug}/${collectionSlug}`,
        lastModified,
        changeFrequency: 'daily' as const,
        priority: 0.6,
      })),
    ];
    return hub;
  });

  return [...staticEntries(), ...storeEntries];
}

// Splits the full entry list into sitemap files, each under 10,000 URLs.
// Always returns at least one chunk ({id: 0}) so the index is never empty —
// the static pages alone are a valid single-chunk sitemap.
export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  const all = await buildAllEntries();
  const chunkCount = Math.max(1, Math.ceil(all.length / URLS_PER_SITEMAP));
  return Array.from({ length: chunkCount }, (_, i) => ({ id: i }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const all = await buildAllEntries();
  const start = id * URLS_PER_SITEMAP;
  // slice() is safe when id points past the end (data shrank between chunk
  // counting and serving) — returns an empty-but-valid sitemap, never throws.
  return all.slice(start, start + URLS_PER_SITEMAP);
}
