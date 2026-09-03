/**
 * Phase II: WhatsApp Catalog Sync webhook receiver (E1–E7).
 *
 * POST /v1/public/webhooks/whatsapp-catalog — Meta posts catalog events
 * (added/updated/deleted/out-of-stock) signed with X-Hub-Signature-256
 * (HMAC-SHA256 of the RAW body using META_APP_SECRET — the app secret, not
 * the verify token). GET on the same URL is the Meta subscription handshake
 * (hub.verify_token === META_WEBHOOK_SECRET, echo hub.challenge).
 */
import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { whatsappCatalogWebhookRoutes } from './whatsapp-catalog.js';

const {
  mockGetSecret,
  mockCatalogItemFindFirst,
  mockCatalogItemFindUnique,
  mockCatalogItemUpdate,
  mockCatalogItemDelete,
  mockProductFindUnique,
  mockProductUpdate,
  mockCatalogSyncLogCreate,
  mockAddCatalogSyncJob,
} = vi.hoisted(() => ({
  mockGetSecret: vi.fn(),
  mockCatalogItemFindFirst: vi.fn(),
  mockCatalogItemFindUnique: vi.fn(),
  mockCatalogItemUpdate: vi.fn(),
  mockCatalogItemDelete: vi.fn(),
  mockProductFindUnique: vi.fn(),
  mockProductUpdate: vi.fn(),
  mockCatalogSyncLogCreate: vi.fn(),
  mockAddCatalogSyncJob: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  getSecret: mockGetSecret,
  prisma: {
    catalogItem: {
      findFirst: mockCatalogItemFindFirst,
      findUnique: mockCatalogItemFindUnique,
      update: mockCatalogItemUpdate,
      delete: mockCatalogItemDelete,
    },
    product: { findUnique: mockProductFindUnique, update: mockProductUpdate },
    catalogSyncLog: { create: mockCatalogSyncLogCreate },
  },
  Prisma: {},
}));

vi.mock('../../jobs/index.js', () => ({
  addCatalogSyncJob: mockAddCatalogSyncJob,
}));

const APP_SECRET = 'app-secret-value';
const VERIFY_TOKEN = 'verify-token-value';
const RETAILER_ID = 'retailer_1';

const MAPPED_ITEM = {
  product_id: 'p1',
  whatsapp_catalog_item_id: 'meta_1',
  whatsapp_catalog_id: 'cat_1',
};

async function buildApp() {
  const app = Fastify();
  await app.register(whatsappCatalogWebhookRoutes, { prefix: '/v1' });
  await app.ready();
  return app;
}

function sign(rawBody: string, secret: string = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

async function postEvent(
  app: ReturnType<typeof buildApp> extends Promise<infer T> ? T : never,
  body: unknown,
) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return app.inject({
    method: 'POST',
    url: '/v1/public/webhooks/whatsapp-catalog',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(raw) },
    payload: raw,
  });
}

const eventPayload = (field: string, value: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'waba_1', changes: [{ field, value }] }],
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSecret.mockImplementation((key: string) => {
    if (key === 'META_APP_SECRET') return Promise.resolve(APP_SECRET);
    if (key === 'META_WEBHOOK_SECRET') return Promise.resolve(VERIFY_TOKEN);
    return Promise.resolve(null);
  });
  mockCatalogItemFindFirst.mockResolvedValue(MAPPED_ITEM);
  mockCatalogItemUpdate.mockResolvedValue({});
  mockCatalogItemDelete.mockResolvedValue({});
  mockProductFindUnique.mockResolvedValue({ retailer_id: RETAILER_ID, deleted_at: null });
  mockProductUpdate.mockResolvedValue({});
  mockCatalogSyncLogCreate.mockResolvedValue({});
  mockAddCatalogSyncJob.mockResolvedValue('job_x');
});

// ─── GET handshake (E1) ──────────────────────────────────────────

