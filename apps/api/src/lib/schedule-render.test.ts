import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  downloadBuffer: vi.fn(),
  uploadBuffer: vi.fn(),
  renderSlide: vi.fn(),
  normalizePhoto: vi.fn(),
  renderCollage: vi.fn(),
  itemUpdateMany: vi.fn(),
  festivalFindFirst: vi.fn(),
}));

vi.mock('@kanchuki/ai', () => ({
  downloadBuffer: m.downloadBuffer,
  uploadBuffer: m.uploadBuffer,
  publicUrl: (k: string) => `https://cdn/${k}`,
  renderSlide: m.renderSlide,
  normalizePhoto: m.normalizePhoto,
  renderCollage: m.renderCollage,
  isSlideTemplate: (v: unknown) =>
    ['white_price', 'new_arrival', 'festival_frame', 'logo_corner'].includes(v as string),
  isCoverStyle: (v: unknown) => v === 'collage_cover',
}));
vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: {
      findUniqueOrThrow: vi.fn(async () => ({ shop_name: 'Anita', logo_r2_key: 'logo.png' })),
    },
    productPhoto: {
      findMany: vi.fn(async () => [
        {
          id: 'ph1',
          product_id: 'p1',
          url: 'https://r2/p1.jpg',
          r2_key: 'k/p1.jpg',
          is_primary: true,
        },
        {
          id: 'ph2',
          product_id: 'p2',
          url: 'https://r2/p2.jpg',
          r2_key: 'k/p2.jpg',
          is_primary: true,
        },
        {
          id: 'ph3',
          product_id: 'p3',
          url: 'https://r2/p3.jpg',
          r2_key: 'k/p3.jpg',
          is_primary: true,
        },
      ]),
    },
    product: {
      findMany: vi.fn(async () => [
        { id: 'p1', name: 'A', price_min: 150000 },
        { id: 'p2', name: 'B', price_min: 90000 },
        { id: 'p3', name: 'C', price_min: 70000 },
      ]),
    },
    festival: { findFirst: m.festivalFindFirst },
    scheduledPostItem: { updateMany: m.itemUpdateMany },
  },
}));

import { resolvePostImages, styleItemNow } from './schedule-render.js';

const item = (n: number, over: Record<string, unknown> = {}) => ({
  id: `i${n}`,
  product_id: `p${n}`,
  position: n - 1,
  photo_id: `ph${n}`,
  image_level: 'ORIGINAL' as 'ORIGINAL' | 'TEMPLATE',
  template_id: null as string | null,
  resolved_image_key: null as string | null,
  ...over,
});
const base = { retailerId: 'r1', postId: 'sp1', scheduledAt: new Date('2026-10-20T14:00:00Z') };

beforeEach(() => {
  vi.clearAllMocks();
  m.downloadBuffer.mockResolvedValue(Buffer.from('img'));
  m.uploadBuffer.mockResolvedValue(undefined);
  m.renderSlide.mockResolvedValue(Buffer.from('slide'));
  m.normalizePhoto.mockResolvedValue(Buffer.from('norm'));
  m.renderCollage.mockResolvedValue(Buffer.from('collage'));
  m.festivalFindFirst.mockResolvedValue({ name: 'Diwali' });
});

