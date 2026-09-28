import { API_URL as apiUrl } from '@/lib/apiUrl';
import { type NextRequest, NextResponse } from 'next/server';

// Proxies the social-proof chip counts (F-037 §2 row 5) to the public API so the
// browser never needs the internal API_URL — same pattern as
// apps/web/src/app/api/showcase-designs/route.ts. One request per collection
// load covers every product card on the page (the API answers for the whole
// store at once), so there is deliberately no per-product variant of this route.
export async function GET(request: NextRequest) {
  const qs = request.nextUrl.search;

  const res = await fetch(`${apiUrl}/v1/public/engagement-chips${qs}`, {
    next: { revalidate: 300 },
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
