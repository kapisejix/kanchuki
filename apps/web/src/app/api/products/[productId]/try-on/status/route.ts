import { type NextRequest, NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

// Proxy the customer's try-on status poll. Plain JSON GET, so the passport
// proxy's simple forwarder shape applies — cookies only, no body.
//
// `processing | ready | failed | withdrawn` come straight from the API. A
// withdrawn job is terminal (the stored image was deleted on request); the
// caller must stop polling, which is why the API returns it distinctly rather
// than as another `processing`.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params
  const jobId = request.nextUrl.searchParams.get('job_id') ?? ''

  try {
    const res = await fetch(
      `${apiUrl}/v1/public/products/${productId}/try-on/status?job_id=${encodeURIComponent(jobId)}`,
      {
        method: 'GET',
        headers: {
          cookie: request.headers.get('cookie') || '',
          'user-agent': request.headers.get('user-agent') || '',
        },
        cache: 'no-store',
      },
    )

    const body = await res.text()
    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return NextResponse.json({ error: { code: 'UNAVAILABLE', message: 'Service unavailable' } }, {
      status: 503,
    })
  }
}
