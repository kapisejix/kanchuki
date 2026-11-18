import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindUnique, mockUpdateMany, mockStatus, mockPublish } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockStatus: vi.fn(),
  mockPublish: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  decryptSecret: (s: string) => `dec:${s}`,
  prisma: { socialPost: { findUnique: mockFindUnique, updateMany: mockUpdateMany } },
}));
vi.mock('../lib/meta-graph.js', () => ({
  instagramContainerStatus: mockStatus,
  publishIgContainer: mockPublish,
}));

const { handleInstagramReelFinish, failStuckReel, REEL_TOO_SLOW_MESSAGE } = await import(
  './instagram-reel-finish.js'
);

const DATA = { socialPostId: 'sp_1', containerId: 'c_1' };
const ROW = {
  id: 'sp_1',
  status: 'PROCESSING',
  account: { platform_account_id: 'ig_user', access_token_encrypted: 'tok' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindUnique.mockResolvedValue(ROW);
  mockUpdateMany.mockResolvedValue({ count: 1 });
});

describe('handleInstagramReelFinish (F-034 T2b)', () => {
  it('FINISHED → publishes the container and flips the row to POSTED', async () => {
    mockStatus.mockResolvedValue('FINISHED');
    mockPublish.mockResolvedValue({
      postId: 'pub_1',
      permalink: 'https://www.instagram.com/reel/x/',
    });

    await expect(handleInstagramReelFinish(DATA)).resolves.toBe('posted');

    expect(mockStatus).toHaveBeenCalledWith('c_1', 'dec:tok');
    expect(mockPublish).toHaveBeenCalledWith('ig_user', 'dec:tok', 'c_1');
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'sp_1', status: 'PROCESSING' },
      data: {
        status: 'POSTED',
        external_post_id: 'pub_1',
        external_post_url: 'https://www.instagram.com/reel/x/',
        error_message: null,
      },
    });
  });

  it('IN_PROGRESS (or no status) → throws so BullMQ checks again; no publish, no row write', async () => {
    for (const status of ['IN_PROGRESS', '']) {
      mockStatus.mockResolvedValueOnce(status);
      await expect(handleInstagramReelFinish(DATA)).rejects.toThrow(/still processing/i);
    }
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('PUBLISHED (an earlier attempt published, then died) → POSTED without publishing twice', async () => {
    mockStatus.mockResolvedValue('PUBLISHED');
    await expect(handleInstagramReelFinish(DATA)).resolves.toBe('posted');
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockUpdateMany.mock.calls[0]?.[0]?.data).toMatchObject({
      status: 'POSTED',
      external_post_id: null,
    });
  });

  it.each(['ERROR', 'EXPIRED'])('%s → FAILED row, never published', async (status) => {
    mockStatus.mockResolvedValue(status);
    await expect(handleInstagramReelFinish(DATA)).resolves.toBe('failed');
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockUpdateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'sp_1', status: 'PROCESSING' },
      data: { status: 'FAILED' },
    });
  });

  it('a row that is gone or no longer PROCESSING → no Graph call at all', async () => {
    for (const row of [null, { ...ROW, status: 'POSTED' }, { ...ROW, status: 'FAILED' }]) {
      mockFindUnique.mockResolvedValueOnce(row);
      await expect(handleInstagramReelFinish(DATA)).resolves.toBe('skipped');
    }
    expect(mockStatus).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('a POSTED row write that fails is retried in the same attempt (the Reel is live)', async () => {
    mockStatus.mockResolvedValue('FINISHED');
    mockPublish.mockResolvedValue({ postId: 'pub_1', permalink: '' });
    mockUpdateMany.mockRejectedValueOnce(new Error('db blip')).mockResolvedValueOnce({ count: 1 });
    await expect(handleInstagramReelFinish(DATA)).resolves.toBe('posted');
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockPublish).toHaveBeenCalledTimes(1);
  });
});

describe('failStuckReel', () => {
  it('flips a still-PROCESSING row to FAILED with the retailer-safe message', async () => {
    await failStuckReel(DATA);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'sp_1', status: 'PROCESSING' },
      data: { status: 'FAILED', error_message: REEL_TOO_SLOW_MESSAGE },
    });
  });
});

describe('worker wiring (source pin)', () => {
  it('the maintenance worker runs the job and its failed listener marks a spent job FAILED', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf-8');
    expect(src).toMatch(
      /case 'instagram-reel-finish':\s*return handleInstagramReelFinish\(job\.data as ReelFinishJobData\)/,
    );
    const listener = src.slice(src.indexOf("maintenanceWorker.on('failed'"));
    expect(listener).toMatch(
      /job\?\.name === 'instagram-reel-finish' && job\.attemptsMade >= \(job\.opts\.attempts \?\? 1\)[\s\S]{0,40}failStuckReel\(/,
    );
  });
});
