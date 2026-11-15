// Bulk create (catalog import + bulk onboarding): an item may carry the retailer's audience pick.
// A bad value on one item must not fail the whole import (it just stays unset), and an age band
// is kept only with a kids audience.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  reserve: vi.fn(),
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

import { errorHandler } from '../plugins/error-handler.js';
import { catalogImportRoutes } from './catalog-import.js';

const RETAILER_ID = 'retailer_1';

async function bulk(items: object[]) {
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
    payload: {
      items: items.map((i, n) => ({
        cropped_r2_key: `catalog-import/${RETAILER_ID}/k${n}.jpg`,
        ...i,
      })),
    },
  });
  await app.close();
  return res;
}

const created = (n = 0) => m.productCreate.mock.calls[n]?.[0].data;

beforeEach(() => {
  vi.resetAllMocks();
  m.reserve.mockResolvedValue(async () => undefined);
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

describe('bulk-create-products — audience', () => {
  it('stores a kids audience with its age band', async () => {
    const res = await bulk([{ audience: 'BOYS', kids_age_group: 'AGE_6_8' }]);
    expect(res.statusCode).toBe(201);
    expect(created()).toMatchObject({ audience: 'BOYS', kids_age_group: 'AGE_6_8' });
  });

  it('drops the age band for an adult audience', async () => {
    await bulk([{ audience: 'WOMEN', kids_age_group: 'AGE_3_5' }]);
    expect(created()).toMatchObject({ audience: 'WOMEN', kids_age_group: null });
  });

  it('imports an item with a bad audience, leaving it unset, and the rest succeed', async () => {
    const res = await bulk([{ audience: 'junk', kids_age_group: 'AGE_3_5' }, { audience: 'MEN' }]);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.total_created).toBe(2);
    expect(created(0)).not.toHaveProperty('audience');
    expect(created(0)).not.toHaveProperty('kids_age_group');
    expect(created(1)).toMatchObject({ audience: 'MEN' });
  });

  it('writes neither column when the item sends neither', async () => {
    await bulk([{}]);
    expect(created()).not.toHaveProperty('audience');
    expect(created()).not.toHaveProperty('kids_age_group');
  });
});
