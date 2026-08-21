import { API_URL } from '@/lib/apiUrl';
import { type NextRequest, NextResponse } from 'next/server';

// POST /api/{store}/bookings — customer self-service showroom/try-on slot booking.
// Proxies to API's POST /v1/public/retailers/:slug/bookings.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ store: string }> },
) {
  const { store } = await params;
  const body: unknown = await request.json();

  try {
    const res = await fetch(`${API_URL}/v1/public/retailers/${store}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
