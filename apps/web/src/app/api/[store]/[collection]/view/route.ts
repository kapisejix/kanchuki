import { type NextRequest, NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

// POST /api/{store}/{collection}/view — fire-and-forget view tracking.
//
// Proxies to the API's POST /v1/public/collections/:slug/view, which writes a
// CollectionView row that the retailer dashboard's "Views" stat counts
// (retailers-stats.ts → prisma.collectionView.count). The storefront has always
// fired this call — with a comment saying exactly that — but the proxy between
// it and the API never existed, so every web view 404'd and none of them were
// ever counted (RC-025).
//
// Mirrors ./favorite/route.ts: the caller ignores the response entirely, so the
// answer is a bare 204 and an upstream failure is swallowed rather than surfaced
// as a broken storefront.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ store: string; collection: string }> },
) {
  const { collection } = await params
  // Tolerated rather than assumed: a bodyless POST is valid here (every field
  // the API takes is optional), and `request.json()` throws on an empty body.
  const body: unknown = await request.json().catch(() => ({}))

  try {
    await fetch(`${apiUrl}/v1/public/collections/${collection}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // Non-critical analytics — swallow error
  }

  return new NextResponse(null, { status: 204 })
}
