import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { productRoutes } from './products.js';

const {
  mockProductFindFirst,
  mockProductFindMany,
  mockProductUpdate,
  mockProductDelete,
  MockPrismaClientKnownRequestError,
} = vi.hoisted(() => {
  class MockPrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    mockProductFindFirst: vi.fn(),
    mockProductFindMany: vi.fn(),
    mockProductUpdate: vi.fn(),
    mockProductDelete: vi.fn(),
    MockPrismaClientKnownRequestError,
  };
});

vi.mock('@kanchuki/db', () => ({
  vaultDelete: vi.fn(),
  prisma: {
    product: {
      findFirst: mockProductFindFirst,
      findMany: mockProductFindMany,
      update: mockProductUpdate,
      delete: mockProductDelete,
      count: vi.fn(),
    },
    retailer: { findUniqueOrThrow: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  Prisma: { PrismaClientKnownRequestError: MockPrismaClientKnownRequestError },
}));

vi.mock('@kanchuki/ai', () => ({
  cleanupProductPhoto: vi.fn(),
  fetchImageBuffer: vi.fn(),
  getDownloadPresignedUrl: vi.fn(),
  getUploadPresignedUrl: vi.fn(),
  publicUrl: vi.fn(),
  uploadBuffer: vi.fn(),
  MATCH_SIMILARITY_THRESHOLD: 0.9,
  MIN_CONFIDENCE_FOR_MATCHING: 0.5,
  detectColor: vi.fn(),
}));

vi.mock('@kanchuki/shared', () => ({
  R2_PATHS: {},
  SIZE_OPTIONS: [],
}));

vi.mock('../jobs/index.js', () => ({
  addEmbeddingJob: vi.fn(),
  addSpinFrameJob: vi.fn(),
  addTaggingJob: vi.fn(),
}));

vi.mock('../lib/quota.js', () => ({
  checkQuota: vi.fn(),
  incrementUsage: vi.fn(),
}));

const RETAILER_ID = 'retailer_1';

async function buildApp(staffRole: string | null) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
    request.staffRole = staffRole;
  });
  await app.register(productRoutes, { prefix: '/v1/products' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /products/deleted', () => {
  it('owner can list soft-deleted products', async () => {
    mockProductFindMany.mockResolvedValue([{ id: 'p1', deleted_at: new Date() }]);
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/v1/products/deleted' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    await app.close();
  });

  it('staff cannot view the trash tab', async () => {
    const app = await buildApp('salesperson');
    const res = await app.inject({ method: 'GET', url: '/v1/products/deleted' });
    expect(res.statusCode).toBe(403);
    expect(mockProductFindMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PATCH /products/:id/restore', () => {
  it('owner can restore a soft-deleted product', async () => {
    mockProductFindFirst.mockResolvedValue({ id: 'p1', deleted_at: new Date() });
    mockProductUpdate.mockResolvedValue({ id: 'p1', deleted_at: null });
    const app = await buildApp(null);
    const res = await app.inject({ method: 'PATCH', url: '/v1/products/p1/restore' });
    expect(res.statusCode).toBe(200);
    expect(mockProductUpdate).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { deleted_at: null } });
    await app.close();
  });

  it('staff cannot restore', async () => {
    const app = await buildApp('salesperson');
    const res = await app.inject({ method: 'PATCH', url: '/v1/products/p1/restore' });
    expect(res.statusCode).toBe(403);
    expect(mockProductFindFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it('404s when the product is not in the trash', async () => {
    mockProductFindFirst.mockResolvedValue(null);
    const app = await buildApp(null);
    const res = await app.inject({ method: 'PATCH', url: '/v1/products/missing/restore' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /products/:id/purge', () => {
  it('owner can permanently purge a soft-deleted product', async () => {
    mockProductFindFirst.mockResolvedValue({ id: 'p1', deleted_at: new Date() });
    mockProductDelete.mockResolvedValue({ id: 'p1' });
    const app = await buildApp(null);
    const res = await app.inject({ method: 'DELETE', url: '/v1/products/p1/purge' });
    expect(res.statusCode).toBe(204);
    expect(mockProductDelete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    await app.close();
  });

  it('staff cannot purge', async () => {
    const app = await buildApp('manager');
    const res = await app.inject({ method: 'DELETE', url: '/v1/products/p1/purge' });
    expect(res.statusCode).toBe(403);
    expect(mockProductFindFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it('surfaces a clear error when the product is referenced by an order/collection (FK constraint)', async () => {
    mockProductFindFirst.mockResolvedValue({ id: 'p1', deleted_at: new Date() });
    mockProductDelete.mockRejectedValue(
      new MockPrismaClientKnownRequestError('FK violation', 'P2003'),
    );
    const app = await buildApp(null);
    const res = await app.inject({ method: 'DELETE', url: '/v1/products/p1/purge' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('past order or collection');
    await app.close();
  });
});
