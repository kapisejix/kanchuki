import { API_URL } from '@/lib/apiUrl';
import { type NextRequest, NextResponse } from 'next/server';

// Canonical store-contact gate proxy — /api/{public_slug}/leads. Same pattern
// as the legacy /api/store/[slug]/leads route.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ store: string }> },
) {
  const { store } = await params;
  const body: unknown = await request.json();

  try {
    const res = await fetch(`${API_URL}/v1/public/retailers/${store}/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the passport session cookie — the API's passport path
        // derives the shopper identity from it, not from the request body.
        cookie: request.headers.get('cookie') ?? '',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: 'PROXY_ERROR',
          message: err instanceof Error ? err.message : 'Request failed',
          status: 500,
        },
      },
      { status: 500 },
    );
  }
}
