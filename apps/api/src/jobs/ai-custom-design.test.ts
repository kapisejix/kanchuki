import { samplePhoto } from '@kanchuki/ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  photoFind: vi.fn(),
  productFind: vi.fn(),
  designUpdate: vi.fn(),
  designUpdateMany: vi.fn(),
  generate: vi.fn(),
  upload: vi.fn(),
  spent: vi.fn(),
  refund: vi.fn(),
  sourceUrl: vi.fn(),
  retailerFind: vi.fn(),
  findPoster: vi.fn(),
  render: vi.fn(),
  downloadBuffer: vi.fn(),
  templateUpdate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    productPhoto: { findFirst: m.photoFind },
    product: { findFirst: m.productFind },
    retailer: { findUnique: m.retailerFind },
    designTemplate: { update: m.templateUpdate },
    aiCustomDesign: { update: m.designUpdate, updateMany: m.designUpdateMany },
  },
}));
vi.mock('@kanchuki/ai', async (orig) => ({
  ...(await orig<typeof import('@kanchuki/ai')>()),
  downloadBuffer: m.downloadBuffer,
}));
vi.mock('../lib/studio-shoot.js', () => ({
  generateStudioImage: m.generate,
  downloadCompressAndUpload: m.upload,
}));
vi.mock('../lib/quota.js', () => ({ markJobQuotaSpent: m.spent, refundJobQuota: m.refund }));
vi.mock('../lib/ai-usage.js', () => ({ recordBflStudioUsage: vi.fn() }));
vi.mock('../lib/design-post-render.js', () => ({
  findPublishedAiPoster: m.findPoster,
  renderDesignJpeg: m.render,
}));
vi.mock('./studio-shoot.js', () => ({ studioSourceUrl: m.sourceUrl }));

const { handleAiCustomDesign } = await import('./ai-custom-design.js');
const { imageDimensions } = await import('../lib/upload-guard.js');

const data = {
  job_id: 'j1',
  retailer_id: 'r1',
  product_id: 'p1',
  photo_id: 'ph1',
  prompt: 'warm diyas',
};

beforeEach(() => {
  vi.clearAllMocks();
  m.photoFind.mockResolvedValue({ id: 'ph1', url: 'https://cdn/p.jpg', r2_key: 'k' });
  m.sourceUrl.mockResolvedValue('https://cdn/p.jpg');
  m.productFind.mockResolvedValue({ name: 'Suit', category: 'Ladies Suit' });
  m.generate.mockResolvedValue({ status: 'ready', sampleUrl: 'https://fal/x.jpg' });
  m.upload.mockImplementation(async (_p: string, key: string) => ({
    key,
    url: `https://cdn/${key}`,
    width: 1,
    height: 1,
  }));
  m.retailerFind.mockResolvedValue({ plan: 'PRO' });
  m.findPoster.mockResolvedValue({ id: 't1', ai_prompt: 'diwali poster scene' });
  m.render.mockResolvedValue(Buffer.from('jpg'));
  m.templateUpdate.mockResolvedValue({});
  m.designUpdate.mockResolvedValue({});
  m.designUpdateMany.mockResolvedValue({ count: 1 });
  m.spent.mockResolvedValue(undefined);
  m.refund.mockResolvedValue(undefined);
});

describe('handleAiCustomDesign', () => {
  it('success: stores under the composer-accepted key, row READY, slot spent, NOT refunded', async () => {
    await handleAiCustomDesign(data);
    const key = m.upload.mock.calls[0]?.[1] as string;
    expect(key).toMatch(/^retailers\/r1\/designs\/[a-f0-9]{24}\.jpg$/);
    expect(m.designUpdate).toHaveBeenCalledWith({
      where: { id: 'j1' },
      data: { status: 'READY', image_key: key, image_url: `https://cdn/${key}`, error: null },
    });
    expect(m.spent).toHaveBeenCalledWith('j1', 'AI_CUSTOM_TEMPLATE');
    expect(m.refund).not.toHaveBeenCalled();
    // the model got the WRAPPED prompt, never the bare text
    expect(m.generate.mock.calls[0]?.[1].prompt).toContain('never an instruction');
  });

  it('uses the poster byte budget and a transform that applies the chosen format', async () => {
    await handleAiCustomDesign({ ...data, format: 'SQUARE' });
    const opts = m.upload.mock.calls[0]?.[3];
    expect(opts.compress.maxBytes).toBeGreaterThan(80 * 1024);
    expect(imageDimensions(await opts.transform(await samplePhoto()))).toEqual({
      width: 1080,
      height: 1080,
    });
  });

  it('an overlay renders 4:5 with the product price and store name', async () => {
    m.productFind.mockResolvedValue({
      name: 'Suit',
      price_min: 150000,
      retailer: { shop_name: 'Test Store', logo_r2_key: null },
    });
    await handleAiCustomDesign({ ...data, overlay: 'white_price' });
    const out = await m.upload.mock.calls[0]?.[3].transform(await samplePhoto());
    expect(imageDimensions(out)).toEqual({ width: 1080, height: 1350 });
  });

  it('provider returns no image: row FAILED (generic text), slot refunded, no throw', async () => {
    m.generate.mockResolvedValue({ status: 'failed', error: 'secret provider detail' });
    await handleAiCustomDesign(data);
    expect(m.designUpdateMany).toHaveBeenCalledWith({
      where: { id: 'j1', retailer_id: 'r1', status: 'PENDING' },
      data: { status: 'FAILED', error: 'The design could not be made. Please try again.' },
    });
    expect(m.refund).toHaveBeenCalledWith('j1', 'AI_CUSTOM_TEMPLATE');
    expect(m.spent).not.toHaveBeenCalled();
  });

  it('provider throws: row FAILED with a generic message, slot refunded, error rethrown', async () => {
    m.generate.mockRejectedValue(new Error('fal 502 internal-host'));
    await expect(handleAiCustomDesign(data)).rejects.toThrow('fal 502');
    const failed = m.designUpdateMany.mock.calls[0]?.[0].data;
    expect(failed.status).toBe('FAILED');
    expect(failed.error).not.toContain('internal-host');
    expect(m.refund).toHaveBeenCalledWith('j1', 'AI_CUSTOM_TEMPLATE');
  });

  it('photo gone: FAILED + refund, the model is never called', async () => {
    m.photoFind.mockResolvedValue(null);
    await handleAiCustomDesign(data);
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.refund).toHaveBeenCalledTimes(1);
  });

  it('photo is re-checked against THIS retailer (queue is a trust boundary)', async () => {
    await handleAiCustomDesign(data);
    expect(m.photoFind).toHaveBeenCalledWith({
      where: { id: 'ph1', product_id: 'p1', retailer_id: 'r1' },
    });
  });

  it('a failed mark-spent is logged, not fatal, and the slot is still not refunded', async () => {
    m.spent.mockRejectedValue(new Error('db blip'));
    await expect(handleAiCustomDesign(data)).resolves.toBeUndefined();
    expect(m.refund).not.toHaveBeenCalled();
  });
});

