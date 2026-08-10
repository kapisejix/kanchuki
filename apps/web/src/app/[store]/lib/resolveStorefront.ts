import { API_URL as apiUrl } from '@/lib/apiUrl';
import type { PublicCollection } from '@kanchuki/shared';

// The wishlist/cart/checkout/order sub-flow pages are linked from
// CollectionView with a "listing identifier" — a real collection slug, or a
// pseudo-slug derived from the browse page the customer was on:
//   category products:  `cat-{categoryId}`   (from /[store]/categories/[id])
//   full catalog:       `all-{publicSlug}`   (from /[store]/all)
// Pseudo-slugs never resolve as a collection, so the sub-flow routes must
// resolve the actual storefront data from the store's public_slug instead of
// 404ing (this was the "Selected button opens a 404" bug on browse pages).

export interface StorefrontResolution {
  // Listing data shaped like a PublicCollection — real collection for
  // collection pages, the category's products or the full catalog otherwise.
  collection: PublicCollection;
  // The correct "back to catalog / browse" target for THIS listing (never the
  // pseudo-slug URL, which has no page behind it).
  backHref: string;
  // The slug scoping wishlist/cart localStorage. Deliberately unchanged from
  // what CollectionView used when the customer hearted/added items, so saved
  // state still matches.
  key: string;
}

function parsePseudoSlug(slug: string): { kind: 'category'; id: string } | { kind: 'all' } | null {
  if (slug.startsWith('cat-')) return { kind: 'category', id: slug.slice(4) };
  if (slug.startsWith('all-')) return { kind: 'all' };
  return null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function resolveStorefront(
  store: string,
  slug: string,
): Promise<StorefrontResolution | null> {
  // Real collection slug first — preserves existing behavior exactly for
  // collection pages (and wins if a real collection ever shares a pseudo
  // prefix, which is the more correct resolution anyway).
  const real = await fetchJson<{ data: PublicCollection }>(
    `${apiUrl}/v1/public/collections/${slug}`,
  );
  if (real?.data) {
    return { collection: real.data, backHref: `/${store}/${slug}`, key: slug };
  }

  const pseudo = parsePseudoSlug(slug);

  if (pseudo?.kind === 'category') {
    const data = await fetchJson<{ data: PublicCollection }>(
      `${apiUrl}/v1/public/retailers/${store}/categories/${pseudo.id}`,
    );
    if (!data?.data) return null;
    return {
      collection: data.data,
      backHref: `/${store}/categories/${pseudo.id}`,
      key: slug,
    };
  }

  if (pseudo?.kind === 'all') {
    const data = await fetchJson<{ data: PublicCollection }>(
      `${apiUrl}/v1/public/retailers/${store}/products`,
    );
    if (!data?.data) return null;
    return { collection: data.data, backHref: `/${store}/all`, key: slug };
  }

  return null;
}
