import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { adminShowcaseWatermarkRoutes } from './admin-settings/index.js';

// Mocked before the module graph loads:
// - @kanchuki/db → the audit-log-as-key-value store the settings blob lives in
//   (getSetting → findFirst / saveSetting → create on SETTING_showcase_watermark).
// - @kanchuki/ai → the R2 + URL helpers the route uses (publicUrl for the
//   response logo_url, getUploadPresignedUrl for the upload-url endpoint,
//   deleteObject for the replaced-logo cleanup).
const { mockAuditLogFindFirst, mockAuditLogCreate } = vi.hoisted(() => ({
  mockAuditLogFindFirst: vi.fn(),
  mockAuditLogCreate: vi.fn(),
}));
const { mockPublicUrl, mockPresignedUrl, mockDeleteObject } = vi.hoisted(() => ({
  mockPublicUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
  mockPresignedUrl: vi.fn(async () => 'https://r2.example.com/presigned'),
  mockDeleteObject: vi.fn(async () => undefined),
}));

// The re-watermark background job producer (jobs/rewatermark-showcase-designs.ts)
// is fire-and-forget from the PUT route — asserted but never run in tests.
const { mockAddRewatermarkJob } = vi.hoisted(() => ({
  mockAddRewatermarkJob: vi.fn(async () => undefined),
}));

vi.mock('../jobs/rewatermark-showcase-designs.js', () => ({
  addRewatermarkShowcaseDesignsJob: mockAddRewatermarkJob,
}));

vi.mock('@kanchuki/db', () => ({
  prisma: { auditLog: { findFirst: mockAuditLogFindFirst, create: mockAuditLogCreate } },
  // Import-chain requirement only (admin.js auth graph) — never exercised.
  getPurgePrisma: () => ({
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $transaction: (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : Promise.resolve(),
  }),
  Prisma: {},
}));

vi.mock('@kanchuki/ai', () => ({
  publicUrl: mockPublicUrl,
  getUploadPresignedUrl: mockPresignedUrl,
  deleteObject: mockDeleteObject,
}));

const ADMIN_KEY = 'test-admin-key-12345';
const WM_SETTING_ACTION = 'SETTING_showcase_watermark';

/** Simulated audit-log store — the most recent SETTING_showcase_watermark metadata. */
let wmStore: Record<string, unknown> | null = null;

type AuditLogFindFirstArgs = { where?: { action?: string; resource_type?: string } };
type AuditLogCreateArgs = { data?: { action?: string; metadata?: Record<string, unknown> } };

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(adminShowcaseWatermarkRoutes, { prefix: '/v1/admin' });
  await app.ready();
  return app;
}

function authedHeaders() {
  return { 'x-admin-key': ADMIN_KEY };
}

/** CSRF headers for mutating requests — cookie must match x-csrf-token. */
function csrfHeaders() {
  const token = randomBytes(16).toString('hex');
  return {
    ...authedHeaders(),
    'x-csrf-token': token,
    cookie: `csrf-token=${token}`,
    'content-type': 'application/json',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  wmStore = null;

  mockAuditLogFindFirst.mockImplementation(async (args: AuditLogFindFirstArgs) => {
    if (args?.where?.action !== WM_SETTING_ACTION) return null;
    return wmStore ? { metadata: wmStore } : null;
  });

  mockAuditLogCreate.mockImplementation(async (args: AuditLogCreateArgs) => {
    if (args?.data?.action === WM_SETTING_ACTION) {
      wmStore = args.data.metadata ?? null;
    }
    return { id: 'audit_1', ...args.data };
  });
});

