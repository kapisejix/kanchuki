import { NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

// Proxies the retailer checkout-status check to the public API so the browser
// never needs the internal API_URL — same pattern as
// apps/web/src/app/api/c/[slug]/products/route.ts.
//
// Why a proxy: CollectionView previously fetched `/v1/public/checkout/...`
// as a relative URL on the web origin, which 404'd (the web app has no /v1
// routes or rewrites) — silently leaving checkoutEnabled=false and hiding
// "Add to Cart" for every retailer, checkout-enabled or not.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const res = await fetch(`${apiUrl}/v1/public/checkout/retailer-status/${slug}`, {
    // No caching — the flag flips when a retailer connects a payment account.
    next: { revalidate: 0 },
  })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    // no-store: this response drives a UI toggle (Add to Cart visibility) — a
    // browser-cached "checkout disabled" response would hide it even after the
    // retailer enables checkout.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
