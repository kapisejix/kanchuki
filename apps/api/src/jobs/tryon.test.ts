// F-039 T7 — the try-on job. The two assertions that carry the most weight:
// the wearer's photo reaches the GPU call and NOTHING else, and the generated
// image is the only thing persisted.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTryOn } from './tryon.js';
import type { TryOnJobData } from './tryon.js';

const {
  mockProductFindFirst,
  mockJobUpdate,
  mockJobUpdateMany,
  mockGenerateTryOn,
  mockSaveTryOnResultToR2,
  mockDeleteObject,
  mockClothTypeForCategory,
  mockIsUnsupportedTryOnCategory,
  mockIncrementUsage,
  mockIncrementCustomerUsage,
  mockTakeTryOnPhoto,
} = vi.hoisted(() => ({
  mockProductFindFirst: vi.fn(),
  mockJobUpdate: vi.fn(),
  mockJobUpdateMany: vi.fn(),
  mockGenerateTryOn: vi.fn(),
  mockSaveTryOnResultToR2: vi.fn(),
  mockDeleteObject: vi.fn(),
  mockClothTypeForCategory: vi.fn(),
  mockIsUnsupportedTryOnCategory: vi.fn(),
  mockIncrementUsage: vi.fn(),
  mockIncrementCustomerUsage: vi.fn(),
  mockTakeTryOnPhoto: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: { findFirst: mockProductFindFirst },
    // `update` is markFailed's unconditional write; `updateMany` is the guarded
    // completion, which is conditional on the consent still being live.
    tryOnJob: { update: mockJobUpdate, updateMany: mockJobUpdateMany },
  },
}));

vi.mock('@kanchuki/ai', () => ({
  generateTryOn: mockGenerateTryOn,
  saveTryOnResultToR2: mockSaveTryOnResultToR2,
  deleteObject: mockDeleteObject,
  getDownloadPresignedUrl: vi.fn(),
  clothTypeForCategory: mockClothTypeForCategory,
  isUnsupportedTryOnCategory: mockIsUnsupportedTryOnCategory,
}));

vi.mock('../lib/quota.js', () => ({
  incrementUsage: mockIncrementUsage,
  incrementCustomerUsage: mockIncrementCustomerUsage,
}));

vi.mock('../lib/tryon-photo-store.js', () => ({
  takeTryOnPhoto: mockTakeTryOnPhoto,
}));

const DATA: TryOnJobData = {
  job_id: 'tryon_1',
  retailer_id: 'retailer_1',
  customer_account_id: null,
  product_id: 'p1',
};

const PERSON_PHOTO = Buffer.from('the-wearers-photo');

