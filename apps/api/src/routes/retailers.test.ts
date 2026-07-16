import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { retailerRoutes } from './retailers.js'
import { errorHandler } from '../plugins/error-handler.js'

const { mockRetailerFindUnique, mockRetailerUpdate, mockCollectionFindFirst } = vi.hoisted(() => ({
  mockRetailerFindUnique: vi.fn(),
  mockRetailerUpdate: vi.fn(),
  mockCollectionFindFirst: vi.fn(),
}))

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUnique: mockRetailerFindUnique, update: mockRetailerUpdate },
    collection: { findFirst: mockCollectionFindFirst },
    product: { count: vi.fn(), findMany: vi.fn() },
    customer: { count: vi.fn() },
    storeSection: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  },
  Prisma: {},
}))

const RETAILER_ID = 'retailer_1'

async function buildApp() {
  const app = Fastify()
  app.setErrorHandler(errorHandler)
  app.decorateRequest('retailerId', '')
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID
  })
  await app.register(retailerRoutes, { prefix: '/v1/retailers' })
  await app.ready()
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /retailers/me/qr-slug', () => {
  it('returns the existing slug without generating a new one', async () => {
    mockRetailerFindUnique.mockResolvedValue({ public_slug: 'test-shop-ab12', shop_name: 'Test Shop' })

    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/v1/retailers/me/qr-slug' })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.public_slug).toBe('test-shop-ab12')
    expect(mockRetailerUpdate).not.toHaveBeenCalled()
    await app.close()
  })

  it('generates and persists a slug when none exists', async () => {
    mockRetailerFindUnique
      .mockResolvedValueOnce({ public_slug: null, shop_name: 'Test Shop' }) // initial lookup
      .mockResolvedValueOnce(null) // uniqueness check — slug free
    mockRetailerUpdate.mockResolvedValue({ public_slug: 'test-shop-xy99' })

    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/v1/retailers/me/qr-slug' })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.public_slug).toBe('test-shop-xy99')
    expect(mockRetailerUpdate).toHaveBeenCalledOnce()
    await app.close()
  })
})

describe('PATCH /retailers/me/storefront', () => {
  it('rejects a collection that does not belong to this retailer', async () => {
    mockCollectionFindFirst.mockResolvedValue(null)

    const app = await buildApp()
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/retailers/me/storefront',
      payload: { collection_id: 'someone_elses_collection' },
    })

    expect(res.statusCode).toBe(422)
    expect(mockRetailerUpdate).not.toHaveBeenCalled()
    await app.close()
  })

  it('accepts an owned collection', async () => {
    mockCollectionFindFirst.mockResolvedValue({ id: 'col_1', retailer_id: RETAILER_ID })
    mockRetailerUpdate.mockResolvedValue({ storefront_collection_id: 'col_1' })

    const app = await buildApp()
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/retailers/me/storefront',
      payload: { collection_id: 'col_1' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.storefront_collection_id).toBe('col_1')
    await app.close()
  })

  it('allows unsetting the storefront with null', async () => {
    mockRetailerUpdate.mockResolvedValue({ storefront_collection_id: null })

    const app = await buildApp()
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/retailers/me/storefront',
      payload: { collection_id: null },
    })

    expect(res.statusCode).toBe(200)
    expect(mockCollectionFindFirst).not.toHaveBeenCalled()
    await app.close()
  })
})
