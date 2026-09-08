import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { categoryRoutes } from './categories.js';

const {
  mockProductCategoryFindMany,
  mockProductCategoryFindFirst,
  mockProductCategoryCreate,
  mockProductCategoryUpdate,
  mockProductCategoryDelete,
  mockProductFindMany,
  mockProductFindFirst,
  mockRetailerFindUnique,
  mockAuditLogCreate,
  mockPurgeExecuteRaw,
  mockPurgeTransaction,
  mockPurgeCategoryDelete,
} = vi.hoisted(() => {
  return {
    mockProductCategoryFindMany: vi.fn(),
    mockProductCategoryFindFirst: vi.fn(),
    mockProductCategoryCreate: vi.fn(),
    mockProductCategoryUpdate: vi.fn(),
    mockProductCategoryDelete: vi.fn(),
    mockProductFindMany: vi.fn(),
    mockProductFindFirst: vi.fn(),
    mockRetailerFindUnique: vi.fn(),
    mockAuditLogCreate: vi.fn(),
    mockPurgeExecuteRaw: vi.fn(),
    mockPurgeTransaction: vi.fn(),
    mockPurgeCategoryDelete: vi.fn(),
  };
});

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: {
      findUnique: mockRetailerFindUnique,
    },
    productCategory: {
      findMany: mockProductCategoryFindMany,
      findFirst: mockProductCategoryFindFirst,
      create: mockProductCategoryCreate,
      update: mockProductCategoryUpdate,
      delete: mockProductCategoryDelete,
    },
    product: {
      findMany: mockProductFindMany,
      findFirst: mockProductFindFirst,
    },
    auditLog: {
      create: mockAuditLogCreate,
    },
  },
  // The DELETE route must hard-delete through the scoped kanchuki_purge role
  // (SECURITY §19 — kanchuki_app has DELETE revoked), not the main client.
  getPurgePrisma: () => ({
    $executeRawUnsafe: mockPurgeExecuteRaw,
    productCategory: {
      delete: mockPurgeCategoryDelete,
    },
    $transaction: mockPurgeTransaction,
  }),
}));

vi.mock('@kanchuki/ai', () => ({
  getUploadPresignedUrl: vi.fn().mockResolvedValue('https://upload.url'),
  publicUrl: vi.fn((key: string) => `https://r2.cdn/${key}`),
}));

vi.mock('../lib/default-categories.js', () => ({
  seedDefaultCategories: vi.fn().mockResolvedValue(undefined),
}));

describe('GET /v1/categories — image fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRetailerFindUnique.mockResolvedValue({ id: 'ret_1', onboarding_completed: true });
  });

  it('uses the uploaded image_url when available', async () => {
    mockProductCategoryFindMany.mockResolvedValue([
      {
        id: 'cat_1',
        retailer_id: 'ret_1',
        name: 'Saree',
        image_url: 'https://r2.cdn/category-uploaded.jpg',
        _count: { products: 5 },
        products: [
          {
            photos: [{ url: 'https://r2.cdn/product-photo.jpg' }],
          },
        ],
      },
    ]);

    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.addHook('onRequest', async (req) => {
      req.retailerId = 'ret_1';
    });
    await app.register(categoryRoutes, { prefix: '/v1/categories' });

    const res = await app.inject({ method: 'GET', url: '/v1/categories' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data[0].image_url).toBe('https://r2.cdn/category-uploaded.jpg');
    await app.close();
  });

  it('falls back to the first product photo when category image_url is missing', async () => {
    mockProductCategoryFindMany.mockResolvedValue([
      {
        id: 'cat_2',
        retailer_id: 'ret_1',
        name: 'Kurti',
        image_url: null,
        _count: { products: 3 },
        products: [
          {
            photos: [{ url: 'https://r2.cdn/product-kurti-photo.jpg' }],
          },
        ],
      },
    ]);

    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.addHook('onRequest', async (req) => {
      req.retailerId = 'ret_1';
    });
    await app.register(categoryRoutes, { prefix: '/v1/categories' });

    const res = await app.inject({ method: 'GET', url: '/v1/categories' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data[0].image_url).toBe('https://r2.cdn/product-kurti-photo.jpg');
    await app.close();
  });
});

// ─── DELETE /v1/categories/:id — F-017 guardrail regression ───────────
// The route must hard-delete through getPurgePrisma() (kanchuki_purge role,
// which holds DELETE on product_categories) with app.allow_hard_delete set
// inside the transaction — never through the main kanchuki_app client, whose
// DELETE privilege is revoked under SECURITY §19 (root cause of the
// "Failed to delete category" error on the category screen).
describe('DELETE /v1/categories/:id — purge-role guardrail', () => {
  async function buildApp() {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.addHook('onRequest', async (req) => {
      req.retailerId = 'ret_1';
    });
    await app.register(categoryRoutes, { prefix: '/v1/categories' });
    return app;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockPurgeTransaction.mockImplementation(async (ops: Promise<unknown>[]) => {
      for (const op of ops) await op;
      return ops;
    });
    mockPurgeExecuteRaw.mockResolvedValue(undefined);
    mockPurgeCategoryDelete.mockResolvedValue({ id: 'cat_1' });
    mockAuditLogCreate.mockResolvedValue({});
  });

  it('deletes via the purge client with the guardrail flag set, not the main client', async () => {
    mockProductCategoryFindFirst.mockResolvedValue({
      id: 'cat_1',
      retailer_id: 'ret_1',
      name: 'Saree',
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/v1/categories/cat_1' });

    expect(res.statusCode).toBe(204);
    // Guardrail bypass + hard delete must both run inside the purge transaction.
    expect(mockPurgeExecuteRaw).toHaveBeenCalledWith("SET app.allow_hard_delete = 'true';");
    expect(mockPurgeCategoryDelete).toHaveBeenCalledWith({ where: { id: 'cat_1' } });
    expect(mockPurgeTransaction).toHaveBeenCalledTimes(1);
    // The DELETE-less main client must never be used for the hard delete.
    expect(mockProductCategoryDelete).not.toHaveBeenCalled();
    // Ownership is enforced before deleting.
    expect(mockProductCategoryFindFirst).toHaveBeenCalledWith({
      where: { id: 'cat_1', retailer_id: 'ret_1' },
    });
    // Audit trail written on the main client after the delete.
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor_type: 'retailer',
        action: 'delete',
        resource_type: 'ProductCategory',
        resource_id: 'cat_1',
      }),
    });
    await app.close();
  });

  it('returns 404 for another retailer\'s category and never deletes', async () => {
    mockProductCategoryFindFirst.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/v1/categories/cat_other' });

    expect(res.statusCode).toBe(404);
    expect(mockPurgeTransaction).not.toHaveBeenCalled();
    expect(mockPurgeCategoryDelete).not.toHaveBeenCalled();
    await app.close();
  });
});
