import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpdateManyPhoto = vi.fn();
const mockUpdateProduct = vi.fn();
const mockFindUniqueProduct = vi.fn();
const mockCountProduct = vi.fn();
const mockTagProductImageUrls = vi.fn();
const mockAddEmbeddingJob = vi.fn();
const mockFetchImageBuffer = vi.fn();
const mockFindFirstBg = vi.fn();
const mockFindFirstPhoto = vi.fn();

// F-010 quota gate (checkQuota/incrementUsage) — no plan_limits/override row
// in these fixtures, so effectiveLimit() resolves null and every call is a
// fail-open no-op, same as the unseeded-table behavior in production today.
const mockFindUniqueOverride = vi.fn().mockResolvedValue(null);
const mockFindUniqueOrThrowRetailer = vi.fn().mockResolvedValue({ plan: 'STARTER' });
const mockFindUniquePlanLimit = vi.fn().mockResolvedValue(null);
const mockUpsertUsageCounter = vi.fn().mockResolvedValue({});

vi.mock('@kanchuki/db', () => ({
  prisma: {
    productPhoto: { updateMany: mockUpdateManyPhoto, findFirst: mockFindFirstPhoto },
    backgroundImage: { findFirst: mockFindFirstBg },
    product: {
      update: mockUpdateProduct,
      findUnique: mockFindUniqueProduct,
      count: mockCountProduct,
    },
    retailer: { findUniqueOrThrow: mockFindUniqueOrThrowRetailer },
    retailerLimitOverride: { findUnique: mockFindUniqueOverride },
    planLimit: { findUnique: mockFindUniquePlanLimit },
    usageCounter: { upsert: mockUpsertUsageCounter },
  },
  Prisma: {},
}));

vi.mock('@kanchuki/ai', () => ({
  tagProductImageUrls: mockTagProductImageUrls,
  // Weighted quota reserve (F-023): return a fixed credit cost so the
  // checkQuota gate is deterministic in tests.
  reserveAiCredits: vi.fn().mockResolvedValue(5),
  // Best-effort cleanup is called with auto_cleanup=true (default) but
  // doesn't need to do anything in unit tests — the tagging assertions
  // are what we're actually testing.
  fetchImageBuffer: mockFetchImageBuffer,
  uploadBuffer: vi.fn().mockResolvedValue(undefined),
  cleanupProductPhoto: vi.fn().mockResolvedValue(Buffer.from('')),
}));

vi.mock('./index.js', () => ({
  addEmbeddingJob: mockAddEmbeddingJob,
}));

const { handleTagProduct } = await import('./tag-product.js');

const baseData = {
  product_id: 'prod_1',
  retailer_id: 'retailer_1',
  photo_url: 'https://cdn.example.com/front.jpg',
  r2_key: 'retailer_1/prod_1/front.jpg',
};

const fakeTags = {
  category: 'Kurti',
  subtype: 'Kurti',
  product_type: 'Readymade',
  primary_color: 'Pink',
  secondary_colors: [],
  fabric_estimate: 'Cotton',
  pattern: 'Printed',
  embellishments: [],
  neck_style: 'Round Neck',
  sleeve_type: 'Full Sleeve',
  occasions: ['Casual'],
  style: ['Anarkali Suits'],
  fabrics: ['Cotton'],
  price_range_estimate: null,
  design_number_visible: null,
  is_catalog_image: false,
  search_tags: ['pink kurti'],
  confidence_notes: null,
  product_name: 'Pink Printed Kurti',
  short_description: 'A pink printed cotton kurti, great for casual wear.',
};

beforeEach(() => {
  mockUpdateManyPhoto.mockReset().mockResolvedValue({ count: 1 });
  mockUpdateProduct.mockReset().mockResolvedValue({});
  mockFindUniqueProduct.mockReset().mockResolvedValue({
    name: null,
    sku: null,
    description: null,
    subtype: null,
  });
  mockCountProduct.mockReset().mockResolvedValue(0);
  mockTagProductImageUrls.mockReset();
  mockAddEmbeddingJob.mockReset().mockResolvedValue(undefined);
  mockFetchImageBuffer.mockReset().mockRejectedValue(new Error('mock: no network'));
  mockFindFirstBg.mockReset().mockResolvedValue(null);
  mockFindFirstPhoto.mockReset().mockResolvedValue(null);
  mockFindUniqueOverride.mockReset().mockResolvedValue(null);
  mockFindUniqueOrThrowRetailer.mockReset().mockResolvedValue({ plan: 'STARTER' });
  mockFindUniquePlanLimit.mockReset().mockResolvedValue(null);
  mockUpsertUsageCounter.mockReset().mockResolvedValue({});
});

