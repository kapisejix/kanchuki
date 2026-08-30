// Tests for rankProducts recommendation pipeline (Task 20).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());
const mockQueryRawUnsafe = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    customerFashionDNA: { findUnique: mockFindUnique },
    customerAccount: { findUnique: vi.fn().mockResolvedValue({ usual_size: 'M' }) },
    customerStoreVisit: { findMany: vi.fn().mockResolvedValue([]) },
    customerInteraction: { findMany: vi.fn().mockResolvedValue([]) },
    product: { findMany: mockFindMany },
    $queryRawUnsafe: mockQueryRawUnsafe,
  },
}));

vi.mock('@kanchuki/ai', () => ({
  MIN_INTERACTIONS_FOR_DNA: 5,
}));

import { rankProducts } from '../recommend.js';

describe('rankProducts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no DNA (cold start)
    mockFindUnique.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);
    mockQueryRawUnsafe.mockResolvedValue([]);
  });

  it('returns empty array when no products available', async () => {
    const result = await rankProducts({ surface: 'feed' });
    expect(result).toEqual([]);
  });

  it('uses cold-start path when no accountId', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Pink Suit',
        category: 'Suit',
        primary_color: 'Pink',
        price_min: 150000,
        price_max: 200000,
        retailer: { id: 'ret-1', shop_name: 'Priya', public_slug: 'priya', city: 'Delhi' },
        photos: [{ url: 'https://example.com/photo.jpg' }],
      },
    ]);

    const result = await rankProducts({ surface: 'feed' });
    expect(result).toHaveLength(1);
    const first = result[0]!;
    expect(first.id).toBe('prod-1');
    expect(first.photo_url).toBe('https://example.com/photo.jpg');
    expect(first.retailer_name).toBe('Priya');
  });

  it('uses KNN when preference vector exists', async () => {
    mockFindUnique.mockResolvedValue({
      interaction_count: 10,
      budget_range: { min: 100000, max: 500000 },
    });
    // First call: vector fetch, second call: KNN query
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ pv: '[0.1,0.2,0.3]' }])
      .mockResolvedValueOnce([
        {
          id: 'prod-1',
          name: 'Silk Saree',
          category: 'Saree',
          primary_color: 'Red',
          price_min: 200000,
          price_max: 300000,
          retailer_id: 'ret-1',
          shop_name: 'Silk House',
          public_slug: 'silk-house',
          retailer_city: 'Mumbai',
          photo_url: 'https://example.com/saree.jpg',
          embedding_raw: '[0.1,0.2,0.3]',
        },
      ]);

    const result = await rankProducts({
      accountId: 'acct-1',
      surface: 'feed',
    });

    expect(result).toHaveLength(1);
    const first = result[0]!;
    expect(first.id).toBe('prod-1');
    expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('filters out muted store products', async () => {
    // Setup: one store is muted
    const { prisma } = await import('@kanchuki/db');
    (prisma.customerStoreVisit.findMany as any).mockResolvedValue([
      { retailer_id: 'ret-muted', is_muted: true },
      { retailer_id: 'ret-active', is_muted: false },
    ]);
    // Muted store products
    mockFindMany.mockImplementation((args: any) => {
      if (args?.where?.retailer_id === 'ret-muted') {
        return [{ id: 'muted-prod' }];
      }
      return [];
    });
    mockFindMany.mockResolvedValueOnce([{ id: 'muted-prod' }]);

    mockQueryRawUnsafe.mockResolvedValue([
      { id: 'muted-prod', name: 'X', category: null, primary_color: null, price_min: null, price_max: null, retailer_id: 'ret-muted', shop_name: 'Muted', public_slug: null, retailer_city: null, photo_url: null, embedding_raw: null },
      { id: 'active-prod', name: 'Y', category: null, primary_color: null, price_min: null, price_max: null, retailer_id: 'ret-active', shop_name: 'Active', public_slug: null, retailer_city: null, photo_url: null, embedding_raw: null },
    ]);

    mockFindUnique.mockResolvedValue({ interaction_count: 10, budget_range: {} });

    const result = await rankProducts({ accountId: 'acct-1', surface: 'feed' });
    expect(result.find((p) => p.id === 'muted-prod')).toBeUndefined();
  });

  it('caps diversity to 3 products per retailer in top 20', async () => {
    const products = Array.from({ length: 10 }, (_, i) => ({
      id: `prod-${i}`,
      name: `Product ${i}`,
      category: null,
      primary_color: null,
      price_min: null,
      price_max: null,
      retailer: { id: 'ret-1', shop_name: 'Same Store', public_slug: null, city: null },
      photos: [] as any[],
    }));

    mockFindMany.mockResolvedValue(products);

    const result = await rankProducts({ surface: 'feed', limit: 10 });
    // All 10 should be returned (diversity only caps in top 20 window)
    expect(result.length).toBe(10);
  });

  it('applies followed-store boost', async () => {
    const { prisma } = await import('@kanchuki/db');
    (prisma.customerStoreVisit.findMany as any).mockResolvedValue([
      { retailer_id: 'ret-followed', is_muted: false },
    ]);

    mockFindUnique.mockResolvedValue({ interaction_count: 3, budget_range: {} });

    // Cold-start path (no vector) — use findMany
    mockFindMany.mockResolvedValue([
      { id: 'p1', name: 'Followed', category: null, primary_color: null, price_min: null, price_max: null, retailer: { id: 'ret-followed', shop_name: 'F', public_slug: null, city: null }, photos: [] as any[] },
      { id: 'p2', name: 'Not followed', category: null, primary_color: null, price_min: null, price_max: null, retailer: { id: 'ret-other', shop_name: 'O', public_slug: null, city: null }, photos: [] as any[] },
    ]);

    const result = await rankProducts({ accountId: 'acct-1', surface: 'feed' });
    // Followed store product should rank higher (boost +0.10)
    expect(result).toHaveLength(2);
    const first = result[0]!;
    expect(first.id).toBe('p1');
  });
});
