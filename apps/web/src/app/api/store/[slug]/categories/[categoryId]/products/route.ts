import { type NextRequest, NextResponse } from 'next/server'

// Proxies paginated/filtered product-grid requests for a category listing to
// the public categories API — mirrors apps/web/src/app/api/c/[slug]/products/route.ts.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoryId: string }> },
) {
  const { slug, categoryId } = await params
  const apiUrl = process.env['API_URL'] ?? 'http://localhost:3001'
  const qs = request.nextUrl.search

  const res = await fetch(`${apiUrl}/v1/public/retailers/${slug}/categories/${categoryId}${qs}`, {
    next: { revalidate: 0 },
  })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