describe('GET /public/webhooks/whatsapp-catalog — handshake', () => {
  it('echoes the challenge when the verify token matches', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/v1/public/webhooks/whatsapp-catalog?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=abc123`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('abc123');
    await app.close();
  });

  it('rejects an unknown verify token', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/webhooks/whatsapp-catalog?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123',
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('rejects a non-subscribe mode', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url:
        '/v1/public/webhooks/whatsapp-catalog?hub.mode=unsubscribe&hub.verify_token=' +
        VERIFY_TOKEN,
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST auth (E2) ──────────────────────────────────────────────

describe('POST /public/webhooks/whatsapp-catalog — signature auth', () => {
  it('rejects when the signature header is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/webhooks/whatsapp-catalog',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(eventPayload('catalog_item_updated', {})),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_SIGNATURE');
    expect(mockCatalogSyncLogCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a wrong signature (tampered body)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/webhooks/whatsapp-catalog',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': sign('{"tampered":true}'),
      },
      payload: JSON.stringify(eventPayload('catalog_item_deleted', {})),
    });
    expect(res.statusCode).toBe(401);
    expect(mockCatalogItemDelete).not.toHaveBeenCalled();
    await app.close();
  });

  it('fails closed (503) when META_APP_SECRET is not configured', async () => {
    mockGetSecret.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/webhooks/whatsapp-catalog',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign('{}') },
      payload: JSON.stringify(eventPayload('catalog_item_updated', {})),
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

// ─── Event handling (E3–E7) ──────────────────────────────────────

describe('POST /public/webhooks/whatsapp-catalog — event handling', () => {
  it('E5: drops the local mapping on catalog_item_deleted', async () => {
    const app = await buildApp();
    const res = await postEvent(
      app,
      eventPayload('catalog_item_deleted', { id: 'meta_1', retailer_id: 'p1' }),
    );

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true, handled: 1, unmatched: 0 });
    expect(mockCatalogItemDelete).toHaveBeenCalledWith({ where: { product_id: 'p1' } });
    expect(mockProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { whatsapp_catalog_item_id: null } }),
    );
    expect(mockCatalogSyncLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operation: 'webhook',
          retailer_id: RETAILER_ID,
          product_id: 'p1',
          payload_json: expect.objectContaining({ matched: true, action: 'meta_deleted' }),
        }),
      }),
    );
    await app.close();
  });

  it('E4: syncs price and availability back on catalog_item_updated', async () => {
    const app = await buildApp();
    const res = await postEvent(
      app,
      eventPayload('catalog_item_updated', {
        id: 'meta_1',
        retailer_id: 'p1',
        price: 199000,
        availability: 'in stock',
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(mockProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { price_min: 199000 } }),
    );
    // 'in stock' maps to AVAILABLE — product status written once
    expect(mockProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'AVAILABLE' } }),
    );
    expect(mockCatalogItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { product_id: 'p1' },
        data: expect.objectContaining({
          product_price_paise: 199000,
          product_status_snapshot: 'AVAILABLE',
        }),
      }),
    );
    await app.close();
  });

  it('E6: marks the product SOLD on catalog_item_out_of_stock', async () => {
    const app = await buildApp();
    const res = await postEvent(
      app,
      eventPayload('catalog_item_out_of_stock', { id: 'meta_1', retailer_id: 'p1' }),
    );

    expect(res.statusCode).toBe(200);
    expect(mockProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'SOLD' } }),
    );
    expect(mockCatalogSyncLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload_json: expect.objectContaining({ action: 'status_updated' }),
        }),
      }),
    );
    await app.close();
  });

  it('E3: unmatched added event enqueues a sync when the product is live', async () => {
    mockCatalogItemFindFirst.mockResolvedValue(null);
    mockCatalogItemFindUnique.mockResolvedValue(null);
    const app = await buildApp();
    const res = await postEvent(
      app,
      eventPayload('catalog_item_added', { id: 'meta_new', retailer_id: 'p1' }),
    );

    expect(res.statusCode).toBe(200);
    expect(res.json().unmatched).toBe(1);
    expect(mockAddCatalogSyncJob).toHaveBeenCalledWith({
      retailer_id: RETAILER_ID,
      operation: 'single_product',
      product_id: 'p1',
      triggered_by: 'webhook',
    });
    expect(mockCatalogSyncLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload_json: expect.objectContaining({ matched: false, action: 'sync_enqueued' }),
        }),
      }),
    );
    await app.close();
  });

  it('ignores non-catalog fields (e.g. messages) without side effects', async () => {
    const app = await buildApp();
    const res = await postEvent(app, {
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba_1', changes: [{ field: 'messages', value: { id: 'msg1' } }] }],
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true, handled: 0, unmatched: 0 });
    expect(mockCatalogSyncLogCreate).not.toHaveBeenCalled();
    expect(mockCatalogItemDelete).not.toHaveBeenCalled();
    await app.close();
  });

  it('answers 200 for an empty entry list', async () => {
    const app = await buildApp();
    const res = await postEvent(app, { object: 'whatsapp_business_account', entry: [] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true, handled: 0, unmatched: 0 });
    await app.close();
  });
});
