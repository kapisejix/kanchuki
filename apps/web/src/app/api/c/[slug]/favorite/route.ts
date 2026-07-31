import { type NextRequest, NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const body: unknown = await request.json()

  try {
    await fetch(`${apiUrl}/v1/public/collections/${slug}/favorite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // Non-critical analytics — swallow error
  }

  return new NextResponse(null, { status: 204 })
}
