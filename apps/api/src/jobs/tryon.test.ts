// F-039 T7 — the try-on job. The two assertions that carry the most weight:
// the wearer's photo reaches the GPU call and NOTHING else, and the generated
// image is the only thing persisted.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTryOn } from './tryon.js';
import type { TryOnJobData } from './tryon.js';

const {
  mockProductFindFirst,
  mockJobUpdate,
  mockGenerateTryOn,
  mockSaveTryOnResultToR2,
  mockClothTypeForCategory,
  mockIsUnsupportedTryOnCategory,
  mockIncrementUsage,
  mockIncrementCustomerUsage,
  mockTakeTryOnPhoto,
} = vi.hoisted(() => ({
  mockProductFindFirst: vi.fn(),
  mockJobUpdate: vi.fn(),
  mockGenerateTryOn: vi.fn(),
  mockSaveTryOnResultToR2: vi.fn(),
  mockClothTypeForCategory: vi.fn(),
  mockIsUnsupportedTryOnCategory: vi.fn(),
  mockIncrementUsage: vi.fn(),
  mockIncrementCustomerUsage: vi.fn(),
  mockTakeTryOnPhoto: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: { findFirst: mockProductFindFirst },
    tryOnJob: { update: mockJobUpdate },
  },
}));

vi.mock('@kanchuki/ai', () => ({
  generateTryOn: mockGenerateTryOn,
  saveTryOnResultToR2: mockSaveTryOnResultToR2,
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

    expect(mockJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tryon_1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          result_url: 'tryon-results/tryon_1/result.jpg',
        }),
      }),
    );
    expect(mockIncrementUsage).toHaveBeenCalledWith('retailer_1', 'TRY_ON_GENERATION');
    // A retailer job does not touch a shopper's counter.
    expect(mockIncrementCustomerUsage).not.toHaveBeenCalled();
  });

  it('increments both counters for a customer job', async () => {
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
