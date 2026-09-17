import { type NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../route'

// The route the storefront has always called and that never existed (RC-025):
// without it every web view 404'd, so the retailer dashboard's "Views" stat
// never counted web storefront traffic at all.
//
// What matters here is the fire-and-forget contract, not the happy path alone:
// view tracking is analytics, so a slow or dead API must not be able to break
// the page it is measuring.

const upstream = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', upstream)
})

afterEach(() => {
  upstream.mockReset()
  vi.unstubAllGlobals()
})

function callView(init?: { body?: string; collection?: string }): Promise<Response> {
  const request = new Request(
    `http://localhost:3100/api/meera-sarees/${init?.collection ?? 'festive-edit'}/view`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(init?.body === undefined ? {} : { body: init.body }),
    },
  )
  return POST(request as unknown as NextRequest, {
    params: Promise.resolve({ store: 'meera-sarees', collection: init?.collection ?? 'festive-edit' }),
  })
}

describe('POST /api/[store]/[collection]/view', () => {
  it('forwards to the API collection-view endpoint with the body', async () => {
    upstream.mockResolvedValue(new Response(null, { status: 204 }))

    await callView({ body: JSON.stringify({}) })

    expect(upstream).toHaveBeenCalledTimes(1)
    const [url, options] = upstream.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/v1/public/collections/festive-edit/view')
    expect(options.method).toBe('POST')
    expect(JSON.parse(String(options.body))).toEqual({})
  })

  it('answers 204 even when the API is down', async () => {
    upstream.mockRejectedValue(new Error('ECONNREFUSED'))

    const res = await callView({ body: JSON.stringify({}) })

    expect(res.status).toBe(204)
  })

  it('answers 204 and still forwards when the caller sends no body', async () => {
    // A bodyless POST must not 500: every field the API takes is optional, and
    // `request.json()` throws on an empty body.
    upstream.mockResolvedValue(new Response(null, { status: 204 }))

    const res = await callView()

    expect(res.status).toBe(204)
    expect(JSON.parse(String((upstream.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({})
  })

  it('uses the collection segment, not the store segment', async () => {
    upstream.mockResolvedValue(new Response(null, { status: 204 }))

    await callView({ collection: 'office-edit', body: JSON.stringify({}) })

    expect(upstream.mock.calls[0]?.[0]).toContain('/collections/office-edit/view')
  })
})
