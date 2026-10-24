import { NextRequest } from 'next/server'
import { POST as enquire } from '@/app/api/c/[slug]/enquire/route'

// Store-URL twin of /api/c/{slug}/enquire — same API call, keyed on the collection segment.
// Adds `store` to the body so the API can resolve category / full-catalog pseudo-slugs
// (`cat-{id}`, `all-{store}`), which have no collection row of their own.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ store: string; collection: string }> },
) {
  const { store, collection } = await params
  const body: unknown = await request.json().catch(() => ({}))
  const forwarded = new NextRequest(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(body && typeof body === 'object' ? body : {}), store }),
  })
  return enquire(forwarded, { params: Promise.resolve({ slug: collection }) })
}
