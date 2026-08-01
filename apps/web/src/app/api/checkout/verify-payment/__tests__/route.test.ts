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
  return new Request('https://web.test.invalid/api/checkout/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  })
}

describe('POST /api/checkout/verify-payment', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('forwards the verification payload to the verify-payment endpoint', async () => {
    mockUpstream(200, '{"data":{"order_id":"ord_1","status":"PAID"}}')
    const payload = JSON.stringify({ order_id: 'ord_1', razorpay_payment_id: 'pay_1' })

    const res = await POST(postRequest(payload))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test.invalid/v1/public/checkout/verify-payment')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe(payload)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { order_id: 'ord_1', status: 'PAID' } })
  })

  it('forwards the client X-Forwarded-For to preserve the API per-IP rate limit', async () => {
    mockUpstream(200, '{}')

    await POST(postRequest('{}', { 'X-Forwarded-For': '198.51.100.4' }))

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['X-Forwarded-For']).toBe('198.51.100.4')
  })

  it('omits X-Forwarded-For when the inbound request has none', async () => {
    mockUpstream(200, '{}')

    await POST(postRequest('{}'))

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('passes through upstream error status and body unchanged', async () => {
    mockUpstream(400, '{"status":"error","code":"SIGNATURE_MISMATCH"}')

    const res = await POST(postRequest('{}'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ status: 'error', code: 'SIGNATURE_MISMATCH' })
  })
})
