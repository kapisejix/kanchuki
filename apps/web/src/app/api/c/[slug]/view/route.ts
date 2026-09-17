import { type NextRequest, NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

// POST /api/c/{slug}/view — the legacy-URL twin of ../[store]/[collection]/view.
//
// CollectionView falls back to this base path when it has no store segment
// (`apiBasePath = store ? '/api/{store}/{slug}' : '/api/c/{slug}'`), so the
// legacy /c/{slug} pages need it too. See that route for the full reasoning and
// RC-025 for why it did not exist until now.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const body: unknown = await request.json().catch(() => ({}))

  try {
    await fetch(`${apiUrl}/v1/public/collections/${slug}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // Non-critical analytics — swallow error
  }

  return new NextResponse(null, { status: 204 })
}
