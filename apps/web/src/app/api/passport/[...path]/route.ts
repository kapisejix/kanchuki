// Proxy all /api/passport/* requests to the backend API.
// Follows the existing proxy pattern (app/api/[store]/leads/route.ts).
// Forwards the visitor's cookies so the passport session is visible to the API.
import { type NextRequest, NextResponse } from 'next/server';
import { API_URL as apiUrl } from '@/lib/apiUrl';

const PASSPORT_PATHS = ['otp/send', 'otp/verify', 'me', 'logout', 'stores', 'events', 'profile', 'wishlist', 'recently-viewed', 'export', 'delete'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const subpath = path.join('/');

  if (!PASSPORT_PATHS.includes(subpath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const res = await fetch(`${apiUrl}/v1/public/passport/${subpath}`, {
      method: 'GET',
      headers: {
        cookie: request.headers.get('cookie') || '',
        'user-agent': request.headers.get('user-agent') || '',
      },
    });

    const body = await res.text();
    const response = new NextResponse(body, { status: res.status });

    // Forward Set-Cookie headers from the API (session cookie)
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      response.headers.set('set-cookie', setCookie);
    }

    return response;
  } catch {
    return NextResponse.json(
      { error: 'Service unavailable' },
      { status: 503 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const subpath = path.join('/');

  if (!PASSPORT_PATHS.includes(subpath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const body = await request.text();

    const res = await fetch(`${apiUrl}/v1/public/passport/${subpath}`, {
      method: 'POST',
      headers: {
        'content-type': request.headers.get('content-type') || 'application/json',
        cookie: request.headers.get('cookie') || '',
        'user-agent': request.headers.get('user-agent') || '',
      },
      body,
    });

    const responseBody = await res.text();
    const response = new NextResponse(responseBody, { status: res.status });

    // Forward Set-Cookie headers from the API (session cookie on verify)
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      response.headers.set('set-cookie', setCookie);
    }

    return response;
  } catch {
    return NextResponse.json(
      { error: 'Service unavailable' },
      { status: 503 },
    );
  }
}
