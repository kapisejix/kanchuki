// Route tests for public Suits Designs — strip, browse, permalink (§2.4/§5).
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const {
  mockProductFindFirst,
  mockCategoryFindFirst,
  mockDesignFindMany,
  mockDesignFindFirst,
  mockRetailerFindFirst,
  mockWithPublicCache,
  mockGetConfig,
} = vi.hoisted(() => ({
  mockProductFindFirst: vi.fn(),
  mockCategoryFindFirst: vi.fn(),
  mockDesignFindMany: vi.fn(),
  mockDesignFindFirst: vi.fn(),
  mockRetailerFindFirst: vi.fn(),
  mockWithPublicCache: vi.fn(),
  mockGetConfig: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: { findFirst: mockProductFindFirst },
    showcaseDesignCategory: { findFirst: mockCategoryFindFirst },
    showcaseDesign: { findMany: mockDesignFindMany, findFirst: mockDesignFindFirst },
    retailer: { findFirst: mockRetailerFindFirst },
  },
}));

vi.mock('../../lib/public-cache.js', () => ({
  withPublicCache: mockWithPublicCache,
}));

vi.mock('../../lib/showcase-watermark.js', () => ({
  getShowcaseWatermarkConfig: mockGetConfig,
}));

const { publicShowcaseDesignsRoutes } = await import('./public-showcase-designs.js');

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicShowcaseDesignsRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  // withPublicCache(url, fn) → run the callback straight through.
  mockWithPublicCache.mockImplementation(async (_url: string, fn: () => Promise<unknown>) => fn());
  mockGetConfig.mockResolvedValue({ strip_count: 6 });
});

describe('GET /showcase-designs?product_id= (product-detail strip)', () => {
  it('a Saree product expands related (saree + blouse) and returns only global + own rows', async () => {
    mockProductFindFirst.mockResolvedValue({ category: 'Saree', retailer_id: 'r1' });
    mockCategoryFindFirst.mockResolvedValue({
      slug: 'saree',
      name: 'Saree',
      related_to: [{ slug: 'blouse' }],
      related_from: [],
    });
    mockDesignFindMany.mockResolvedValue([
      {
        id: 'd1',
        name: 'Banarasi Silk',
        image_url: 'https://cdn.test/showcase-designs/global/d1.jpg',
        category_slug: 'saree',
        retailer_id: null,
        category: { name: 'Saree', slug: 'saree' },
        retailer: null,
      },
      {
        id: 'd2',
        name: 'Boat Neck Blouse',
        image_url: 'https://cdn.test/showcase-designs/r1/d2.jpg',
        category_slug: 'blouse',
        retailer_id: 'r1',
        category: { name: 'Blouse', slug: 'blouse' },
        retailer: { id: 'r1', shop_name: 'Radha Store', public_slug: 'radha' },
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/showcase-designs?product_id=p1' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;

    // Expansion set = saree + blouse; scope = global OR the product's retailer.
    expect(mockDesignFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          is_active: true,
          category_slug: { in: ['saree', 'blouse'] },
          OR: [{ retailer_id: null }, { retailer_id: 'r1' }],
        },
        take: 6,
      }),
    );
    expect(data.category).toEqual({
      slug: 'saree',
      name: 'Saree',
      related: ['saree', 'blouse'],
    });
    expect(data.designs).toHaveLength(2);
    expect(data.designs[0].store).toBeNull(); // global
    expect(data.designs[1].store).toEqual({ shop_name: 'Radha Store', slug: 'radha' });
    // no internal fields leak
    expect(data.designs[0]).not.toHaveProperty('r2_key');
    await app.close();
  });

  it('unknown product category → empty strip (no guesswork)', async () => {
    mockProductFindFirst.mockResolvedValue({ category: 'Footwear', retailer_id: 'r1' });
    mockCategoryFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/showcase-designs?product_id=p1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.designs).toEqual([]);
    expect(res.json().data.category).toBeNull();
    expect(mockDesignFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('missing product → 404', async () => {
    mockProductFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/showcase-designs?product_id=nope' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /showcase-designs?store= (browse feed)', () => {
  it('resolves the store, scopes to its rows + global, maps store identity', async () => {
    mockRetailerFindFirst.mockResolvedValue({ id: 'r1' });
    mockDesignFindMany.mockResolvedValue([
      {
        id: 'd2',
        name: 'Boat Neck Blouse',
        image_url: 'https://cdn.test/showcase-designs/r1/d2.jpg',
        category_slug: 'blouse',
        retailer_id: 'r1',
        category: { name: 'Blouse', slug: 'blouse' },
        retailer: { id: 'r1', shop_name: 'Radha Store', public_slug: 'radha' },
      },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/showcase-designs?store=radha' });
    expect(res.statusCode).toBe(200);
    expect(mockRetailerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ public_slug: 'radha' }) }),
    );
    expect(mockDesignFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          is_active: true,
          OR: [{ retailer_id: null }, { retailer_id: 'r1' }],
        },
      }),
    );
    expect(res.json().data.designs[0].store).toEqual({
      shop_name: 'Radha Store',
      slug: 'radha',
    });
    await app.close();
  });

  it('browse by a category returns the related chips', async () => {
    mockRetailerFindFirst.mockResolvedValue({ id: 'r1' });
    mockCategoryFindFirst.mockResolvedValue({
      slug: 'saree',
      related_to: [{ slug: 'blouse' }],
      related_from: [],
    });
    mockDesignFindMany.mockResolvedValue([]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/showcase-designs?store=radha&category=saree',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.related).toEqual(['saree', 'blouse']);
    expect(mockDesignFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category_slug: { in: ['saree', 'blouse'] } }),
      }),
    );
    await app.close();
  });

  it('unknown store → 404', async () => {
    mockRetailerFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/showcase-designs?store=ghost' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /showcase-designs/:id (permalink)', () => {
  it('returns permalink data for an active design', async () => {
    mockDesignFindFirst.mockResolvedValue({
      id: 'd1',
      name: 'Banarasi Silk',
      image_url: 'https://cdn.test/showcase-designs/global/d1.jpg',
      category_slug: 'saree',
      retailer_id: null,
      created_at: new Date('2026-09-07T10:00:00Z'),
      category: { name: 'Saree' },
      retailer: null,
    });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/showcase-designs/d1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.store).toBeNull();
    expect(res.json().data.category).toEqual({ slug: 'saree', name: 'Saree' });
    expect(mockDesignFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'd1', is_active: true } }),
    );
    await app.close();
  });

  it('inactive or unknown → 404', async () => {
    mockDesignFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/showcase-designs/d_inactive' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
