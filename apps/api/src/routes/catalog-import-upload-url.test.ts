// H5-2 / RC-148 — the catalog-import presign handed out FINAL keys (catalog-source/, catalog-pdf/)
// that no confirm step ever verifies, so whatever was PUT stayed on the public CDN. Like every
// other presign route it now hands out a staged key, which the lifecycle rule expires.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ presign: vi.fn() }));

vi.mock('@kanchuki/ai', () => ({
  detectCropAndTag: vi.fn(),
  fetchImageBuffer: vi.fn(),
  getUploadPresignedUrl: m.presign,
  publicUrl: (k: string) => `https://cdn.example/${k}`,
  reserveAiCredits: vi.fn(),
}));
vi.mock('@kanchuki/db', () => ({ prisma: {}, withRetry: (fn: () => Promise<unknown>) => fn() }));
vi.mock('../jobs/index.js', () => ({ addTaggingJob: vi.fn() }));
vi.mock('../lib/ai-usage.js', () => ({ recordAiUsage: vi.fn() }));
vi.mock('../lib/quota.js', () => ({ checkQuota: vi.fn(), reserveQuota: vi.fn() }));
vi.mock('../lib/sku.js', () => ({ createSkuSequencer: vi.fn() }));
vi.mock('../lib/upload-guard.js', async (orig) => ({
  ...(await orig<typeof import('../lib/upload-guard.js')>()),
  UPLOAD_URL_RATE_LIMIT: {},
}));

import { errorHandler } from '../plugins/error-handler.js';
import { catalogImportRoutes } from './catalog-import.js';

async function presign(content_type: string) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = 'r1';
  });
  await app.register(catalogImportRoutes, { prefix: '/v1' });
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: '/v1/catalog-import/upload-url',
    payload: { filename: 'a', content_type, size_bytes: 1000, content_length: 1000 },
  });
  await app.close();
  return res;
}

beforeEach(() => {
  vi.resetAllMocks();
  m.presign.mockResolvedValue('https://r2.example/put');
});

describe('POST /catalog-import/upload-url — staged keys', () => {
  it.each([
    ['image/jpeg', 'uploads/pending/catalog-source/r1/', '.jpg'],
    ['application/pdf', 'uploads/pending/catalog-pdf/r1/', '.pdf'],
  ])('%s presigns a staged key', async (type, prefix, ext) => {
    const res = await presign(type);
    expect(res.statusCode).toBe(200);
    const { r2_key, public_url } = res.json().data;
    expect(r2_key.startsWith(prefix)).toBe(true);
    expect(r2_key.endsWith(ext)).toBe(true);
    expect(m.presign.mock.calls[0]?.[0]).toBe(r2_key);
    expect(public_url).toBe(`https://cdn.example/${r2_key}`);
  });
});
