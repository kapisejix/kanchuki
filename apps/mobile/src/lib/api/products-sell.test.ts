import { describe, it, expect, vi, beforeEach } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({
  request,
  API_URL: 'http://api.test',
  getToken: vi.fn(),
  ApiError: class extends Error {},
}))
vi.mock('expo-file-system/legacy', () => ({}))
vi.mock('../compress-image', () => ({ compressImageForUpload: vi.fn() }))

import { productApi } from './products'

describe('productApi sell / undoSale (F-047)', () => {
  beforeEach(() => request.mockReset())

  it('sell POSTs the bill to /v1/products/sell with the idempotency key', async () => {
    request.mockResolvedValue({ data: { bill_id: 'b1', replayed: false, lines: [] } })
    const lines = [{ product_id: 'p1', size: 'M', quantity: 2 }]
    await productApi.sell('b1', lines)
    const [path, opts] = request.mock.calls[0]!
    expect(path).toBe('/v1/products/sell')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ client_bill_id: 'b1', lines })
    expect(opts.timeoutMs).toBeGreaterThanOrEqual(30_000)
  })

  it('undoSale POSTs to the bill-scoped undo path, id URL-encoded', async () => {
    request.mockResolvedValue({ data: { bill_id: 'a/b', undone: true, lines: [] } })
    await productApi.undoSale('a/b')
    const [path, opts] = request.mock.calls[0]!
    expect(path).toBe('/v1/products/sell/a%2Fb/undo')
    expect(opts.method).toBe('POST')
  })
})
