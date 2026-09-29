import { API_URL as apiUrl } from '@/lib/apiUrl';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const upstream = await fetch(`${apiUrl}/v1/public/recommendations`, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('content-type') || 'application/json',
        cookie: request.headers.get('cookie') || '',
        'user-agent': request.headers.get('user-agent') || '',
      },
      body: await request.text(),
      cache: 'no-store',
    });
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Recommendations unavailable' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
