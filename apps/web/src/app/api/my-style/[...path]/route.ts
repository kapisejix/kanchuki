// F-045 My Style: proxy /api/my-style/* to the backend API (/v1/public/my-style/*).
// Same shape as the passport proxy (app/api/passport/[...path]/route.ts), kept
// separate because the upstream area differs. Forwards the visitor's cookies so
// the passport session is visible to the API.
import { type NextRequest, NextResponse } from 'next/server';
import { API_URL as apiUrl } from '@/lib/apiUrl';

// Every my-style subpath the browser may reach, per verb. A path missing here
// answers 404 and a verb with no handler answers 405, so keep both in step with
// the screens that call them (RC-026).
const POST_PATHS = ['feed', 'enquire', 'analyze', 'profile/clear'];
// Poll: analyze/<jobId>. Job ids are `mystyle_<cuid2>`; the strict pattern keeps
// `..`, slashes and spaces out of the upstream URL.
const GET_PATH = /^analyze\/[A-Za-z0-9_-]{1,64}$/;

// Null-body statuses may not be rebuilt with a body (RC-045).
const NULL_BODY_STATUS = new Set([204, 205, 304]);

async function forward(request: NextRequest, path: string[], method: 'GET' | 'POST') {
  const subpath = path.join('/');
  const allowed = method === 'GET' ? GET_PATH.test(subpath) : POST_PATHS.includes(subpath);
  if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const search = new URL(request.url).search; // consent_version rides in the query
    const res = await fetch(
      `${apiUrl}/v1/public/my-style/${path.map(encodeURIComponent).join('/')}${search}`,
      {
        method,
        headers: {
          ...(method === 'POST'
            ? { 'content-type': request.headers.get('content-type') || 'application/json' }
            : {}),
          cookie: request.headers.get('cookie') || '',
          'user-agent': request.headers.get('user-agent') || '',
        },
        // Bytes, not text: request.text() would corrupt a multipart photo (PR-7 T12).
        ...(method === 'POST' ? { body: await request.arrayBuffer() } : {}),
      },
    );

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

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path, 'GET');
}

export async function POST(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path, 'POST');
}
