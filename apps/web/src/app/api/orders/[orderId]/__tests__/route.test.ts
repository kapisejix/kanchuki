import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '../route'

// Route handlers read the API base from @/lib/apiUrl at request time; pin it so
// the outbound URL is deterministic (no reliance on real env vars in tests).
vi.mock('@/lib/apiUrl', () => ({
  API_URL: 'https://api.test.invalid',
}))

const fetchMock = vi.fn()

function mockUpstream(status: number, body: string) {
  fetchMock.mockResolvedValueOnce(
    new Response(body, { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

function getRequest(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers })
}

describe('GET /api/orders/[orderId]', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('proxies to the public order endpoint with the orderId in the path', async () => {
    mockUpstream(200, '{"data":{"order_id":"ord_1","status":"PAID"}}')

    const res = await GET(getRequest('https://web.test.invalid/api/orders/ord_1'), {
      params: Promise.resolve({ orderId: 'ord_1' }),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test.invalid/v1/public/orders/ord_1')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { order_id: 'ord_1', status: 'PAID' } })
  })

  it('forwards the full query string, including the ?phone= anti-IDOR second factor', async () => {
    mockUpstream(200, '{}')

    await GET(getRequest('https://web.test.invalid/api/orders/ord_1?phone=9999999999'), {
      params: Promise.resolve({ orderId: 'ord_1' }),
    })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test.invalid/v1/public/orders/ord_1?phone=9999999999')
  })

  it('forwards the client X-Forwarded-For to preserve the API per-IP rate limit', async () => {
    mockUpstream(200, '{}')

    await GET(
      getRequest('https://web.test.invalid/api/orders/ord_1?phone=9999999999', {
        'X-Forwarded-For': '203.0.113.9',
      }),
      { params: Promise.resolve({ orderId: 'ord_1' }) },
    )

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['X-Forwarded-For']).toBe('203.0.113.9')
  })

  it('omits X-Forwarded-For when the inbound request has none', async () => {
    mockUpstream(200, '{}')

    await GET(getRequest('https://web.test.invalid/api/orders/ord_1'), {
      params: Promise.resolve({ orderId: 'ord_1' }),
    })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers).toEqual({})
  })

  it('passes through upstream error status and body unchanged', async () => {
    mockUpstream(404, '{"status":"error","code":"ORDER_NOT_FOUND"}')

    const res = await GET(getRequest('https://web.test.invalid/api/orders/ghost'), {
      params: Promise.resolve({ orderId: 'ghost' }),
    })

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ status: 'error', code: 'ORDER_NOT_FOUND' })
  })
})
