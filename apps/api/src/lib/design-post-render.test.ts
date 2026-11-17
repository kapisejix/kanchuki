import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  findFirst: vi.fn(),
  downloadBuffer: vi.fn(),
  renderDesign: vi.fn(),
  retailer: vi.fn(),
  products: vi.fn(),
}));
vi.mock('@kanchuki/ai', () => ({ downloadBuffer: m.downloadBuffer, renderDesign: m.renderDesign }));
vi.mock('@kanchuki/db', () => ({
  prisma: {
    designTemplate: { findFirst: m.findFirst },
    retailer: { findUniqueOrThrow: m.retailer },
    product: { findMany: m.products },
  },
}));
vi.mock('@kanchuki/shared', async (orig) => ({
  ...(await orig<typeof import('@kanchuki/shared')>()),
  parseDesignSpec: () => ({ ok: true, spec: {} }),
}));

const { findPublishedDesign, findPublishedAiPoster, renderDesignJpeg } = await import(
  './design-post-render.js'
);

beforeEach(() => vi.clearAllMocks());

describe('findPublishedDesign', () => {
  it('excludes AI styles (ai_prompt must be null)', async () => {
    m.findFirst.mockResolvedValue(null);
    await findPublishedDesign('d1', 'STARTER');
    expect(m.findFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'd1',
      status: 'PUBLISHED',
      plans: { has: 'STARTER' },
      ai_prompt: null,
    });
  });
});

describe('findPublishedAiPoster', () => {
  it('only matches a PUBLISHED, plan-allowed row whose ai_prompt is set', async () => {
    m.findFirst.mockResolvedValue({ id: 'd1' });
    await findPublishedAiPoster('d1', 'GROWTH');
    expect(m.findFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'd1',
      status: 'PUBLISHED',
      plans: { has: 'GROWTH' },
      ai_prompt: { not: null },
    });
  });
});

describe('renderDesignJpeg backgroundOverride / omitProductImages', () => {
  const design = {
    id: 'd1',
    format: 'SQUARE_1_1',
    product_slots: 1,
    spec: {},
    background_key: 'bg-key',
  };
  beforeEach(() => {
    m.retailer.mockResolvedValue({
      shop_name: 'S',
      city: 'C',
      phone: '9',
      whatsapp_number: null,
      public_slug: null,
      logo_r2_key: null,
    });
    m.products.mockResolvedValue([
      {
        id: 'p1',
        name: 'N',
        sku: null,
        price_min: 100,
        mrp: null,
        fabrics: [],
        fabric_estimate: null,
        photos: [],
      },
    ]);
    m.renderDesign.mockResolvedValue(Buffer.from('jpg'));
  });

  it('uses the override and skips product photos', async () => {
    const scene = Buffer.from('scene');
    await renderDesignJpeg({
      retailerId: 'r1',
      design,
      productIds: ['p1'],
      backgroundOverride: scene,
      omitProductImages: true,
    });
    expect(m.downloadBuffer).not.toHaveBeenCalled();
    const arg = m.renderDesign.mock.calls[0]?.[0];
    expect(arg.background).toBe(scene);
    expect(arg.products[0].image).toBeNull();
  });

  it('still demands photos and downloads the background by default', async () => {
    await expect(
      renderDesignJpeg({ retailerId: 'r1', design, productIds: ['p1'] }),
    ).rejects.toThrow('no photo');
  });
});
