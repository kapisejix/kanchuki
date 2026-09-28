import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../route';

const upstream = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
  upstream.mockReset();
  vi.unstubAllGlobals();
});

function request(body: string, cookie?: string): NextRequest {
  return new Request('http://localhost:3100/api/recommendations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body,
  }) as unknown as NextRequest;
}

describe('POST /api/recommendations', () => {
  it('forwards the active store request and passport cookie without caching', async () => {
    upstream.mockResolvedValue(
      new Response(JSON.stringify({ data: { personalized: false, products: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const payload = JSON.stringify({ slug: 'store-a', visit_product_ids: ['p1'] });

    const response = await POST(request(payload, 'kanchuki_passport=session-a'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ data: { personalized: false, products: [] } });
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/public/recommendations');
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');
    expect(init.body).toBe(payload);
    expect((init.headers as Record<string, string>).cookie).toBe('kanchuki_passport=session-a');
  });

  it('returns no-store 503 when the API is unreachable', async () => {
    upstream.mockRejectedValue(new Error('ECONNREFUSED'));

    const response = await POST(request(JSON.stringify({ slug: 'store-a' })));

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
