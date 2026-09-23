import { type NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST, PUT } from '../route'

// The proxy every passport-backed screen goes through. RC-026 was a verb
// missing from here while /my-profile already called it, so these pin the verb
// forwarding, the allowlist, and the cookie pass-through that the whole
// "signed in" state depends on.

const upstream = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', upstream)
})

afterEach(() => {
  upstream.mockReset()
  vi.unstubAllGlobals()
})

function call(
  method: 'GET' | 'POST' | 'PUT',
  segments: string[],
  init: { body?: string; cookie?: string } = {},
): Promise<Response> {
  const handler = method === 'GET' ? GET : method === 'POST' ? POST : PUT
  const request = new Request(`http://localhost:3100/api/passport/${segments.join('/')}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
    ...(init.body ? { body: init.body } : {}),
  })
  return handler(request as unknown as NextRequest, {
    params: Promise.resolve({ path: segments }),
  })
}

describe('PUT /api/passport/preferences', () => {
  it('forwards the verb and body to the API and passes its answer back', async () => {
    upstream.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const res = await call('PUT', ['preferences'], {
      body: JSON.stringify({ profiling_enabled: false }),
      cookie: 'kanchuki_passport=abc',
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const [url, init] = upstream.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/v1/public/passport/preferences')
    // The whole point of the fix: the API route is a PUT, so a proxy that
    // downgraded it to POST would 404/405 upstream.
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ profiling_enabled: false })
    expect((init.headers as Record<string, string>).cookie).toBe('kanchuki_passport=abc')
  })

  it('reports a failure instead of pretending the opt-out was saved', async () => {
    upstream.mockRejectedValue(new Error('ECONNREFUSED'))

    // 503, not 200: the client rolls the checkbox back on a non-ok answer, so
    // answering 200 here would recreate the silent revert this fix removes.
    expect((await call('PUT', ['preferences'], { body: '{}' })).status).toBe(503)
  })

  it('keeps the allowlist in force for the new verb', async () => {
    const res = await call('PUT', ['not-a-passport-route'], { body: '{}' })

    expect(res.status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })
})

describe('the shared forwarder did not change GET or POST', () => {
  it('GET forwards without a body and returns the API payload', async () => {
    upstream.mockResolvedValue(
      new Response(JSON.stringify({ account: { id: 'customer-1' } }), { status: 200 }),
    )

    const res = await call('GET', ['me'])

    expect(res.status).toBe(200)
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/v1/public/passport/me')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
  })

  it('POST forwards the body and hands the session cookie back', async () => {
    upstream.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'set-cookie': 'kanchuki_passport=fresh; Path=/; HttpOnly' },
      }),
    )

    const res = await call('POST', ['otp/verify'], { body: JSON.stringify({ otp: '123456' }) })

    const [, init] = upstream.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ otp: '123456' })
    // Without this the shopper verifies an OTP and stays signed out.
    expect(res.headers.get('set-cookie')).toContain('kanchuki_passport=fresh')
  })

  it('404s an unlisted path on every verb', async () => {
    for (const method of ['GET', 'POST', 'PUT'] as const) {
      // `Request` rejects a body on GET, so only the write verbs send one.
      const init = method === 'GET' ? {} : { body: '{}' }
      expect((await call(method, ['unknown'], init)).status).toBe(404)
    }
    expect(upstream).not.toHaveBeenCalled()
  })
})

describe('POST /api/passport/events', () => {
  it('passes an upstream 204 through as 204, not a 503', async () => {
    // The API answers the event beacon with 204. new NextResponse('', {status: 204})
    // throws, and the catch reported the success as "Service unavailable".
    upstream.mockResolvedValue(new Response(null, { status: 204 }))

    const res = await call('POST', ['events'], { body: JSON.stringify({ events: [] }) })

    expect(res.status).toBe(204)
  })
})
