// RC-102 follow-up: handleStudioShoot owns the refund of the slot the route reserved for its job_id.
// BullMQ counts a handler that `return`s as completed, so the soft failures (photo gone, provider
// said no) never reach the worker's `failed` hook — the handler's `finally` is what refunds them.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  photoFind: vi.fn(),
  photoCreate: vi.fn(),
  productFind: vi.fn(),
  styleUpdate: vi.fn(),
  generate: vi.fn(),
  upload: vi.fn(),
  setStatus: vi.fn(),
  markSpent: vi.fn(),
  refund: vi.fn(),
}));

vi.mock('@kanchuki/ai', () => ({ getDownloadPresignedUrl: vi.fn() }));
vi.mock('@kanchuki/db', () => ({
  prisma: {
    productPhoto: { findFirst: m.photoFind, create: m.photoCreate },
    product: { findFirst: m.productFind },
    studioStyle: { update: m.styleUpdate },
  },
}));
vi.mock('@kanchuki/shared', () => ({
  R2_PATHS: { studioShot: () => 'studio/key.jpg' },
  poolsForSlug: () => ({}),
  resolveStyleTokens: (prompt: string) => ({ prompt, picks: {} }),
}));
vi.mock('../lib/ai-usage.js', () => ({ recordBflStudioUsage: vi.fn() }));
vi.mock('../lib/quota.js', () => ({
  markJobQuotaSpent: m.markSpent,
  refundJobQuota: m.refund,
}));
vi.mock('../lib/studio-shoot.js', () => ({
  downloadCompressAndUpload: m.upload,
  generateStudioImage: m.generate,
  setStudioJobStatus: m.setStatus,
}));

import { type StudioShootJobData, handleStudioShoot } from './studio-shoot.js';

const data: StudioShootJobData = {
  job_id: 'job1',
  retailer_id: 'r1',
  product_id: 'p1',
  photo_id: 'ph1',
  slug: 'runway',
  prompt: 'prompt',
  tab: 'MODEL',
  audience: [],
  style_id: 'st1',
};

beforeEach(() => {
  vi.resetAllMocks();
  m.setStatus.mockResolvedValue(undefined);
  m.markSpent.mockResolvedValue(undefined);
  m.refund.mockResolvedValue(undefined);
  m.photoFind.mockResolvedValue({ id: 'ph1', url: 'https://cdn.example/a.jpg', r2_key: 'a' });
  m.productFind.mockResolvedValue({ id: 'p1', name: 'Suit' });
  m.generate.mockResolvedValue({ status: 'ready', sampleUrl: 'https://bfl.example/x.jpg' });
  m.upload.mockResolvedValue({ key: 'k', url: 'https://cdn.example/k.jpg', width: 1, height: 1 });
  m.photoCreate.mockResolvedValue({ id: 'new1', url: 'https://cdn.example/k.jpg' });
  m.styleUpdate.mockResolvedValue(undefined);
});

describe('handleStudioShoot — quota slot', () => {
  it('keeps the slot (marks it spent, never refunds) when a photo is produced', async () => {
    await handleStudioShoot(data);
    expect(m.markSpent).toHaveBeenCalledExactlyOnceWith('job1', 'STUDIO_SHOOT');
    expect(m.refund).not.toHaveBeenCalled();
  });

  it('marks the slot spent BEFORE the ready status becomes visible', async () => {
    await handleStudioShoot(data);
    const spentAt = m.markSpent.mock.invocationCallOrder[0] as number;
    const readyAt = m.setStatus.mock.invocationCallOrder[
      m.setStatus.mock.calls.findIndex(([, , s]) => s.status === 'ready')
    ] as number;
    expect(spentAt).toBeLessThan(readyAt);
  });

  it('a failed mark-spent is not fatal and does not refund (the photo exists)', async () => {
    m.markSpent.mockRejectedValue(new Error('db down'));
    await expect(handleStudioShoot(data)).resolves.toBeUndefined();
    expect(m.refund).not.toHaveBeenCalled();
    expect(m.setStatus).toHaveBeenCalledWith(
      'r1',
      'job1',
      expect.objectContaining({ status: 'ready' }),
    );
  });

  it('refunds when the source photo is gone (soft failure: handler returns)', async () => {
    m.photoFind.mockResolvedValue(null);
    await expect(handleStudioShoot(data)).resolves.toBeUndefined();
    expect(m.refund).toHaveBeenCalledExactlyOnceWith('job1', 'STUDIO_SHOOT');
    expect(m.markSpent).not.toHaveBeenCalled();
  });

  it('refunds when the provider answers "not ready" (the common soft failure)', async () => {
    m.generate.mockResolvedValue({ status: 'failed', error: 'content filter' });
    await expect(handleStudioShoot(data)).resolves.toBeUndefined();
    expect(m.refund).toHaveBeenCalledExactlyOnceWith('job1', 'STUDIO_SHOOT');
    expect(m.photoCreate).not.toHaveBeenCalled();
  });

  it('refunds and rethrows when generation throws', async () => {
    m.generate.mockRejectedValue(new Error('provider timeout'));
    await expect(handleStudioShoot(data)).rejects.toThrow('provider timeout');
    expect(m.refund).toHaveBeenCalledExactlyOnceWith('job1', 'STUDIO_SHOOT');
  });

  it('refunds when the upload or photo-row write fails after a good generation', async () => {
    m.upload.mockRejectedValue(new Error('r2 down'));
    await expect(handleStudioShoot(data)).rejects.toThrow('r2 down');
    expect(m.refund).toHaveBeenCalledExactlyOnceWith('job1', 'STUDIO_SHOOT');
    expect(m.markSpent).not.toHaveBeenCalled();
  });

  it('a failing refund never changes the outcome of a soft failure', async () => {
    m.photoFind.mockResolvedValue(null);
    m.refund.mockRejectedValue(new Error('db down'));
    await expect(handleStudioShoot(data)).resolves.toBeUndefined();
  });

  it('a failing refund does not mask the original error', async () => {
    m.generate.mockRejectedValue(new Error('provider timeout'));
    m.refund.mockRejectedValue(new Error('db down'));
    await expect(handleStudioShoot(data)).rejects.toThrow('provider timeout');
  });
});
