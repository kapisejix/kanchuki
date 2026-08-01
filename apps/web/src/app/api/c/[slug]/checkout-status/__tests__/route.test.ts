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

describe('GET /api/c/[slug]/checkout-status', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('proxies to the public retailer-status endpoint with the slug in the path', async () => {
    mockUpstream(200, '{"data":{"checkout_enabled":true}}')

    const res = await GET(new Request('https://web.test.invalid/api/c/bebo-2piv/checkout-status'), {
      params: Promise.resolve({ slug: 'bebo-2piv' }),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test.invalid/v1/public/checkout/retailer-status/bebo-2piv')
    expect(init).toEqual({ next: { revalidate: 0 } })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { checkout_enabled: true } })
  })

  it('sends no-store so a cached "checkout disabled" response cannot hide Add to Cart', async () => {
    mockUpstream(200, '{}')

    const res = await GET(new Request('https://web.test.invalid/api/c/bebo-2piv/checkout-status'), {
      params: Promise.resolve({ slug: 'bebo-2piv' }),
    })

    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('passes through upstream error status and body unchanged', async () => {
    mockUpstream(500, '{"status":"error","message":"boom"}')

    const res = await GET(new Request('https://web.test.invalid/api/c/ghost/checkout-status'), {
      params: Promise.resolve({ slug: 'ghost' }),
    })

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ status: 'error', message: 'boom' })
  })
})
