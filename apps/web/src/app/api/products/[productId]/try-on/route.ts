import { type NextRequest, NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

// Proxy the customer's try-on POST (multipart selfie) to the public API.
//
// This one does NOT reuse the passport proxy's `request.text()` forwarder: the
// body here is multipart binary, and reading it as text would mangle the image
// before it ever reaches the API (the boundary and the bytes both survive a
// streamed body, neither survives a UTF-8 round-trip). The body is streamed
// through, and the browser's own Content-Type — which carries the multipart
// boundary — is forwarded untouched.
//
// The visitor's cookies go with it so the passport session is visible to the
// API, which is what resolves the shopper and spends the customer-side quota.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params

  // The consent version rides in the query string (the API reads it there, not
  // as a multipart field — see products-tryon.ts for why field ordering makes a
  // form field unsafe). Forward the incoming query verbatim.
  const search = request.nextUrl.search

  try {
    const res = await fetch(
      `${apiUrl}/v1/public/products/${encodeURIComponent(productId)}/try-on${search}`,
      {
        method: 'POST',
        headers: {
          'content-type': request.headers.get('content-type') || '',
          cookie: request.headers.get('cookie') || '',
          'user-agent': request.headers.get('user-agent') || '',
        },
        body: request.body,
        // Required for a streaming request body in Node's fetch.
        // @ts-expect-error - `duplex` is valid in undici but absent from the DOM types
        duplex: 'half',
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