describe('resolvePostImages', () => {
  it('all originals, no cover → original urls, nothing rendered or uploaded', async () => {
    const urls = await resolvePostImages({ ...base, coverStyle: null, items: [item(1), item(2)] });
    expect(urls).toEqual(['https://r2/p1.jpg', 'https://r2/p2.jpg']);
    expect(m.renderSlide).not.toHaveBeenCalled();
    expect(m.uploadBuffer).not.toHaveBeenCalled();
  });

  it('one templated slide → rendered + key persisted; originals normalised to 4:5', async () => {
    const urls = await resolvePostImages({
      ...base,
      coverStyle: null,
      items: [item(1, { image_level: 'TEMPLATE', template_id: 'new_arrival' }), item(2)],
    });
    expect(m.renderSlide).toHaveBeenCalledTimes(1);
    expect(m.renderSlide.mock.calls[0]?.[0]).toBe('new_arrival');
    expect(m.normalizePhoto).toHaveBeenCalledTimes(1);
    expect(urls).toHaveLength(2);
    expect(urls.every((u) => u.startsWith('https://cdn/retailers/r1/schedule/sp1-'))).toBe(true);
    expect(m.itemUpdateMany).toHaveBeenCalledWith({
      where: { id: 'i1', retailer_id: 'r1' },
      data: {
        resolved_image_key: expect.stringContaining('retailers/r1/schedule/sp1-0-new_arrival'),
      },
    });
  });

  it('reuses an existing resolved_image_key (no second render)', async () => {
    const urls = await resolvePostImages({
      ...base,
      coverStyle: null,
      items: [
        item(1, {
          image_level: 'TEMPLATE',
          template_id: 'white_price',
          resolved_image_key: 'done/1.jpg',
        }),
      ],
    });
    expect(m.renderSlide).not.toHaveBeenCalled();
    expect(urls).toEqual(['https://cdn/done/1.jpg']);
  });

  it('price strip uses the price at publish time', async () => {
    await resolvePostImages({
      ...base,
      coverStyle: null,
      items: [item(1, { image_level: 'TEMPLATE', template_id: 'white_price' })],
    });
    expect(m.renderSlide.mock.calls[0]?.[1]).toMatchObject({
      pricePaise: 150000,
      storeName: 'Anita',
    });
  });

  it('festival frame looks up the nearest festival', async () => {
    await resolvePostImages({
      ...base,
      coverStyle: null,
      items: [item(1, { image_level: 'TEMPLATE', template_id: 'festival_frame' })],
    });
    expect(m.renderSlide.mock.calls[0]?.[1]).toMatchObject({ festival: 'Diwali' });
  });

  it('cover is prepended for 2–9 slides and built from ≤4 photos', async () => {
    const urls = await resolvePostImages({
      ...base,
      coverStyle: 'collage_cover',
      items: [item(1), item(2), item(3)],
    });
    expect(urls).toHaveLength(4);
    expect(urls[0]).toContain('sp1-cover');
    expect(m.renderCollage.mock.calls[0]?.[0]).toHaveLength(3);
  });

  it('no cover for a single slide or when the post is already at the 10-slide cap', async () => {
    const one = await resolvePostImages({ ...base, coverStyle: 'collage_cover', items: [item(1)] });
    expect(one).toEqual(['https://r2/p1.jpg']);
    const ten = Array.from({ length: 10 }, (_, i) =>
      item((i % 3) + 1, { id: `x${i}`, position: i }),
    );
    const urls = await resolvePostImages({ ...base, coverStyle: 'collage_cover', items: ten });
    expect(m.renderCollage).not.toHaveBeenCalled();
    expect(urls).toHaveLength(10);
  });

  it('a render failure degrades to the original photo, never throws', async () => {
    m.renderSlide.mockRejectedValue(new Error('sharp exploded'));
    const urls = await resolvePostImages({
      ...base,
      coverStyle: null,
      items: [item(1, { image_level: 'TEMPLATE', template_id: 'new_arrival' })],
    });
    expect(urls).toEqual(['https://r2/p1.jpg']);
  });

  it('a cover failure skips the cover but keeps the slides', async () => {
    m.renderCollage.mockRejectedValue(new Error('boom'));
    const urls = await resolvePostImages({
      ...base,
      coverStyle: 'collage_cover',
      items: [item(1), item(2)],
    });
    expect(urls).toHaveLength(2);
  });
});

describe('styleItemNow', () => {
  it('renders, stores the key + TEMPLATE level, returns the key', async () => {
    const key = await styleItemNow('r1', 'sp1', item(1), 'logo_corner', base.scheduledAt);
    expect(key).toContain('retailers/r1/schedule/sp1-0-logo_corner');
    expect(m.itemUpdateMany).toHaveBeenCalledWith({
      where: { id: 'i1', retailer_id: 'r1' },
      data: { image_level: 'TEMPLATE', template_id: 'logo_corner', resolved_image_key: key },
    });
    // the logo was fetched from R2 for the corner template
    expect(m.downloadBuffer).toHaveBeenCalledWith('logo.png');
  });

  it('propagates a render failure so the route can report it', async () => {
    m.renderSlide.mockRejectedValue(new Error('nope'));
    await expect(
      styleItemNow('r1', 'sp1', item(1), 'new_arrival', base.scheduledAt),
    ).rejects.toThrow();
    expect(m.itemUpdateMany).not.toHaveBeenCalled();
  });
});
