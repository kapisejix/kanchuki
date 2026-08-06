import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCompressR2Images } from './compress-r2-images.js';

// Contract: list the bucket, compress every eligible image >80KB in place
// (skip non-images, excluded prefixes, and already-small objects without
// downloading), never fail the whole pass on one bad object, write an audit
// entry, and no-op cleanly when R2 is unconfigured.

const mockListObjects = vi.fn();
const mockDownloadBuffer = vi.fn();
const mockCompress = vi.fn();
const mockUploadBuffer = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock('@kanchuki/ai', () => ({
  listObjects: (...args: unknown[]) => mockListObjects(...args),
  downloadBuffer: (...args: unknown[]) => mockDownloadBuffer(...args),
  compressImageToTarget: (...args: unknown[]) => mockCompress(...args),
  uploadBuffer: (...args: unknown[]) => mockUploadBuffer(...args),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    auditLog: {
      create: (...args: unknown[]) => mockAuditCreate(...args),
    },
  },
}));

// Distinct download vs compress-result buffers: the job only overwrites when
// the result is STRICTLY smaller, so tests must not reuse one buffer for both.
const BIG = Buffer.alloc(200 * 1024, 1);
const SMALL = Buffer.alloc(40 * 1024, 2);

describe('handleCompressR2Images', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.R2_ACCOUNT_ID;
  });

  it('skips the whole pass without touching R2 when R2_ACCOUNT_ID is unset', async () => {
    const result = await handleCompressR2Images();

    expect(result.skipped_unconfigured).toBe(true);
    expect(mockListObjects).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('skips non-images, excluded prefixes, and PNGs; skips ≤80KB objects without downloading', async () => {
    process.env.R2_ACCOUNT_ID = 'acct';
    mockListObjects.mockResolvedValue([
      { key: 'retailers/r1/products/p1.jpg', size: 200 * 1024 }, // eligible → compressed
      { key: 'backups/db.gz', size: 50 * 1024 }, // non-image
      { key: 'retailers/r1/customers/c1/measurements/f.jpg', size: 500 * 1024 }, // excluded
      { key: 'retailers/r1/kyc/aadhaar.jpg', size: 500 * 1024 }, // excluded
      { key: 'retailers/r1/products/p2.png', size: 200 * 1024 }, // PNG — skipped, never JPEG-mislabeled
      { key: 'retailers/r1/products/p3.jpg', size: 40 * 1024 }, // already fine
    ]);
    mockDownloadBuffer.mockResolvedValue(BIG);
    mockCompress.mockResolvedValue({ buffer: SMALL, unchanged: false });

    const result = await handleCompressR2Images();

    expect(result.scanned).toBe(6);
    expect(result.skipped).toBe(4);
    expect(result.already_fine).toBe(1);
    expect(mockDownloadBuffer).toHaveBeenCalledTimes(1); // only the eligible jpg
    expect(result.compressed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('overwrites in place (key unchanged) only when the result is strictly smaller', async () => {
    process.env.R2_ACCOUNT_ID = 'acct';
    const big = Buffer.alloc(200 * 1024, 1);
    const small = Buffer.alloc(60 * 1024, 2);
    mockListObjects.mockResolvedValue([
      { key: 'retailers/r1/products/p1.jpg', size: 200 * 1024 },
      { key: 'retailers/r1/products/p2.jpg', size: 200 * 1024 },
    ]);
    mockDownloadBuffer.mockResolvedValue(big);
    mockCompress
      .mockResolvedValueOnce({ buffer: small, unchanged: false }) // smaller → upload
      .mockResolvedValueOnce({ buffer: big, unchanged: true }); // unchanged → skip

    const result = await handleCompressR2Images();

    expect(result.compressed).toBe(1);
    expect(result.already_fine).toBe(1);
    expect(mockUploadBuffer).toHaveBeenCalledTimes(1);
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      'retailers/r1/products/p1.jpg',
      small,
      'image/jpeg',
    );
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });

  it('counts a failing object and continues instead of failing the pass', async () => {
    process.env.R2_ACCOUNT_ID = 'acct';
    mockListObjects.mockResolvedValue([
      { key: 'retailers/r1/products/p1.jpg', size: 200 * 1024 },
      { key: 'retailers/r1/products/p2.jpg', size: 200 * 1024 },
    ]);
    mockDownloadBuffer
      .mockRejectedValueOnce(new Error('corrupt object'))
      .mockResolvedValueOnce(BIG);
    mockCompress.mockResolvedValue({ buffer: SMALL, unchanged: false });

    const result = await handleCompressR2Images();

    expect(result.failed).toBe(1);
    expect(result.compressed).toBe(1);
    // Audit still written even though one object failed
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });

  it('reports bytes saved in the audit metadata', async () => {
    process.env.R2_ACCOUNT_ID = 'acct';
    const big = Buffer.alloc(100 * 1024, 1);
    const small = Buffer.alloc(30 * 1024, 2);
    mockListObjects.mockResolvedValue([{ key: 'r/p.jpg', size: 100 * 1024 }]);
    mockDownloadBuffer.mockResolvedValue(big);
    mockCompress.mockResolvedValue({ buffer: small, unchanged: false });

    const result = await handleCompressR2Images();

    expect(result.bytes_before).toBe(100 * 1024);
    expect(result.bytes_after).toBe(30 * 1024);
    expect(result.bytes_saved).toBe(70 * 1024);

    const audit = mockAuditCreate.mock.calls[0]![0] as {
      data: { action: string; metadata: Record<string, unknown> };
    };
    expect(audit.data.action).toBe('COMPRESS_R2_IMAGES');
    expect(audit.data.metadata.bytes_saved).toBe(70 * 1024);
  });
});
