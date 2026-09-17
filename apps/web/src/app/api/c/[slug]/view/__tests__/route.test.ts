import { type NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../route'

// Legacy-URL twin of the canonical view proxy. CollectionView picks this base
// path whenever it has no store segment, so a missing legacy route would 404
// for exactly the pages that were shared before the canonical URL scheme.

const upstream = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', upstream)
})

afterEach(() => {
  upstream.mockReset()
  vi.unstubAllGlobals()
})

function callView(slug = 'festive-edit'): Promise<Response> {
  const request = new Request(`http://localhost:3100/api/c/${slug}/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  return POST(request as unknown as NextRequest, { params: Promise.resolve({ slug }) })
}

describe('POST /api/c/[slug]/view', () => {
  it('forwards the slug to the API and answers 204', async () => {
    upstream.mockResolvedValue(new Response(null, { status: 204 }))

    const res = await callView()

    expect(res.status).toBe(204)
    expect(upstream.mock.calls[0]?.[0]).toContain('/v1/public/collections/festive-edit/view')
  })

  it('answers 204 when the API is down', async () => {
    upstream.mockRejectedValue(new Error('ECONNREFUSED'))

    expect((await callView()).status).toBe(204)
  })
})
