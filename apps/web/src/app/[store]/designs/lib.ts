import { API_URL as apiUrl } from '@/lib/apiUrl';

// Public store profile shape — mirrors /v1/public/retailers/:slug (the subset
// the [store] pages render: shop name/city + logo/banner for OG fallbacks).
export interface StoreProfile {
  shop_name: string;
  city: string | null;
  state: string | null;
  address_line1: string | null;
  address_line2: string | null;
  categories: string[];
  logo_url: string | null;
  banner_url: string | null;
  storefront_slug: string | null;
}

// Same shape + revalidation as the [store] root page — the storefront pages
// agree on 60s so a store rename/suspension propagates quickly.
export async function fetchStoreProfile(store: string): Promise<StoreProfile | null> {
  try {
    const res = await fetch(`${apiUrl}/v1/public/retailers/${store}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: StoreProfile };
    return json.data;
  } catch {
    return null;
  }
}
