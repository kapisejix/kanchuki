import { type NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as route from '../route'

// F-045 My Style proxy. The feed lives at /v1/public/my-style/feed, not under
// /passport, so it has its own allowlist: POST `feed` only (RC-026), with null
// body statuses handled (RC-045) and the passport cookie forwarded.

const upstream = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', upstream)
})

afterEach(() => {
  upstream.mockReset()
  vi.unstubAllGlobals()
})

function post(segments: string[], init: { body?: string; cookie?: string } = {}) {
  const request = new Request(`http://localhost:3100/api/my-style/${segments.join('/')}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
    body: init.body ?? '{}',
  })
  return route.POST(request as unknown as NextRequest, {
    params: Promise.resolve({ path: segments }),
  })
}

describe('POST /api/my-style/feed', () => {
  it('forwards body and cookie to the API and passes the answer back', async () => {
    upstream.mockResolvedValue(new Response(JSON.stringify({ data: [], meta: {} }), { status: 200 }))

    const res = await post(['feed'], {
      body: JSON.stringify({ sort: 'price' }),
      cookie: 'kanchuki_passport=abc',
    })

    expect(res.status).toBe(200)
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/v1/public/my-style/feed')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ sort: 'price' })
    expect((init.headers as Record<string, string>).cookie).toBe('kanchuki_passport=abc')
  })

  it('passes a 401 through so the page can bounce to login', async () => {
    upstream.mockResolvedValue(new Response('{}', { status: 401 }))
    expect((await post(['feed'])).status).toBe(401)
  })

  it('marks the response private, no-store (account-specific)', async () => {
    upstream.mockResolvedValue(new Response('{}', { status: 200 }))
    expect((await post(['feed'])).headers.get('cache-control')).toBe('private, no-store')
  })

  it('reports an unreachable API as 503', async () => {
    upstream.mockRejectedValue(new Error('ECONNREFUSED'))
    expect((await post(['feed'])).status).toBe(503)
  })

  it.each([204, 205, 304])('passes null-body status %i through intact', async (status) => {
    upstream.mockResolvedValue(new Response(null, { status }))
    expect((await post(['feed'])).status).toBe(status)
  })

  it('404s any other path and exports POST only', async () => {
    expect((await post(['analyze'])).status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
    expect(Object.keys(route)).toEqual(['POST'])
  })
})
