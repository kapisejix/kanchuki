import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '../route'

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

function postRequest(body: string, headers: Record<string, string> = {}) {
  return new Request('https://web.test.invalid/api/checkout/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  })
}

describe('POST /api/checkout/create-order', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('forwards the request body and JSON content type to the create-order endpoint', async () => {
    mockUpstream(200, '{"data":{"order_id":"ord_1"}}')
    const payload = JSON.stringify({ product_id: 'p1', quantity: 2 })

    const res = await POST(postRequest(payload))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test.invalid/v1/public/checkout/create-order')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe(payload)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { order_id: 'ord_1' } })
  })

  it('forwards the client X-Forwarded-For to preserve the API per-IP rate limit', async () => {
    mockUpstream(200, '{}')

    await POST(postRequest('{}', { 'X-Forwarded-For': '203.0.113.7' }))

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['X-Forwarded-For']).toBe('203.0.113.7')
  })

  it('omits X-Forwarded-For when the inbound request has none', async () => {
    mockUpstream(200, '{}')

    await POST(postRequest('{}'))

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('passes through upstream error status and body unchanged', async () => {
    mockUpstream(422, '{"status":"error","code":"INVALID_ORDER"}')

    const res = await POST(postRequest('{}'))

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({ status: 'error', code: 'INVALID_ORDER' })
  })
})
