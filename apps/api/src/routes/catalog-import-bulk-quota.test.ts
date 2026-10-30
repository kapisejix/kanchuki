// RC-102: bulk-create-products reserves items.length PRODUCT_UPLOAD slots up front with one
// atomic reserveQuota, keeps them when every product is created, and hands them all back if
// anything below the reservation throws (the old code charged only on success).
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  reserve: vi.fn(),
  refund: vi.fn(),
  retailerFind: vi.fn(),
  productCreate: vi.fn(),
  auditCreate: vi.fn(),
  verifyUpload: vi.fn(),
  addTaggingJob: vi.fn(),
  nextSku: vi.fn(),
}));

vi.mock('@kanchuki/ai', () => ({
  detectCropAndTag: vi.fn(),
  fetchImageBuffer: vi.fn(),
  getUploadPresignedUrl: vi.fn(),
  publicUrl: vi.fn(),
  reserveAiCredits: vi.fn(),
}));
vi.mock('@kanchuki/db', () => ({
  prisma: {
    storeSection: { findMany: vi.fn().mockResolvedValue([]) },
    retailer: { findUnique: m.retailerFind },
    product: { create: m.productCreate },
    auditLog: { create: m.auditCreate },
  },
  withRetry: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../jobs/index.js', () => ({ addTaggingJob: m.addTaggingJob }));
vi.mock('../lib/ai-usage.js', () => ({ recordAiUsage: vi.fn() }));
vi.mock('../lib/quota.js', () => ({ checkQuota: vi.fn(), reserveQuota: m.reserve }));
vi.mock('../lib/sku.js', () => ({ createSkuSequencer: () => m.nextSku }));
vi.mock('../lib/upload-guard.js', () => ({
  IMAGE_KINDS: [],
  UPLOAD_URL_RATE_LIMIT: {},
  verifyUpload: m.verifyUpload,
}));

import { errorHandler, planLimitExceeded } from '../plugins/error-handler.js';
import { catalogImportRoutes } from './catalog-import.js';

const RETAILER_ID = 'retailer_1';
const item = (n: number) => ({ cropped_r2_key: `catalog-import/${RETAILER_ID}/k${n}.jpg` });

async function post(count: number) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(catalogImportRoutes, { prefix: '/v1' });
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: '/v1/catalog-import/bulk-create-products',
    payload: { items: Array.from({ length: count }, (_, i) => item(i)) },
  });
  await app.close();
  return res;
}

beforeEach(() => {
  vi.resetAllMocks();
  m.reserve.mockResolvedValue(m.refund);
  m.refund.mockResolvedValue(undefined);
  m.retailerFind.mockResolvedValue({
    plan: 'STARTER',
    plan_status: 'ACTIVE',
    _count: { products: 0 },
  });
  m.verifyUpload.mockImplementation(async ({ r2Key }: { r2Key: string }) => ({
    url: `https://cdn.example/${r2Key}`,
  }));
  m.nextSku.mockResolvedValue('SKU-1');
  m.productCreate.mockImplementation(async () => ({
    id: 'p',
    photos: [{ url: 'https://cdn.example/x', r2_key: 'x' }],
  }));
  m.addTaggingJob.mockResolvedValue(undefined);
  m.auditCreate.mockResolvedValue(undefined);
});

describe('POST /catalog-import/bulk-create-products — PRODUCT_UPLOAD reservation', () => {
  it('reserves the whole batch once and keeps it when every product is created', async () => {
    const res = await post(3);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.total_created).toBe(3);
    expect(m.reserve).toHaveBeenCalledExactlyOnceWith(RETAILER_ID, 'PRODUCT_UPLOAD', 3);
    expect(m.refund).not.toHaveBeenCalled();
  });

  it('hands the whole reservation back when a product create throws', async () => {
    m.productCreate.mockRejectedValue(new Error('db down'));
    const res = await post(3);
    expect(res.statusCode).toBe(500);
    expect(m.reserve).toHaveBeenCalledTimes(1);
    expect(m.refund).toHaveBeenCalledTimes(1);
  });

  it('hands it back when an uploaded photo does not verify (nothing was created)', async () => {
    m.verifyUpload.mockRejectedValue(new Error('not yours'));
    const res = await post(2);
    expect(res.statusCode).toBe(500);
    expect(m.productCreate).not.toHaveBeenCalled();
    expect(m.refund).toHaveBeenCalledTimes(1);
  });

  it('a failing refund does not mask the original error', async () => {
    m.productCreate.mockRejectedValue(new Error('db down'));
    m.refund.mockRejectedValue(new Error('refund failed'));
    const res = await post(1);
    expect(res.statusCode).toBe(500);
    expect(res.json().error.message).not.toContain('refund failed');
  });

  it('over quota: the 402 from reserveQuota stops before anything is verified or created', async () => {
    m.reserve.mockRejectedValue(planLimitExceeded('product upload'));
    const res = await post(2);
    expect(res.statusCode).toBe(402);
    expect(m.verifyUpload).not.toHaveBeenCalled();
    expect(m.productCreate).not.toHaveBeenCalled();
    expect(m.refund).not.toHaveBeenCalled();
  });
});
