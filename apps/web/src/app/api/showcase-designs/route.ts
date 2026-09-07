import { type NextRequest, NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

// Proxies Suits Designs public reads to the API so the browser never needs the
// internal API_URL. Query passthrough covers all three public shapes:
//   ?product_id=<id>            — product-detail strip
//   ?store=<slug>[&category=]   — "View more" browse feed
// The storefront renders only what the public API returns (is_active rows,
// global + the queried store's rows), so no additional filtering here.
export async function GET(request: NextRequest) {
  const qs = request.nextUrl.search

  const res = await fetch(`${apiUrl}/v1/public/showcase-designs${qs}`, {
    next: { revalidate: 300 },
  })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
