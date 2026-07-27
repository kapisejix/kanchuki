/**
 * image-prefetch — store product images in expo-image's persistent disk cache.
 *
 * When the retailer's catalog loads, prefetch the primary photo of each product
 * into expo-image's disk cache (LRU, survives app restarts).  On subsequent
 * opens — including offline — the images render instantly from cache without
 * any network call.
 *
 * expo-image is already installed in the mobile package:
 *   "expo-image": "~3.0.11"
 *
 * Usage (in catalog.tsx after products query succeeds):
 *   prefetchProductImages(products)
 */

import { Image } from 'expo-image'

/**
 * Prefetch the primary photo of the first `limit` products.
 * Fire-and-forget — call with void, failures are silently swallowed.
 *
 * @param products  Array of products with a primary_photo_url field.
 * @param limit     Max images to prefetch per call (default 40).
 *                  Keep this modest — prefetching 200 images at once would
 *                  flood the network on first catalog load.
 */
export async function prefetchProductImages(
  products: Array<{ primary_photo_url?: string | null }>,
  limit = 40,
): Promise<void> {
  const urls = products
    .slice(0, limit)
    .map((p) => p.primary_photo_url)
    .filter((u): u is string => typeof u === 'string' && u.startsWith('http'))

  if (urls.length === 0) return

  await Image.prefetch(urls, { cachePolicy: 'disk' })
}

/**
 * Evict all prefetched images from expo-image's disk cache.
 * Useful on logout / account switch to avoid showing another retailer's
 * catalog photos offline.
 */
export async function clearImageCache(): Promise<void> {
  await Image.clearDiskCache()
}
