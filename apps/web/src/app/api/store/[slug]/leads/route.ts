import { type NextRequest, NextResponse } from 'next/server'
import { API_URL } from '@/lib/apiUrl'

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const body: unknown = await request.json()

  try {
    const res = await fetch(`${API_URL}/v1/public/retailers/${slug}/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the passport session cookie — the API's passport path
        // derives the shopper identity from it, not from the request body.
        cookie: request.headers.get('cookie') ?? '',
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'PROXY_ERROR', message: err instanceof Error ? err.message : 'Request failed', status: 500 } },
      { status: 500 },
    )
  }
}
