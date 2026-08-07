// F-027 (2026-08-07): DB-backed Style/Occasion/Fabric taxonomy — retailer
// CRUD for the generic ProductAttribute pair (mirrors categories.ts, but
// generalized across STYLE/OCCASION/FABRIC via a `kind` field instead of
// three near-duplicate route files). Values here are the selectable options
// on the product-add screen; AI tagging writes raw guesses into
// Product.styles/fabrics without a DB resolve step.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { productAttributeRoutes } from './product-attributes.js';

const { mockFindMany, mockFindFirst, mockFindUnique, mockCreate, mockDelete } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindFirst: vi.fn(),
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    productAttribute: {
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      findUnique: mockFindUnique,
      create: mockCreate,
      delete: mockDelete,
    },
  },
}));

const RETAILER_ID = 'retailer_1';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(productAttributeRoutes, { prefix: '/v1/product-attributes' });
  await app.ready();
  return app;
}

const ATTRIBUTE = {
  id: 'attr_1',
  retailer_id: RETAILER_ID,
  kind: 'STYLE',
  segment: 'LADIES',
  name: 'Anarkali Suits',
  sort_order: 2,
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /product-attributes', () => {
  it('filters by kind and scopes to the retailer', async () => {
    mockFindMany.mockResolvedValue([ATTRIBUTE]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/product-attributes?kind=STYLE' });
    expect(res.statusCode).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { retailer_id: RETAILER_ID, kind: 'STYLE' },
      }),
    );
    expect(res.json().data).toHaveLength(1);
    await app.close();
  });

  it('returns all three kinds when no kind param is given', async () => {
    mockFindMany.mockResolvedValue([ATTRIBUTE]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/product-attributes' });
    expect(res.statusCode).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { retailer_id: RETAILER_ID },
      }),
    );
    await app.close();
  });

  it('rejects an invalid kind with 422', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/product-attributes?kind=NOPE' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(mockFindMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /product-attributes', () => {
  it('creates a custom value for the retailer', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ ...ATTRIBUTE, name: 'House Party Wear' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/product-attributes',
      payload: { kind: 'OCCASION', name: 'House Party Wear' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith({
      data: { retailer_id: RETAILER_ID, kind: 'OCCASION', name: 'House Party Wear' },
    });
    await app.close();
  });

  it('rejects a duplicate name for the same kind with 422', async () => {
    mockFindUnique.mockResolvedValue(ATTRIBUTE);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/product-attributes',
      payload: { kind: 'STYLE', name: 'Anarkali Suits' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.field).toBe('name');
    expect(mockCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an invalid kind with 422', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/product-attributes',
      payload: { kind: 'COLOR', name: 'Red' },
    });
    expect(res.statusCode).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an empty name with 422', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/product-attributes',
      payload: { kind: 'FABRIC', name: '' },
    });
    expect(res.statusCode).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('DELETE /product-attributes/:id', () => {
  it('deletes an owned attribute and returns 204', async () => {
    mockFindFirst.mockResolvedValue(ATTRIBUTE);
    mockDelete.mockResolvedValue(ATTRIBUTE);
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/v1/product-attributes/attr_1' });
    expect(res.statusCode).toBe(204);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: 'attr_1', retailer_id: RETAILER_ID },
    });
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'attr_1' } });
    await app.close();
  });

  it('refuses to touch an attribute belonging to another retailer (IDOR)', async () => {
    // Ownership check (findFirst, scoped by retailer) returns null → 404,
    // and delete must never be reached.
    mockFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/v1/product-attributes/attr_other' });
    expect(res.statusCode).toBe(404);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: 'attr_other', retailer_id: RETAILER_ID },
    });
    expect(mockDelete).not.toHaveBeenCalled();
    await app.close();
  });
});
