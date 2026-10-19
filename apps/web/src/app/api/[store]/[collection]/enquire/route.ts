import { type NextRequest } from 'next/server'
import { POST as enquire } from '@/app/api/c/[slug]/enquire/route'

// Store-URL twin of /api/c/{slug}/enquire — same API call, keyed on the collection segment.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ store: string; collection: string }> },
) {
  const { collection } = await params
  return enquire(request, { params: Promise.resolve({ slug: collection }) })
}
