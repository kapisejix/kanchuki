/**
 * H6-2 / RC-155 / RC-156: every route that spends AI_TAGGING_CALL reserves first and settles once
 * the AI call is over, whatever way it ends. (The reserve/settle arithmetic itself is covered in
 * lib/ai-usage-reserve.test.ts; here the collaborators are stubbed and the wiring is under test.)
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  reserve: vi.fn(),
  settle: vi.fn(),
  onProviderUsed: vi.fn(),
  detect: vi.fn(),
  ask: vi.fn(),
  checkQuota: vi.fn(),
  productFind: vi.fn(),
  productUpdate: vi.fn(),
  hasFeature: vi.fn(),
}));

vi.mock('@kanchuki/ai', () => ({
  detectCropAndTag: m.detect,
  runVisionAsk: m.ask,
  fetchImageBuffer: vi.fn(),
  getUploadPresignedUrl: vi.fn(),
  publicUrl: vi.fn(),
  reserveAiCredits: vi.fn().mockResolvedValue(1),
}));
vi.mock('@kanchuki/db', () => ({
  prisma: { product: { findFirst: m.productFind, update: m.productUpdate } },
  withRetry: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../jobs/index.js', () => ({ addTaggingJob: vi.fn() }));
vi.mock('../lib/ai-usage.js', () => ({ reserveTaggingQuota: m.reserve }));
vi.mock('../lib/quota.js', () => ({ checkQuota: m.checkQuota, reserveQuota: vi.fn() }));
vi.mock('../lib/features.js', () => ({ hasFeature: m.hasFeature }));
vi.mock('../lib/sku.js', () => ({ createSkuSequencer: vi.fn() }));
vi.mock('../lib/upload-guard.js', () => ({
  IMAGE_KINDS: [],
  UPLOAD_URL_RATE_LIMIT: {},
  stagingKey: vi.fn(),
  verifyUpload: vi.fn(),
}));

import { errorHandler, planLimitExceeded } from '../plugins/error-handler.js';
import { catalogImportRoutes } from './catalog-import.js';
import { growthTranslateRoutes } from './growth/growth-translate.js';

const RETAILER_ID = 'retailer_1';
const IMG = 'https://cdn.example.com/a.jpg';
const FOUND = [{ description: 'Full image', croppedUrl: 'u', r2Key: 'k', tags: {} }];

async function app() {
  const server = Fastify();
  server.setErrorHandler(errorHandler);
  server.decorateRequest('retailerId', '');
  server.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await server.register(catalogImportRoutes, { prefix: '/v1' });
  await server.register(growthTranslateRoutes, { prefix: '/v1/growth' });
  await server.ready();
  return server;
}

beforeEach(() => {
  vi.resetAllMocks();
  m.settle.mockResolvedValue(undefined);
  m.reserve.mockResolvedValue({ onProviderUsed: m.onProviderUsed, settle: m.settle });
  m.checkQuota.mockResolvedValue(undefined);
  m.hasFeature.mockResolvedValue(true);
  m.detect.mockResolvedValue(FOUND);
  m.ask.mockResolvedValue('namaste');
  m.productFind.mockResolvedValue({ id: 'p1', name: 'Kurti', sizes: [], metadata: {} });
  m.productUpdate.mockResolvedValue({});
});

describe('POST /catalog-import/detect-items', () => {
  const call = async () =>
    (await app()).inject({
      method: 'POST',
      url: '/v1/catalog-import/detect-items',
      payload: { image_url: IMG },
    });

  it('reserves before the AI call, feeds the spend back, settles once', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(m.reserve).toHaveBeenCalledWith(RETAILER_ID);
    expect(m.detect).toHaveBeenCalledWith(
      IMG,
      RETAILER_ID,
      expect.objectContaining({ onProviderUsed: m.onProviderUsed }),
    );
    expect(m.settle).toHaveBeenCalledOnce();
  });

  it('settles once when detection throws', async () => {
    m.detect.mockRejectedValue(new Error('vision down'));
    const res = await call();
    expect(res.statusCode).toBe(500);
    expect(m.settle).toHaveBeenCalledOnce();
  });

  it('a full quota is a clean 402 and the AI is never called', async () => {
    m.reserve.mockRejectedValue(planLimitExceeded('ai tagging call'));
    const res = await call();
    expect(res.statusCode).toBe(402);
    expect(m.detect).not.toHaveBeenCalled();
  });
});

describe('POST /catalog-import/import-pdf (client-rendered pages)', () => {
  const call = async (pages: number) =>
    (await app()).inject({
      method: 'POST',
      url: '/v1/catalog-import/import-pdf',
      payload: { pdf_url: IMG, page_images: Array.from({ length: pages }, () => IMG) },
    });

  it('reserves and settles once per page', async () => {
    const res = await call(2);
    expect(res.statusCode).toBe(200);
    expect(m.reserve).toHaveBeenCalledTimes(2);
    expect(m.settle).toHaveBeenCalledTimes(2);
  });

  it('running out mid-batch skips that page, keeps the earlier ones, settles what it reserved', async () => {
    m.reserve
      .mockResolvedValueOnce({ onProviderUsed: m.onProviderUsed, settle: m.settle })
      .mockRejectedValueOnce(planLimitExceeded('ai tagging call'));
    const res = await call(2);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.total_items).toBe(1);
    expect(m.detect).toHaveBeenCalledOnce();
    expect(m.settle).toHaveBeenCalledOnce();
  });

  it('a full quota before the first page is still a 402 (fail-fast read)', async () => {
    m.checkQuota.mockRejectedValue(planLimitExceeded('ai tagging call'));
    const res = await call(2);
    expect(res.statusCode).toBe(402);
    expect(m.reserve).not.toHaveBeenCalled();
  });
});

describe('growth translate (one reserve, settled once — no extra charge on top)', () => {
  const desc = async () =>
    (await app()).inject({
      method: 'POST',
      url: '/v1/growth/products/p1/descriptions',
      payload: { language: 'hindi' },
    });
  const msg = async () =>
    (await app()).inject({
      method: 'POST',
      url: '/v1/growth/translate/message',
      payload: { message: 'Hi {{name}}', language: 'hindi' },
    });

  it('description: reserves, passes the spend hook, settles once', async () => {
    const res = await desc();
    expect(res.statusCode).toBe(200);
    expect(m.reserve).toHaveBeenCalledOnce();
    expect(m.ask).toHaveBeenCalledWith(
      expect.objectContaining({ onProviderUsed: m.onProviderUsed }),
    );
    expect(m.settle).toHaveBeenCalledOnce();
  });

  it('description: settles once when the AI call fails', async () => {
    m.ask.mockRejectedValue(new Error('provider down'));
    const res = await desc();
    expect(res.statusCode).toBe(422);
    expect(m.settle).toHaveBeenCalledOnce();
  });

  it('message: reserves, passes the spend hook, settles once', async () => {
    const res = await msg();
    expect(res.statusCode).toBe(200);
    expect(m.reserve).toHaveBeenCalledOnce();
    expect(m.ask).toHaveBeenCalledWith(
      expect.objectContaining({ onProviderUsed: m.onProviderUsed }),
    );
    expect(m.settle).toHaveBeenCalledOnce();
  });

  it('message: settles once when the AI call fails', async () => {
    m.ask.mockRejectedValue(new Error('provider down'));
    const res = await msg();
    expect(res.statusCode).toBe(422);
    expect(m.settle).toHaveBeenCalledOnce();
  });
});
