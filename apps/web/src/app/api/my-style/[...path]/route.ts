// F-045 My Style: proxy /api/my-style/* to the backend API (/v1/public/my-style/*).
// Same shape as the passport proxy (app/api/passport/[...path]/route.ts), kept
// separate because the upstream area differs. Forwards the visitor's cookies so
// the passport session is visible to the API.
import { type NextRequest, NextResponse } from 'next/server';
import { API_URL as apiUrl } from '@/lib/apiUrl';

// Every my-style subpath the browser may reach, POST only. A path missing here
// answers 404 and a verb with no handler answers 405, so keep both in step with
// the screens that call them (RC-026).
const MY_STYLE_PATHS = ['feed', 'enquire'];

// Null-body statuses may not be rebuilt with a body (RC-045).
const NULL_BODY_STATUS = new Set([204, 205, 304]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const subpath = path.join('/');

  if (!MY_STYLE_PATHS.includes(subpath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const res = await fetch(`${apiUrl}/v1/public/my-style/${path.map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: {
        'content-type': request.headers.get('content-type') || 'application/json',
        cookie: request.headers.get('cookie') || '',
        'user-agent': request.headers.get('user-agent') || '',
      },
      body: await request.text(),
    });

    const body = NULL_BODY_STATUS.has(res.status) ? null : await res.text();
    const response = new NextResponse(body, { status: res.status });
    const type = res.headers.get('content-type');
    if (type) response.headers.set('content-type', type);
    // Account-specific: never let a CDN or the browser cache it.
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
