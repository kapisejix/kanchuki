import { type NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as route from '../route'

// F-045 My Style proxy. Lives at /v1/public/my-style/*, not under /passport, so it has
// its own allowlist per method (RC-026), handles null body statuses (RC-045), forwards
// the passport cookie, and carries a multipart photo byte-for-byte (PR-7 T12).

const upstream = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', upstream)
})

afterEach(() => {
  upstream.mockReset()
  vi.unstubAllGlobals()
})

function post(
  segments: string[],
  init: { body?: BodyInit; cookie?: string; type?: string; search?: string } = {},
) {
  const request = new Request(
    `http://localhost:3100/api/my-style/${segments.join('/')}${init.search ?? ''}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': init.type ?? 'application/json',
        ...(init.cookie ? { cookie: init.cookie } : {}),
      },
      body: init.body ?? '{}',
    },
  )
  return route.POST(request as unknown as NextRequest, {
    params: Promise.resolve({ path: segments }),
  })
}

function get(segments: string[], cookie?: string) {
  const request = new Request(`http://localhost:3100/api/my-style/${segments.join('/')}`, {
    method: 'GET',
    headers: cookie ? { cookie } : {},
  })
  return route.GET(request as unknown as NextRequest, {
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
    expect(JSON.parse(Buffer.from(init.body as ArrayBuffer).toString('utf8'))).toEqual({
      sort: 'price',
    })
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
})

describe('allowlist', () => {
  it.each(['analyze', 'profile/clear', 'enquire'])('POST %s is reachable', async (p) => {
    upstream.mockResolvedValue(new Response('{}', { status: 200 }))
    expect((await post(p.split('/'))).status).toBe(200)
  })

  it.each([[['nope']], [['analyze', 'job1']], [['profile']], [['profile', 'clear', 'x']]])(
    'POST %j is 404 and never reaches the API',
    async (segs) => {
      expect((await post(segs)).status).toBe(404)
      expect(upstream).not.toHaveBeenCalled()
    },
  )

  it.each([
    [['feed']],
    [['analyze']],
    [['profile', 'clear']],
    [['analyze', 'a/b']],
    [['analyze', '..']],
    [['analyze', 'x y']],
  ])('GET %j is 404 and never reaches the API', async (segs) => {
    expect((await get(segs)).status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('exports GET and POST only', () => {
    expect(Object.keys(route).sort()).toEqual(['GET', 'POST'])
  })
})

describe('POST /api/my-style/analyze (photo upload)', () => {
  it('carries multipart bytes unchanged, boundary and query included', async () => {
    upstream.mockResolvedValue(new Response('{"data":{"job_id":"mystyle_x"}}', { status: 202 }))

    // JPEG magic + bytes that are invalid UTF-8: request.text() would mangle these.
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x80, 0x81, 0xfe, 0x00, 0xc3, 0x28])
    const boundary = '----kb123'
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
    )
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
    const body = Buffer.concat([head, jpeg, tail])

    const res = await post(['analyze'], {
      body,
      type: `multipart/form-data; boundary=${boundary}`,
      search: '?consent_version=mystyle-1.0',
      cookie: 'kanchuki_passport=abc',
    })

    expect(res.status).toBe(202)
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/v1/public/my-style/analyze?consent_version=mystyle-1.0')
    expect((init.headers as Record<string, string>)['content-type']).toBe(
      `multipart/form-data; boundary=${boundary}`,
    )
    expect(Buffer.from(init.body as ArrayBuffer).equals(body)).toBe(true)
  })

  it.each([402, 409, 413, 422, 503, 404])('passes %i through with its body', async (status) => {
    upstream.mockResolvedValue(new Response('{"error":{"code":"X"}}', { status }))
    const res = await post(['analyze'])
    expect(res.status).toBe(status)
    expect(await res.text()).toContain('"X"')
  })
})

describe('GET /api/my-style/complete-look', () => {
  it('forwards the anchor query and the cookie', async () => {
    upstream.mockResolvedValue(
      new Response('{"data":{"slots":[]}}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const request = new Request('http://localhost:3100/api/my-style/complete-look?anchor=p1', {
      method: 'GET',
      headers: { cookie: 'kanchuki_passport=abc' },
    })
    const res = await route.GET(request as unknown as NextRequest, {
      params: Promise.resolve({ path: ['complete-look'] }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/v1/public/my-style/complete-look?anchor=p1')
    expect((init.headers as Record<string, string>).cookie).toBe('kanchuki_passport=abc')
  })

  it('has no sub-paths', async () => {
    expect((await get(['complete-look', 'x'])).status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })
})

describe('GET /api/my-style/analyze/:jobId (poll)', () => {
  it('forwards the poll with the cookie and no body', async () => {
    upstream.mockResolvedValue(
      new Response('{"data":{"status":"processing"}}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const res = await get(['analyze', 'mystyle_abc123'], 'kanchuki_passport=abc')

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/v1/public/my-style/analyze/mystyle_abc123')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect((init.headers as Record<string, string>).cookie).toBe('kanchuki_passport=abc')
  })

  it('reports an unreachable API as 503', async () => {
    upstream.mockRejectedValue(new Error('ECONNREFUSED'))
    expect((await get(['analyze', 'mystyle_abc'])).status).toBe(503)
  })
})
