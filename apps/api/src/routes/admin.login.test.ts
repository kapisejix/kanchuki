import { createHmac } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { adminRoutes } from './admin.js';

// ─── Mock Prisma (needed for module imports, login doesn't use it) ─

vi.mock('@kanchuki/db', () => ({
  encryptSecret: (plaintext: string) => `enc:${plaintext}`,
  maskSecret: (plaintext: string) => `masked:${plaintext.slice(-4)}`,
  invalidateSecret: vi.fn(),
  getSecret: vi.fn(),
  // Import-chain requirement only: admin-routes graph pulls purge-retailer-now /
  // purge-soft-deleted, both calling getPurgePrisma() at module top-level.
  // Never exercised by this suite (login-only).
  getPurgePrisma: () => ({
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $transaction: (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : Promise.resolve(),
    retailer: { findUnique: vi.fn() },
  }),
  prisma: {},
  Prisma: {},
}));

vi.mock('@kanchuki/ai', () => ({
  getUploadPresignedUrl: vi.fn(),
  publicUrl: vi.fn(),
}));

// Spread the REAL module, then override the few values these tests care about.
// A hand-written mock object silently breaks the moment the production code
// starts importing another export from it — `admin-auth.ts` gained
// `isSuperAdminOnlyAdminPath`, and a partial mock would hand it `undefined`,
// turning a green suite into a runtime TypeError (same shape as RC-034's
// fail-open lists). importOriginal keeps the remaining exports real.
vi.mock('@kanchuki/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kanchuki/shared')>()),
  INTEGRATION_KEYS: [],
  PLAN_PRICING: {},
  R2_PATHS: {},
  // The admin route barrel builds `z.enum(STUDIO_ENGINES)` and
  // `z.enum(PRODUCT_DEMOGRAPHICS)` at module load (the photo-cleanup bench's
  // shared body shape), so both must be present AND non-empty — `z.enum([])`
  // throws, and a missing key throws on `z.enum(undefined)`. Values are
  // irrelevant to these tests.
  STUDIO_ENGINES: ['bfl_kontext', 'vton_kontext'],
  PRODUCT_DEMOGRAPHICS: ['womens', 'mens'],
}));

// ─── Test setup ────────────────────────────────────────────────────

const ADMIN_EMAIL = 'admin@kanchuki.com';
// scrypt(salt:hash) format — matches scripts/generate-admin-hash.ts output format
const ADMIN_SALT = '001c7c370f867757e2dbc7825e270d0a';
const ADMIN_HASH =
  '9de4f3fed2af916412389ca12808176569279f249b6e6d2985ef208bb6504446f5ada40b1e5265bc64989ea917cf7fd410d5a855b0b031c49743e2ec25f89b54';
const ADMIN_SCRYPT_HASH = `${ADMIN_SALT}:${ADMIN_HASH}`;
const ADMIN_KEY = 'test-admin-key-12345';

/**
 * Explicit timeout for the FIRST test in this file — the only one with any
 * exposure to vitest's 5 s default, and only because it is first.
 *
 * It carries the cold start (the `adminRoutes` barrel, the scrypt constants, a
 * Fastify `register` + `ready`) on top of a ~50 ms assertion. Measured warm,
 * one fresh process each: **403 / 462 / 480 ms**, with every other test in the
 * file under 300 ms. The two larger sightings — 1092 ms and 1449 ms — were both
 * taken while the machine was still busy from a parallel run, and under two
 * concurrently running suites this test is the one that reported
 * `Test timed out in 5000ms`, with the rejection it asserts working correctly.
 *
 * 15 s is ~30× the warm measurement, so it absorbs a loaded CI box without
 * hiding a hang. Applied to this test ONLY: a hang anywhere else in the file
 * still fails at the default. If tests are ever reordered the new first test
 * inherits this risk — the durable fix is one app built in `beforeAll`.
 */
const COLD_START_TEST_TIMEOUT_MS = 15_000;

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(adminRoutes, { prefix: '/v1/admin' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD_HASH = ADMIN_SCRYPT_HASH;
});

// ─── Login Tests ──────────────────────────────────────────────────
// Admin login is email + password (scrypt) only — no TOTP / 2FA.

describe('POST /v1/admin/login', () => {
  it('rejects missing email', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { password: 'admin123' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('rejects missing password', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: ADMIN_EMAIL },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('rejects wrong email', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: 'wrong@email.com', password: 'admin123' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    await app.close();
  });

  it('rejects wrong password', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: ADMIN_EMAIL, password: 'wrongpassword' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    await app.close();
  });

  it('succeeds with correct email and password', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: ADMIN_EMAIL, password: 'admin123' },
    });
    expect(res.statusCode).toBe(200);
    // S-006: login returns a signed session token, not the permanent ADMIN_API_KEY.
    const token = res.json().data.token;
    expect(token).toBeTruthy();
    expect(token).not.toBe(ADMIN_KEY);
    expect(res.json().data.email).toBe(ADMIN_EMAIL);
    // CSRF cookie should be set
    const setCookieHeader = res.headers['set-cookie'];
    expect(setCookieHeader).toContain('csrf-token=');

    // The returned session token must itself authenticate against a protected route.
    const statsRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: { 'x-admin-key': token },
    });
    expect(statsRes.statusCode).not.toBe(403);

    await app.close();
  });

  it('succeeds with email in different case (case-insensitive)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: 'ADMIN@KANCHUKI.COM', password: 'admin123' },
    });
    expect(res.statusCode).toBe(200);
    // Server returns the email as-sent (not lowercased) — that's fine
    expect(res.json().data.email).toBe('ADMIN@KANCHUKI.COM');
    await app.close();
  });

  it('ignores an unexpected totp_code field in the body', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: ADMIN_EMAIL, password: 'admin123', totp_code: '123456' },
    });
    // TOTP is fully removed — a stray field is simply ignored by the schema.
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('Admin login — legacy HMAC backward compatibility', () => {
  beforeEach(() => {
    // Set a legacy HMAC-SHA256 hash (no colon = detected as legacy)
    const legacyHash = createHmac('sha256', 'admin-password').update('admin123').digest('hex');
    process.env.ADMIN_PASSWORD_HASH = legacyHash;
  });

  it('still accepts login with legacy HMAC format (deprecated)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: ADMIN_EMAIL, password: 'admin123' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('rejects wrong password with legacy HMAC format', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: ADMIN_EMAIL, password: 'wrongpassword' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