const PRODUCT = {
  id: 'p1',
  category: 'Kurti',
  photos: [{ url: 'https://r2.example/garment.jpg', r2_key: 'garments/p1.jpg' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTakeTryOnPhoto.mockReturnValue({ buffer: PERSON_PHOTO, contentType: 'image/jpeg' });
  mockProductFindFirst.mockResolvedValue(PRODUCT);
  mockIsUnsupportedTryOnCategory.mockReturnValue(false);
  mockClothTypeForCategory.mockReturnValue('upper');
  mockGenerateTryOn.mockResolvedValue({ outputUrl: 'https://worker/result.jpg', latencyMs: 900 });
  mockSaveTryOnResultToR2.mockResolvedValue('tryon-results/tryon_1/result.jpg');
  mockJobUpdate.mockResolvedValue({});
  // The row matched — i.e. no withdrawal landed while the GPU was working.
  mockJobUpdateMany.mockResolvedValue({ count: 1 });
  mockDeleteObject.mockResolvedValue(undefined);
  mockIncrementUsage.mockResolvedValue(undefined);
  mockIncrementCustomerUsage.mockResolvedValue(undefined);
});

describe('handleTryOn', () => {
  it('generates, saves only the result, and marks the job COMPLETED', async () => {
    await handleTryOn(DATA);

    // The photo went to the GPU call...
    expect(mockGenerateTryOn).toHaveBeenCalledWith({
      personImage: PERSON_PHOTO,
      personImageContentType: 'image/jpeg',
      garmentImageUrl: 'https://r2.example/garment.jpg',
      clothType: 'upper',
    });
    // ...and the ONLY storage write is the generated image.
    expect(mockSaveTryOnResultToR2).toHaveBeenCalledTimes(1);
    expect(mockSaveTryOnResultToR2).toHaveBeenCalledWith('tryon_1', 'https://worker/result.jpg');

    // The completion is conditional on the consent still being live — the
    // WHERE is the check, and the write is its consequence.
    expect(mockJobUpdateMany).toHaveBeenCalledWith({
      where: { id: 'tryon_1', consent_withdrawn_at: null },
      data: expect.objectContaining({
        status: 'COMPLETED',
        result_url: 'tryon-results/tryon_1/result.jpg',
      }),
    });
    // Nothing was withdrawn, so the image it just wrote is kept.
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(mockIncrementUsage).toHaveBeenCalledWith('retailer_1', 'TRY_ON_GENERATION');
    // A retailer job does not touch a shopper's counter.
    expect(mockIncrementCustomerUsage).not.toHaveBeenCalled();
  });

  it('increments both counters for a customer job', async () => {
    await handleTryOn({ ...DATA, customer_account_id: 'acct_1' });

    expect(mockIncrementUsage).toHaveBeenCalledWith('retailer_1', 'TRY_ON_GENERATION');
    expect(mockIncrementCustomerUsage).toHaveBeenCalledWith('acct_1', 'TRY_ON_GENERATION');
  });

  it('deletes the image it wrote when consent was withdrawn mid-run', async () => {
    // The withdrawal landed while the GPU was working, so the row already
    // carries `consent_withdrawn_at` and the guarded write matches nothing.
    mockJobUpdateMany.mockResolvedValue({ count: 0 });

    await handleTryOn({ ...DATA, customer_account_id: 'acct_1' });

    // It was written to R2 before the loss was known...
    expect(mockSaveTryOnResultToR2).toHaveBeenCalledTimes(1);
    // ...and is deleted in the same run, so it cannot outlive the withdrawal.
    expect(mockDeleteObject).toHaveBeenCalledWith('tryon-results/tryon_1/result.jpg');
    // The completion write is not retried unconditionally: re-attaching a key to
    // a withdrawn row is the thing the condition exists to prevent.
    expect(mockJobUpdate).not.toHaveBeenCalled();
  });

  it('survives a failed cleanup delete, leaving the row for the sweep to retry', async () => {
    mockJobUpdateMany.mockResolvedValue({ count: 0 });
    mockDeleteObject.mockRejectedValue(new Error('R2 unreachable'));

    // Must not throw — the generation itself succeeded, and a failed cleanup is
    // the deletion sweep's job, not an error that should fail the BullMQ job.
    await expect(handleTryOn(DATA)).resolves.toBeUndefined();

    expect(mockDeleteObject).toHaveBeenCalled();
    // Nothing cleared the key: it is the sweep's only way to find the object.
    expect(mockJobUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('still meters a generation that was withdrawn mid-run', async () => {
    // Both counters, deliberately. The GPU ran either way, and skipping the
    // store's increment would make withdraw-and-regenerate free — a shopper can
    // re-grant (`hasLiveTryOnConsent`), so that loop is reachable from the UI.
    mockJobUpdateMany.mockResolvedValue({ count: 0 });

    await handleTryOn({ ...DATA, customer_account_id: 'acct_1' });

    expect(mockIncrementUsage).toHaveBeenCalledWith('retailer_1', 'TRY_ON_GENERATION');
    expect(mockIncrementCustomerUsage).toHaveBeenCalledWith('acct_1', 'TRY_ON_GENERATION');
  });

  it('fails without generating when the photo has expired', async () => {
    mockTakeTryOnPhoto.mockReturnValue(null);

    await handleTryOn(DATA);

    expect(mockGenerateTryOn).not.toHaveBeenCalled();
    expect(mockSaveTryOnResultToR2).not.toHaveBeenCalled();
    expect(mockJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('fails without generating when the product is gone', async () => {
    mockProductFindFirst.mockResolvedValue(null);

    await handleTryOn(DATA);

    expect(mockGenerateTryOn).not.toHaveBeenCalled();
    expect(mockJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('fails without generating when the product has no photo', async () => {
    mockProductFindFirst.mockResolvedValue({ ...PRODUCT, photos: [] });

    await handleTryOn(DATA);

    expect(mockGenerateTryOn).not.toHaveBeenCalled();
  });

  it('refuses an unsupported garment category', async () => {
    mockIsUnsupportedTryOnCategory.mockReturnValue(true);

    await handleTryOn(DATA);

    expect(mockGenerateTryOn).not.toHaveBeenCalled();
  });

  it('marks FAILED and rethrows when the GPU call fails, saving nothing', async () => {
    mockGenerateTryOn.mockRejectedValue(new Error('RunPod timeout'));

    await expect(handleTryOn(DATA)).rejects.toThrow('RunPod timeout');

    expect(mockSaveTryOnResultToR2).not.toHaveBeenCalled();
    expect(mockJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', failure_reason: 'RunPod timeout' }),
      }),
    );
    // No quota is spent on a failed generation.
    expect(mockIncrementUsage).not.toHaveBeenCalled();
  });
});
