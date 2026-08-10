import { API_URL as apiUrl } from '@/lib/apiUrl';
import { type NextRequest, NextResponse } from 'next/server';

// Proxies paginated/filtered product-grid requests to the public collections
// API so the browser never needs the internal API_URL — same pattern as
// apps/web/src/app/api/c/[slug]/products/route.ts. The collection slug is the
// second URL segment; the store segment exists only for the canonical URL.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ store: string; collection: string }> },
) {
  const { collection } = await params;
  const qs = request.nextUrl.search;

  const res = await fetch(`${apiUrl}/v1/public/collections/${collection}${qs}`, {
    next: { revalidate: 0 },
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