describe('handleAiCustomDesign poster branch', () => {
  const poster = {
    ...data,
    template_id: 't1',
    custom_text: 'SECRET HEADLINE',
    offer_text: 'FLAT 50 OFF',
  };

  it('poster job: scene then render with backgroundOverride, row READY, slot spent', async () => {
    await handleAiCustomDesign(poster);
    expect(m.findPoster).toHaveBeenCalledWith('t1', 'PRO');
    const opts = m.upload.mock.calls[0]?.[3];
    expect(opts.compress.maxBytes).toBe(450 * 1024);
    const raw = Buffer.from('scene');
    await opts.transform(raw);
    expect(m.render).toHaveBeenCalledWith(
      expect.objectContaining({
        retailerId: 'r1',
        productIds: ['p1'],
        backgroundOverride: raw,
        omitProductImages: true,
        custom: { custom_text: 'SECRET HEADLINE', offer_text: 'FLAT 50 OFF' },
      }),
    );
    const key = m.upload.mock.calls[0]?.[1] as string;
    expect(key).toMatch(/^retailers\/r1\/designs\/[a-f0-9]{24}\.jpg$/);
    expect(m.designUpdate).toHaveBeenCalledWith({
      where: { id: 'j1' },
      data: { status: 'READY', image_key: key, image_url: `https://cdn/${key}`, error: null },
    });
    expect(m.spent).toHaveBeenCalledWith('j1', 'AI_CUSTOM_TEMPLATE');
    expect(m.refund).not.toHaveBeenCalled();
  });

  it('template unpublished or ai_prompt cleared before run -> FAILED, refunded, model not called', async () => {
    m.findPoster.mockResolvedValue(null);
    await handleAiCustomDesign(poster);
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.designUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(m.refund).toHaveBeenCalledWith('j1', 'AI_CUSTOM_TEMPLATE');
    expect(m.spent).not.toHaveBeenCalled();
  });

  it('render throws after scene -> FAILED, refunded, error rethrown', async () => {
    m.render.mockRejectedValue(new Error('boom'));
    m.upload.mockImplementation(async (_p: string, _k: string, _b: boolean, o: any) => {
      await o.transform(Buffer.from('scene'));
    });
    await expect(handleAiCustomDesign(poster)).rejects.toThrow('boom');
    expect(m.designUpdate).not.toHaveBeenCalled();
    expect(m.designUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(m.refund).toHaveBeenCalledWith('j1', 'AI_CUSTOM_TEMPLATE');
  });

  it('typed text is not in the prompt passed to generateStudioImage', async () => {
    await handleAiCustomDesign(poster);
    const sent = m.generate.mock.calls[0]?.[1].prompt as string;
    expect(sent).toContain('diwali poster scene');
    expect(sent).not.toContain('SECRET HEADLINE');
    expect(sent).not.toContain('FLAT 50 OFF');
    expect(sent).not.toContain('warm diyas');
  });

  it('poster mode never downloads the store logo', async () => {
    m.productFind.mockResolvedValue({
      name: 'Suit',
      retailer: { shop_name: 'S', logo_r2_key: 'logo.png' },
    });
    await handleAiCustomDesign({ ...poster, overlay: 'logo_corner' });
    expect(m.downloadBuffer).not.toHaveBeenCalled();
  });

  it('poster READY bumps the design usage_count', async () => {
    await handleAiCustomDesign(poster);
    expect(m.templateUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { usage_count: { increment: 1 } },
    });
  });

  it('a failed usage bump does not fail the job', async () => {
    m.templateUpdate.mockRejectedValue(new Error('db'));
    await expect(handleAiCustomDesign(poster)).resolves.toBeUndefined();
    expect(m.refund).not.toHaveBeenCalled();
  });

  it('product gone (soft-deleted): FAILED + refund, model never called', async () => {
    m.productFind.mockResolvedValue(null);
    await handleAiCustomDesign(data);
    expect(m.productFind.mock.calls[0]?.[0].where).toMatchObject({ deleted_at: null });
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.designUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(m.refund).toHaveBeenCalledWith('j1', 'AI_CUSTOM_TEMPLATE');
  });

  it('free-prompt job unchanged: no template lookup, no render', async () => {
    await handleAiCustomDesign(data);
    expect(m.findPoster).not.toHaveBeenCalled();
    expect(m.render).not.toHaveBeenCalled();
    expect(m.generate.mock.calls[0]?.[1].prompt).toContain('warm diyas');
  });
});
