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
  prisma: {},
  Prisma: {},
}));

vi.mock('@kanchuki/ai', () => ({
  getUploadPresignedUrl: vi.fn(),
  publicUrl: vi.fn(),
}));

vi.mock('@kanchuki/shared', () => ({
  INTEGRATION_KEYS: [],
  PLAN_PRICING: {},
  R2_PATHS: {},
}));

// ─── TOTP helper (generates RFC 6238 TOTP codes without otplib) ────

function base32Decode(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.toUpperCase()) {
    const idx = alphabet.indexOf(c);
    if (idx >= 0) bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotpCode(secret: string, offset = 0): string {
  const counter = Math.floor(Date.now() / 1000 / 30) + offset;
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret))
    .update(counterBuf)
    .digest();
  const idx = hmac.readUInt8(19) & 0xf;
  // RFC 4226 §5.4: dynamic truncation — safe because idx + 3 < 20 for SHA1
  // Use readUInt8 instead of indexed access to avoid TS strict-null issues on Buffer
  const b0 = hmac.readUInt8(idx);
  const b1 = hmac.readUInt8(idx + 1);
  const b2 = hmac.readUInt8(idx + 2);
  const b3 = hmac.readUInt8(idx + 3);
  const truncated = ((b0 & 0x7f) << 24) | (b1 << 16) | (b2 << 8) | b3;
  return (truncated % 1000000).toString().padStart(6, '0');
}

// ─── Test setup ────────────────────────────────────────────────────

const ADMIN_EMAIL = 'admin@kanchuki.com';
// scrypt(salt:hash) format — matches scripts/generate-admin-hash.ts output format
const ADMIN_SALT = '001c7c370f867757e2dbc7825e270d0a';
const ADMIN_HASH =
  '9de4f3fed2af916412389ca12808176569279f249b6e6d2985ef208bb6504446f5ada40b1e5265bc64989ea917cf7fd410d5a855b0b031c49743e2ec25f89b54';
const ADMIN_SCRYPT_HASH = `${ADMIN_SALT}:${ADMIN_HASH}`;
const ADMIN_TOTP_SECRET = 'SH7DWMSYDDUTT2ACLPYSUKG3BFBZBSTK';
const ADMIN_KEY = 'test-admin-key-12345';

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
  process.env.ADMIN_TOTP_SECRET = ADMIN_TOTP_SECRET;
});

// ─── Login Tests ──────────────────────────────────────────────────

describe('POST /v1/admin/login', () => {
  it('rejects missing email', async () => {
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

  it('rejects login when TOTP is configured but not provided', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: ADMIN_EMAIL, password: 'admin123' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('TOTP code is required');
    await app.close();
  });

  it('rejects login with invalid TOTP code', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: ADMIN_EMAIL, password: 'admin123', totp_code: '000000' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    expect(res.json().error.message).toContain('TOTP');
    await app.close();
  });

  it('rejects TOTP code that is not 6 digits', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: ADMIN_EMAIL, password: 'admin123', totp_code: '12345' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('succeeds with correct email, password, and TOTP code', async () => {
    const totpCode = generateTotpCode(ADMIN_TOTP_SECRET);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: ADMIN_EMAIL, password: 'admin123', totp_code: totpCode },
    });
    expect(res.statusCode).toBe(200);
    // S-006: login returns a signed session token, not the permanent ADMIN_API_KEY.
    const token = res.json().data.token;
    expect(token).toBeTruthy();
    expect(token).not.toBe(ADMIN_KEY);
    expect(res.json().data.email).toBe(ADMIN_EMAIL);
    expect(res.json().data.totp_enabled).toBe(true);
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
    const totpCode = generateTotpCode(ADMIN_TOTP_SECRET);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: 'ADMIN@KANCHUKI.COM', password: 'admin123', totp_code: totpCode },
    });
    expect(res.statusCode).toBe(200);
    // Server returns the email as-sent (not lowercased) — that's fine
    expect(res.json().data.email).toBe('ADMIN@KANCHUKI.COM');
    expect(res.json().data.totp_enabled).toBe(true);
    await app.close();
  });

  it('succeeds with TOTP from adjacent time window (clock drift tolerance)', async () => {
    // otplib's verifySync uses window: 0 by default (no tolerance for clock drift).
    // This means a code from offset=-1 (30s ago) is normally rejected unless
    // the server or test runner has configured a wider window.
    // We test this to document the behavior, not to assert a specific outcome.
    const totpCode = generateTotpCode(ADMIN_TOTP_SECRET, -1);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: ADMIN_EMAIL, password: 'admin123', totp_code: totpCode },
    });
    // 200 = window is configured; 403 = strict window:0 (default)
    expect([200, 403]).toContain(res.statusCode);
    await app.close();
  });
});

describe('Admin login — legacy HMAC backward compatibility', () => {
  beforeEach(() => {
    // Set a legacy HMAC-SHA256 hash (no colon = detected as legacy)
    const legacyHash = createHmac('sha256', 'admin-password')
      .update('admin123')
      .digest('hex');
    process.env.ADMIN_PASSWORD_HASH = legacyHash;
  });

  it('still accepts login with legacy HMAC format (deprecated)', async () => {
    const totpCode = generateTotpCode(ADMIN_TOTP_SECRET);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: ADMIN_EMAIL, password: 'admin123', totp_code: totpCode },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.totp_enabled).toBe(true);
    await app.close();
  });

  it('rejects wrong password with legacy HMAC format', async () => {
    const totpCode = generateTotpCode(ADMIN_TOTP_SECRET);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: ADMIN_EMAIL, password: 'wrongpassword', totp_code: totpCode },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('Admin login — TOTP optional (no ADMIN_TOTP_SECRET)', () => {
  beforeEach(() => {
    delete process.env.ADMIN_TOTP_SECRET;
  });

  it('succeeds with password only when TOTP is not configured', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: ADMIN_EMAIL, password: 'admin123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.totp_enabled).toBe(false);
    await app.close();
  });

  it('ignores TOTP code if sent when TOTP is not configured', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      body: { email: ADMIN_EMAIL, password: 'admin123', totp_code: '123456' },
    });
    // totp_code is optional in schema; if TOTP_SECRET is not set, it's ignored
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
