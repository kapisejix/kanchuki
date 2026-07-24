import { type NextRequest, NextResponse } from 'next/server'

// Proxies paginated/filtered product-grid requests to the public collections
// API so the browser never needs the internal API_URL — same pattern as
// apps/web/src/app/api/c/[slug]/favorite/route.ts.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const apiUrl = process.env['API_URL'] ?? 'http://localhost:3001'
  const qs = request.nextUrl.search

  const res = await fetch(`${apiUrl}/v1/public/collections/${slug}${qs}`, {
    next: { revalidate: 0 },
  })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
