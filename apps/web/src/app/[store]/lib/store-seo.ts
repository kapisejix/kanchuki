// Shared SEO helpers for the canonical storefront pages (/{store},
// /{store}/categories, /{store}/categories/[id], /{store}/{collection}).
// Keeps the LocalBusiness JSON-LD, description, and og:image fallbacks
// consistent across every storefront surface — one place to change when
// retailer fields evolve.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kanchuki.app';

export interface StoreSeoProfile {
  shop_name: string;
  city: string | null;
  state?: string | null;
  categories?: string[];
  logo_url?: string | null;
  banner_url?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  phone?: string | null;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// "Pooja Clothing Store in Pune, Maharashtra — Sarees, Kurtis, Suits..."
// Used for the <meta name="description"> and og:description on storefront pages.
export function buildStoreDescription(p: StoreSeoProfile): string {
  const location = [p.city, p.state].filter(Boolean).join(', ');
  const cats = (p.categories ?? []).filter(Boolean);
  const catStr =
    cats.length > 0
      ? ` — ${cats.slice(0, 6).map(titleCase).join(', ')}${cats.length > 6 ? ' and more' : ''}`
      : '';
  return `Visit ${p.shop_name}${location ? ` in ${location}` : ''}${catStr}. Browse the catalog and enquire on WhatsApp.`;
}

// og:image fallback chain: store logo → banner. Product-photo pages override
// with the product shot when they have one.
export function storeOgImage(p: StoreSeoProfile): string | null {
  return p.logo_url ?? p.banner_url ?? null;
}

// schema.org LocalBusiness (ClothingStore) JSON-LD for the store profile
// page. City/state/address feed Google's local-pack ranking without needing
// the city in the URL (which would break printed QR codes).
export function localBusinessLd(p: StoreSeoProfile, slug: string): Record<string, unknown> {
  const address: Record<string, string> = { '@type': 'PostalAddress' };
  const street = [p.address_line1, p.address_line2].filter(Boolean).join(', ');
  if (street) address.streetAddress = street;
  if (p.city) address.addressLocality = p.city;
  if (p.state) address.addressRegion = p.state;

  const image = [p.logo_url, p.banner_url].filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'ClothingStore',
    name: p.shop_name,
    url: `${SITE_URL}/${slug}`,
    ...(p.logo_url ? { logo: p.logo_url } : {}),
    ...(image.length > 0 ? { image } : {}),
    address,
    ...(p.phone ? { telephone: p.phone } : {}),
  };
}
