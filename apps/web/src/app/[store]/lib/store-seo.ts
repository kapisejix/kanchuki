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

interface LdProduct {
  id: string;
  name: string | null;
  subtype?: string | null;
  category?: string | null;
  primary_photo_url?: string | null;
  price_min: number | null; // paise
  price_max: number | null; // paise
  status?: string;
}

const productName = (p: LdProduct) => p.name ?? p.subtype ?? p.category ?? 'Product';
const rupeesStr = (paise: number) => (paise / 100).toFixed(2);

// schema.org Product JSON-LD for a shared product page. Offer is emitted only
// when there is a price (Google rejects a Product offer without one).
export function productLd(p: LdProduct, shopName: string, url: string): Record<string, unknown> {
  const low = p.price_min ?? p.price_max;
  const high = p.price_max ?? p.price_min;
  const availability =
    p.status === 'SOLD' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock';
  const offers =
    low == null
      ? undefined
      : low === high
        ? { '@type': 'Offer', price: rupeesStr(low), priceCurrency: 'INR', availability, url }
        : {
            '@type': 'AggregateOffer',
            lowPrice: rupeesStr(low),
            highPrice: rupeesStr(high as number),
            priceCurrency: 'INR',
            availability,
            url,
          };
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: productName(p),
    ...(p.primary_photo_url ? { image: [p.primary_photo_url] } : {}),
    ...(p.category ? { category: p.category } : {}),
    brand: { '@type': 'Brand', name: shopName },
    ...(offers ? { offers } : {}),
  };
}

// schema.org ItemList JSON-LD for a collection page — one ListItem per product
// on the rendered page, each pointing at its shared product URL.
export function itemListLd(
  title: string,
  products: LdProduct[],
  productUrl: (id: string) => string,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: productUrl(p.id),
      name: productName(p),
    })),
  };
}

/** Safe inline JSON-LD: `<` escaped so a product name can never close the script tag. */
export const ldJson = (data: Record<string, unknown>) =>
  JSON.stringify(data).replace(/</g, String.raw`\u003c`);
