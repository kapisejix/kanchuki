import { type NextRequest, NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

// POST /api/c/{slug}/enquire — F-044 "Send my picks to the store".
// Unlike the sibling view ping, the caller READS this answer (whatsapp_url on
// 200; any non-200 — pseudo-slug 404, 422 for a since-deleted product — sends it
// to the client-built wa.me fallback), so status + JSON pass straight through.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const body: unknown = await request.json().catch(() => ({}))

  try {
    const res = await fetch(`${apiUrl}/v1/public/collections/${encodeURIComponent(slug)}/enquire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
