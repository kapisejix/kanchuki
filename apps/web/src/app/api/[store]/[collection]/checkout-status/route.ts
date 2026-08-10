import { API_URL as apiUrl } from '@/lib/apiUrl';
import { NextResponse } from 'next/server';

// Proxies the retailer checkout-status check to the public API so the browser
// never needs the internal API_URL — same pattern as the legacy
// apps/web/src/app/api/c/[slug]/checkout-status/route.ts.
//
// Uses the store's public_slug (not the collection/pseudo slug): the API
// resolves retailers by public_slug, which works for every storefront page —
// real collections AND category / All Products browse pages whose pseudo-slug
// (cat-… / all-…) never resolves as a collection.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ store: string; collection: string }> },
) {
  const { store } = await params;

  const res = await fetch(`${apiUrl}/v1/public/checkout/retailer-status/${store}`, {
    // No caching — the flag flips when a retailer connects a payment account.
    next: { revalidate: 0 },
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    // no-store: this response drives a UI toggle (Add to Cart visibility) — a
    // browser-cached "checkout disabled" response would hide it even after the
    // retailer enables checkout.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
