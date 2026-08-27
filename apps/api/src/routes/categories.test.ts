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
  },
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

