// Customer-facing URL builders.
//
// Canonical scheme (2026-08-09):
//   Store URL:      {WEB_URL}/{public_slug}          e.g. https://kanchuki.app/priya-cloth-house-x1a2b3
//   Collection URL: {WEB_URL}/{public_slug}/{slug}   e.g. https://kanchuki.app/priya-cloth-house-x1a2b3/festive-edit
//
// A retailer with no public_slug (never generated a store QR, or deleted it)
// has no store URL, so collection links fall back to the legacy /c/{slug}
// scheme — the web app keeps that route as a working legacy fallback.

const webBase = () => process.env.WEB_URL ?? '';

export function buildStoreUrl(publicSlug: string): string {
  return `${webBase()}/${publicSlug}`;
}

export function buildCollectionUrl(
  publicSlug: string | null | undefined,
  collectionSlug: string,
): string {
  return publicSlug
    ? `${webBase()}/${publicSlug}/${collectionSlug}`
    : `${webBase()}/c/${collectionSlug}`;
}

export function buildProductUrl(
  publicSlug: string | null | undefined,
  collectionSlug: string,
  productId: string,
): string {
  const base = publicSlug ? `${webBase()}/${publicSlug}` : `${webBase()}/c`;
  return `${base}/${collectionSlug}/product/${productId}`;
}
