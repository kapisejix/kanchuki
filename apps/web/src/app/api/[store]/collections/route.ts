import { API_URL } from '@/lib/apiUrl';
import { type NextRequest, NextResponse } from 'next/server';

// GET /api/{store}/collections — fetch active collections for a retailer.
// Proxies to API's GET /v1/public/retailers/:slug/collections.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ store: string }> },
) {
  const { store } = await params;

  try {
    const res = await fetch(`${API_URL}/v1/public/retailers/${store}/collections`, {
      next: { revalidate: 60 },
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
