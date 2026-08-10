import { API_URL as apiUrl } from '@/lib/apiUrl';
import type { PublicProductDetail } from '@kanchuki/shared';

// Server-side fetch of a single full product detail (photos, spin frames,
// variants) — used by the shared product page ([store]/[collection]/product/
// [productId] and its legacy /c/[slug]/product/[productId] twin) to render
// the product + its WhatsApp/OG link preview. Same pattern as fetchCollection.
export async function fetchProductDetail(productId: string): Promise<PublicProductDetail | null> {
  try {
    const res = await fetch(`${apiUrl}/v1/public/products/${productId}`, {
      next: { revalidate: 60 }, // ISR — revalidate every 60s
    });
    if (!res.ok) {
      console.error(`fetchProductDetail(${productId}): API returned ${res.status} from ${apiUrl}`);
      return null;
    }
    const json = (await res.json()) as { data: PublicProductDetail };
    return json.data;
  } catch (err) {
    console.error(`fetchProductDetail(${productId}): request to ${apiUrl} failed —`, err);
    return null;
  }
}
