// F-034 T5 — promo video job. The AI_VIDEO slot reserved at enqueue stays spent only once a
// product_videos row exists; every other exit hands it back (RC-102).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type PromoVideoJobData, handlePromoVideo } from './generate-promo-video.js';

const m = vi.hoisted(() => ({
  retailer: vi.fn(),
  photo: vi.fn(),
  product: vi.fn(),
  videoCreate: vi.fn(),
  usageCreate: vi.fn(),
  modelForPlan: vi.fn(),
  generate: vi.fn(),
  upload: vi.fn(),
  refund: vi.fn(),
  spent: vi.fn(),
  setStatus: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUniqueOrThrow: m.retailer },
    productPhoto: { findFirst: m.photo },
    product: { findFirst: m.product },
    productVideo: { create: m.videoCreate },
    aiUsageLog: { create: m.usageCreate },
  },
}));
vi.mock('@kanchuki/ai', () => ({
  uploadBuffer: m.upload,
  publicUrl: (k: string) => `https://cdn/${k}`,
}));
vi.mock('../lib/fal-video.js', () => ({
  videoModelForPlan: m.modelForPlan,
  generateImageToVideo: m.generate,
}));
vi.mock('../lib/quota.js', () => ({ refundJobQuota: m.refund, markJobQuotaSpent: m.spent }));
vi.mock('../lib/studio-shoot.js', () => ({ setStudioJobStatus: m.setStatus }));
vi.mock('./studio-shoot.js', () => ({ studioSourceUrl: async () => 'https://cdn/photo.jpg' }));

const DATA: PromoVideoJobData = {
  job_id: 'job_1',
  retailer_id: 'r1',
  product_id: 'p1',
  photo_id: 'ph1',
  style_slug: 'VI-01',
  motion_prompt: 'slow push-in',
  aspect: '9:16',
  seconds: 5,
};
const MODEL = { model_key: 'kling_2_6', endpoint: 'fal-ai/kling', price_usd_per_second: 0.07 };

beforeEach(() => {
  vi.clearAllMocks();
  m.retailer.mockResolvedValue({ plan: 'GROWTH' });
  m.modelForPlan.mockResolvedValue(MODEL);
  m.photo.mockResolvedValue({ id: 'ph1', url: 'https://cdn/photo.jpg', r2_key: 'k' });
  m.product.mockResolvedValue({ id: 'p1', _count: { videos: 0 } });
  m.generate.mockResolvedValue({
    mp4: Buffer.from('mp4'),
    usage: { billed_seconds: 5, tokens: null, cost_usd: 0.35, raw: null },
  });
  m.upload.mockResolvedValue(undefined);
  m.videoCreate.mockResolvedValue({ id: 'job_1', public_url: 'https://cdn/v.mp4' });
  m.usageCreate.mockResolvedValue({});
  m.refund.mockResolvedValue(undefined);
  m.spent.mockResolvedValue(undefined);
  m.setStatus.mockResolvedValue(undefined);
});

describe('handlePromoVideo', () => {
  it('creates an AI_GEN video row keyed by the job id and keeps the slot spent', async () => {
    await handlePromoVideo(DATA);
    expect(m.generate).toHaveBeenCalledWith(
      'https://cdn/photo.jpg',
      expect.objectContaining({
        model: MODEL,
        motionPrompt: 'slow push-in',
        aspect: '9:16',
        seconds: 5,
      }),
    );
    expect(m.videoCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'job_1',
        product_id: 'p1',
        retailer_id: 'r1',
        source: 'AI_GEN',
        style_slug: 'VI-01',
        model_key: 'kling_2_6',
        duration_sec: 5,
      }),
    });
    expect(m.spent).toHaveBeenCalledWith('job_1', 'AI_VIDEO');
    expect(m.refund).not.toHaveBeenCalled();
    expect(m.setStatus).toHaveBeenLastCalledWith(
      'job_1',
      expect.objectContaining({ status: 'ready', video_id: 'job_1' }),
    );
  });

  it('logs the real USD cost under FAL, with credits for the daily spend alert', async () => {
    await handlePromoVideo(DATA);
    expect(m.usageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        retailer_id: 'r1',
        provider_type: 'FAL',
        model_name: 'kling_2_6',
        resource_type: 'AI_VIDEO',
        cost_usd: 0.35,
        credits_used: 88, // ceil(0.35 / 0.004)
      }),
    });
  });

  it.each([
    ['the model was switched off', () => m.modelForPlan.mockResolvedValue(null)],
    ['the photo is gone', () => m.photo.mockResolvedValue(null)],
    ['the product is gone', () => m.product.mockResolvedValue(null)],
    [
      'the product already has 3 videos',
      () => m.product.mockResolvedValue({ id: 'p1', _count: { videos: 3 } }),
    ],
  ])('refunds without calling Fal when %s', async (_n, arrange) => {
    arrange();
    await handlePromoVideo(DATA);
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.refund).toHaveBeenCalledWith('job_1', 'AI_VIDEO');
    expect(m.setStatus).toHaveBeenLastCalledWith(
      'job_1',
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it.each([
    ['Fal fails', () => m.generate.mockRejectedValue(new Error('fal 500 secret detail'))],
    ['the upload fails', () => m.upload.mockRejectedValue(new Error('r2 down'))],
    ['the row write fails', () => m.videoCreate.mockRejectedValue(new Error('db down'))],
  ])('refunds and rethrows when %s, with a safe message', async (_n, arrange) => {
    arrange();
    await expect(handlePromoVideo(DATA)).rejects.toThrow();
    expect(m.refund).toHaveBeenCalledWith('job_1', 'AI_VIDEO');
    expect(m.spent).not.toHaveBeenCalled();
    const last = m.setStatus.mock.calls.at(-1)?.[1];
    expect(last.status).toBe('failed');
    expect(last.error).not.toMatch(/secret|fal 500|r2|db down/);
  });

  it('still logs the Fal cost when the upload fails after a paid clip', async () => {
    m.upload.mockRejectedValue(new Error('r2 down'));
    await expect(handlePromoVideo(DATA)).rejects.toThrow();
    expect(m.usageCreate).toHaveBeenCalled();
  });
});
