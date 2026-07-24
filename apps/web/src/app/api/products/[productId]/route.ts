import { NextResponse } from 'next/server'

// Proxies a single full product detail (photos, spin frames, variants) fetch
// to the public API — called when the customer opens a product from the grid.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params
  const apiUrl = process.env['API_URL'] ?? 'http://localhost:3001'

  const res = await fetch(`${apiUrl}/v1/public/products/${productId}`, {
    next: { revalidate: 60 },
  })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
