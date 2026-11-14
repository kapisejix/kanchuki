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
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    productPhoto: { findFirst: m.photoFind },
    product: { findFirst: m.productFind },
    aiCustomDesign: { update: m.designUpdate, updateMany: m.designUpdateMany },
  },
}));
vi.mock('../lib/studio-shoot.js', () => ({
  generateStudioImage: m.generate,
  downloadCompressAndUpload: m.upload,
}));
vi.mock('../lib/quota.js', () => ({ markJobQuotaSpent: m.spent, refundJobQuota: m.refund }));
vi.mock('../lib/ai-usage.js', () => ({ recordBflStudioUsage: vi.fn() }));
vi.mock('./studio-shoot.js', () => ({ studioSourceUrl: m.sourceUrl }));

const { handleAiCustomDesign } = await import('./ai-custom-design.js');

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
