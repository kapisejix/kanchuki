// RC-178: bulk-create-products checks the shared live-product cap once for the whole batch.
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
vi.mock('../lib/quota.js', () => ({ checkQuota: vi.fn() }));
vi.mock('../lib/product-capacity.js', () => ({ assertProductCapacity: m.reserve }));
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

// RC-178: the batch is checked against the shared LIVE-product cap (assertProductCapacity),
// not a lifetime counter and not the static PLAN_LIMITS; there is nothing to refund.
describe('POST /catalog-import/bulk-create-products — live product cap', () => {
  it('checks capacity once for the whole batch, then creates every product', async () => {
    const res = await post(3);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.total_created).toBe(3);
    expect(m.reserve).toHaveBeenCalledExactlyOnceWith(RETAILER_ID, 3);
  });

  it('over the cap: the 402 stops before anything is verified or created', async () => {
    m.reserve.mockRejectedValue(planLimitExceeded('products'));
    const res = await post(2);
    expect(res.statusCode).toBe(402);
    expect(m.verifyUpload).not.toHaveBeenCalled();
    expect(m.productCreate).not.toHaveBeenCalled();
  });

  it('a create failure surfaces as an error (no counter left behind to leak)', async () => {
    m.productCreate.mockRejectedValue(new Error('db down'));
    expect((await post(1)).statusCode).toBe(500);
  });
});
