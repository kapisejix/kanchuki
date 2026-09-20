// Proxy all /api/passport/* requests to the backend API.
// Follows the existing proxy pattern (app/api/[store]/leads/route.ts).
// Forwards the visitor's cookies so the passport session is visible to the API.
import { type NextRequest, NextResponse } from 'next/server';
import { API_URL as apiUrl } from '@/lib/apiUrl';

// Every passport subpath the browser may reach. A path missing here answers 404,
// and a verb with no exported handler answers 405 — so both have to be kept in
// step with the screens that call them. `preferences` + the PUT verb were both
// missing while /my-profile already PUT to this path, which made the
// "Personalized recommendations" opt-out fail silently: fetch does not throw on
// a 405, so the toggle looked saved and came back on reload (RC-026).
const PASSPORT_PATHS = ['otp/send', 'otp/verify', 'me', 'logout', 'stores', 'events', 'preferences', 'profile', 'wishlist', 'recently-viewed', 'export', 'delete'];

type ProxyMethod = 'GET' | 'POST' | 'PUT';

// One forwarder for every verb. A copy of this body per verb is what let PUT go
// missing in the first place: adding a verb meant remembering to duplicate the
// whole handler, and nothing failed loudly when it was forgotten.
async function forward(request: NextRequest, path: string[], method: ProxyMethod) {
  const subpath = path.join('/');

  if (!PASSPORT_PATHS.includes(subpath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const hasBody = method !== 'GET';

  try {
    const res = await fetch(`${apiUrl}/v1/public/passport/${subpath}`, {
      method,
      headers: {
        ...(hasBody
          ? { 'content-type': request.headers.get('content-type') || 'application/json' }
          : {}),
        cookie: request.headers.get('cookie') || '',
        'user-agent': request.headers.get('user-agent') || '',
      },
      ...(hasBody ? { body: await request.text() } : {}),
    });

    // A 204/205/304 must have a null body: `new Response('', { status: 204 })`
    // throws, and the catch below would turn the API's successful answer into a
    // 503 (the events beacon answers 204 by design).
    const nullBody = res.status === 204 || res.status === 205 || res.status === 304;
    const body = nullBody ? null : await res.text();
    const response = new NextResponse(body, { status: res.status });

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return forward(request, path, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return forward(request, path, 'POST');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return forward(request, path, 'PUT');
}
