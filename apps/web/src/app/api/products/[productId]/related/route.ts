import { NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

// Proxies related products fetch to the public API — returns up to 6 products
// from the same category, same retailer, excluding the current product.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params

  const res = await fetch(`${apiUrl}/v1/public/products/${productId}/related`, {
    next: { revalidate: 60 },
  })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
