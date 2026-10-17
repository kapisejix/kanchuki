import { type NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../route'
import { POST as storePOST } from '../../../../[store]/[collection]/enquire/route'

// F-044 E2: unlike the view ping, the caller READS this answer — whatsapp_url on
// 200, or a non-200 that sends it to the client-built wa.me fallback — so the
// proxy must pass status + JSON through untouched.
const upstream = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', upstream)
})
afterEach(() => {
  upstream.mockReset()
  vi.unstubAllGlobals()
})

const req = (body: unknown) =>
  new Request('http://localhost:3100/api/x/enquire', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest

describe('POST /api/c/[slug]/enquire', () => {
  it('forwards body to the API and passes 200 JSON through', async () => {
    upstream.mockResolvedValue(Response.json({ data: { whatsapp_url: 'https://wa.me/91x' } }))
    const res = await POST(req({ product_ids: ['a', 'b'] }), {
      params: Promise.resolve({ slug: 'festive-edit' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { whatsapp_url: 'https://wa.me/91x' } })
    expect(upstream.mock.calls[0]?.[0]).toContain('/v1/public/collections/festive-edit/enquire')
    expect(JSON.parse(upstream.mock.calls[0]?.[1].body)).toEqual({ product_ids: ['a', 'b'] })
  })

  it('passes a 422 through with its body', async () => {
    upstream.mockResolvedValue(
      Response.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 422 }),
    )
    const res = await POST(req({ product_ids: ['gone'] }), {
      params: Promise.resolve({ slug: 's' }),
    })
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR')
  })

  it('answers 503 when the API is down', async () => {
    upstream.mockRejectedValue(new Error('ECONNREFUSED'))
    const res = await POST(req({}), { params: Promise.resolve({ slug: 's' }) })
    expect(res.status).toBe(503)
  })
})

describe('POST /api/[store]/[collection]/enquire', () => {
  it('uses the collection segment as the slug', async () => {
    upstream.mockResolvedValue(Response.json({ data: {} }))
    await storePOST(req({}), {
      params: Promise.resolve({ store: 'meera', collection: 'festive-edit' }),
    })
    expect(upstream.mock.calls[0]?.[0]).toContain('/v1/public/collections/festive-edit/enquire')
  })
})