describe('Admin showcase watermark config API', () => {
  it('GET returns the code defaults (logo_url null) when nothing is saved', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/settings/showcase-watermark',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      enabled: false,
      logo_r2_key: null,
      opacity: 0.35,
      scale: 0.18,
      gravity: 'southeast',
      strip_count: 6,
      logo_url: null,
    });
    await app.close();
  });

  it('PUT with one field merges over the defaults and persists the blob', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/settings/showcase-watermark',
      headers: csrfHeaders(),
      payload: { opacity: 0.5 },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.opacity).toBe(0.5);
    expect(data.scale).toBe(0.18);
    expect(data.gravity).toBe('southeast');
    expect(data.strip_count).toBe(6);
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: WM_SETTING_ACTION,
          resource_type: 'AdminSetting',
          metadata: expect.objectContaining({ opacity: 0.5, scale: 0.18 }),
        }),
      }),
    );
    await app.close();
  });

  it('PUT then GET round-trip a full config with a logo_url derived from the key', async () => {
    const app = await buildApp();
    const config = {
      enabled: true,
      logo_r2_key: 'showcase-watermark/logo/abc123.png',
      opacity: 0.6,
      scale: 0.25,
      gravity: 'southwest',
      strip_count: 9,
    };

    const put = await app.inject({
      method: 'PUT',
      url: '/v1/admin/settings/showcase-watermark',
      headers: csrfHeaders(),
      payload: config,
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().data).toEqual({
      ...config,
      logo_url: `https://cdn.example.com/${config.logo_r2_key}`,
    });

    const get = await app.inject({
      method: 'GET',
      url: '/v1/admin/settings/showcase-watermark',
      headers: authedHeaders(),
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data).toEqual({
      ...config,
      logo_url: `https://cdn.example.com/${config.logo_r2_key}`,
    });
    await app.close();
  });

  it('PUT logo_r2_key null clears the platform logo back to the built-in', async () => {
    const app = await buildApp();
    wmStore = { logo_r2_key: 'showcase-watermark/logo/old.png', opacity: 0.5 };

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/settings/showcase-watermark',
      headers: csrfHeaders(),
      payload: { logo_r2_key: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.logo_r2_key).toBeNull();
    expect(res.json().data.logo_url).toBeNull();
    // The replaced logo object is cleaned up (keys this module mints only).
    expect(mockDeleteObject).toHaveBeenCalledWith('showcase-watermark/logo/old.png');
    await app.close();
  });

  it('replacing the logo deletes the old object but NOT an unowned/odd key', async () => {
    const app = await buildApp();
    wmStore = { logo_r2_key: 'some-other/path.png', opacity: 0.5 };

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/settings/showcase-watermark',
      headers: csrfHeaders(),
      payload: { logo_r2_key: 'showcase-watermark/logo/new.png' },
    });
    expect(res.statusCode).toBe(200);
    // Prefix guard: an admin-typed foreign key is never deleted.
    expect(mockDeleteObject).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects unknown gravity / out-of-range values / an empty body with 422', async () => {
    const app = await buildApp();
    for (const payload of [
      { gravity: 'nowhere' },
      { opacity: 3 },
      { scale: -1 },
      { strip_count: 0 },
      {},
    ]) {
      const res = await app.inject({
        method: 'PUT',
        url: '/v1/admin/settings/showcase-watermark',
        headers: csrfHeaders(),
        payload,
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
    await app.close();
  });

  it('logo-upload-url returns a presigned PUT under showcase-watermark/logo/', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/settings/showcase-watermark/logo-upload-url',
      headers: csrfHeaders(),
      payload: { content_type: 'image/png', filename: 'brand-logo.png' },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.upload_url).toBe('https://r2.example.com/presigned');
    expect(data.r2_key).toMatch(/^showcase-watermark\/logo\/[a-f0-9]{16}\.png$/);
    expect(data.public_url).toBe(`https://cdn.example.com/${data.r2_key}`);
    expect(data.expires_in).toBe(300);

    const bad = await app.inject({
      method: 'POST',
      url: '/v1/admin/settings/showcase-watermark/logo-upload-url',
      headers: csrfHeaders(),
      payload: { content_type: 'image/gif', filename: 'x.gif' },
    });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });

  it('enqueues the re-watermark job when a stamp-affecting field changes', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/settings/showcase-watermark',
      headers: csrfHeaders(),
      payload: { opacity: 0.5, gravity: 'southwest' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockAddRewatermarkJob).toHaveBeenCalledWith({ triggered_by: 'admin-config-change' });
    await app.close();
  });

  it('does NOT enqueue for a strip_count-only change (display-only field)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/settings/showcase-watermark',
      headers: csrfHeaders(),
      payload: { strip_count: 9 },
    });
    expect(res.statusCode).toBe(200);
    expect(mockAddRewatermarkJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('does NOT enqueue when a stamp field is PUT with its current value (no-op)', async () => {
    const app = await buildApp();
    wmStore = { opacity: 0.5, strip_count: 6 };
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/settings/showcase-watermark',
      headers: csrfHeaders(),
      payload: { opacity: 0.5 },
    });
    expect(res.statusCode).toBe(200);
    expect(mockAddRewatermarkJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects GET without an admin key and PUT without CSRF (403)', async () => {
    const app = await buildApp();
    const noKey = await app.inject({
      method: 'GET',
      url: '/v1/admin/settings/showcase-watermark',
    });
    expect(noKey.statusCode).toBe(403);

    const noCsrf = await app.inject({
      method: 'PUT',
      url: '/v1/admin/settings/showcase-watermark',
      headers: authedHeaders(),
      payload: { opacity: 0.5 },
    });
    expect(noCsrf.statusCode).toBe(403);
    await app.close();
  });
});