describe('handleTagProduct', () => {
  it('tags the primary photo only', async () => {
    mockTagProductImageUrls.mockResolvedValue(fakeTags);

    await handleTagProduct(baseData);

    // The job now passes attribution opts (onProviderUsed) as the second arg.
    expect(mockTagProductImageUrls).toHaveBeenCalledWith(
      [baseData.photo_url],
      expect.objectContaining({ onProviderUsed: expect.any(Function) }),
    );
  });

  it('writes tags to product and marks primary photo tagged, then queues embedding', async () => {
    mockTagProductImageUrls.mockResolvedValue(fakeTags);

    await handleTagProduct(baseData);

    expect(mockUpdateProduct).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: expect.objectContaining({
        ai_tagged: true,
        ai_tag_error: null,
        category: 'Kurti',
        primary_color: 'Pink',
      }),
    });

    expect(mockUpdateManyPhoto).toHaveBeenNthCalledWith(2, {
      where: { product_id: 'prod_1', is_primary: true },
      data: expect.objectContaining({ ai_tagged: true }),
    });

    expect(mockAddEmbeddingJob).toHaveBeenCalledWith({
      product_id: 'prod_1',
      retailer_id: 'retailer_1',
    });
  });

  it('includes design_number metadata only when visible on tag', async () => {
    mockTagProductImageUrls.mockResolvedValue({
      ...fakeTags,
      design_number_visible: 'DN-2201',
    });

    await handleTagProduct(baseData);

    expect(mockUpdateProduct).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: expect.objectContaining({
        metadata: { design_number: 'DN-2201', is_catalog_image: false },
      }),
    });
  });

  it('fills name/sku/description/subtype when currently unset', async () => {
    mockTagProductImageUrls.mockResolvedValue(fakeTags);

    await handleTagProduct(baseData);

    expect(mockUpdateProduct).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: expect.objectContaining({
        name: 'Pink Printed Kurti',
        description: 'A pink printed cotton kurti, great for casual wear.',
        subtype: 'Kurti',
        sku: 'KP0001',
        styles: ['Anarkali Suits'],
        fabrics: ['Cotton'],
        occasions: ['Casual'],
      }),
    });
  });

  it('never overwrites a retailer-edited name/sku/description/subtype on re-tag', async () => {
    mockFindUniqueProduct.mockResolvedValue({
      name: 'Retailer Custom Name',
      sku: 'CUSTOM-1',
      description: 'Retailer written description',
      subtype: 'Custom Subtype',
    });
    mockTagProductImageUrls.mockResolvedValue(fakeTags);

    await handleTagProduct(baseData);

    const call = mockUpdateProduct.mock.calls[0]?.[0];
    expect(call.data).not.toHaveProperty('name');
    expect(call.data).not.toHaveProperty('sku');
    expect(call.data).not.toHaveProperty('description');
    expect(call.data).not.toHaveProperty('subtype');
    // count() shouldn't even be queried — sku was already set.
    expect(mockCountProduct).not.toHaveBeenCalled();
  });

  it('never overwrites retailer-picked styles/fabrics on re-tag', async () => {
    mockFindUniqueProduct.mockResolvedValue({
      name: null,
      sku: null,
      description: null,
      subtype: null,
      styles: ['Indo Western'],
      fabrics: ['Silk'],
    });
    mockTagProductImageUrls.mockResolvedValue(fakeTags);

    await handleTagProduct(baseData);

    const call = mockUpdateProduct.mock.calls[0]?.[0];
    expect(call.data).not.toHaveProperty('styles');
    expect(call.data).not.toHaveProperty('fabrics');
    // name/sku/description/subtype are still filled (all null in the fixture)
    expect(call.data).toHaveProperty('name');
    expect(call.data).toHaveProperty('subtype');
  });

  it('never overwrites retailer-picked occasions on re-tag', async () => {
    mockFindUniqueProduct.mockResolvedValue({
      name: null,
      sku: null,
      description: null,
      subtype: null,
      occasions: ['Wedding'],
    });
    mockTagProductImageUrls.mockResolvedValue(fakeTags);

    await handleTagProduct(baseData);

    const call = mockUpdateProduct.mock.calls[0]?.[0];
    expect(call.data).not.toHaveProperty('occasions');
    // styles/fabrics still fill (empty in the fixture)
    expect(call.data).toHaveProperty('styles');
    expect(call.data).toHaveProperty('fabrics');
  });

  it('marks product failed and rethrows when tagging fails', async () => {
    mockTagProductImageUrls.mockRejectedValue(new Error('Claude timed out'));

    await expect(handleTagProduct(baseData)).rejects.toThrow('Claude timed out');

    expect(mockUpdateProduct).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { ai_tagged: false, ai_tag_error: 'Claude timed out' },
    });
    expect(mockAddEmbeddingJob).not.toHaveBeenCalled();
  });

  it('F-028: dark garment + no explicit bg → auto-picks a LIGHT backdrop', async () => {
    mockTagProductImageUrls.mockResolvedValue({ ...fakeTags, primary_color: 'Black' });
    // First findUnique is the cleanup's withBg lookup (no explicit pick),
    // second is the name/sku read after tagging.
    mockFindUniqueProduct
      .mockResolvedValueOnce({ background_image: null })
      .mockResolvedValue({ name: null, sku: null, description: null, subtype: null });
    mockFindFirstBg.mockResolvedValue({ image_url: 'https://cdn/x/light.jpg' });
    mockFetchImageBuffer.mockResolvedValue(Buffer.from('raw'));
    mockFindFirstPhoto.mockResolvedValue(null); // skip preserve-original

    await handleTagProduct(baseData);

    expect(mockFindFirstBg).toHaveBeenCalledWith({
      where: { is_active: true, tone: 'LIGHT' },
      orderBy: { created_at: 'desc' },
    });
    expect(mockTagProductImageUrls).toHaveBeenCalled();
  });

  it('F-028: explicit retailer-picked background wins over auto-contrast', async () => {
    mockTagProductImageUrls.mockResolvedValue({ ...fakeTags, primary_color: 'White' });
    mockFindUniqueProduct
      .mockResolvedValueOnce({
        background_image: {
          is_active: true,
          image_url: 'https://cdn/x/picked.jpg',
        },
      })
      .mockResolvedValue({ name: null, sku: null, description: null, subtype: null });
    mockFetchImageBuffer.mockResolvedValue(Buffer.from('raw'));
    mockFindFirstPhoto.mockResolvedValue(null);

    await handleTagProduct(baseData);

    // Auto-contrast never consulted — explicit pick wins.
    expect(mockFindFirstBg).not.toHaveBeenCalled();
  });
});
