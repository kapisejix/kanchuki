import { type NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const body: unknown = await request.json()
  const apiUrl = process.env['API_URL'] ?? 'http://localhost:3001'

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
