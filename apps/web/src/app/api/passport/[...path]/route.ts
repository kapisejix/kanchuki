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
const PASSPORT_PATHS = ['otp/send', 'otp/verify', 'me', 'logout', 'stores', 'events', 'preferences', 'profile', 'wishlist', 'recently-viewed', 'export', 'delete', 'try-on/consent', 'try-on/withdraw'];

type ProxyMethod = 'GET' | 'POST' | 'PUT';

// Statuses that carry no body, and therefore may not be built with one: `new
// Response('', { status: 204 })` throws `TypeError: Invalid response status
// code 204`. The catch below would convert that throw into a 503, so an
// upstream 204 — which is what every fire-and-forget passport write answers
// with (see passport-activity.ts) — reached the browser as a 503 and failed
// silently inside its own `.catch(() => {})`.
const NULL_BODY_STATUS = new Set([204, 205, 304]);

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

    // Pass null rather than the (empty) text for a null-body status — reading
    // it would discard the throw, but there is nothing to read.
    const body = NULL_BODY_STATUS.has(res.status) ? null : await res.text();
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
