import type { PublicProduct } from '@kanchuki/shared';

export interface PickedForYouResponse {
  personalized: boolean;
  products: PublicProduct[];
}

export async function fetchPickedForYou(
  storeSlug: string,
  visitProductIds: string[],
): Promise<PickedForYouResponse | null> {
  if (!storeSlug) return null;
  try {
    const response = await fetch('/api/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ slug: storeSlug, visit_product_ids: visitProductIds }),
    });
    if (!response.ok) return null;
    const json: unknown = await response.json();
    if (!json || typeof json !== 'object' || !('data' in json)) return null;
    const data = json.data;
    if (
      !data ||
      typeof data !== 'object' ||
      !('products' in data) ||
      !Array.isArray(data.products) ||
      !('personalized' in data) ||
      typeof data.personalized !== 'boolean'
    ) {
      return null;
    }
    return data as PickedForYouResponse;
  } catch {
    return null;
  }
}
