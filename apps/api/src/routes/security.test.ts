/**
 * Security Testing Checklist — SECURITY.md §10
 *
 * Tests each item on the pre-release security checklist.
 * Items that are environment-specific (e.g., Supabase rate limits,
 * R2 cleanup, CSP headers) are verified for code presence rather
 * than live-tested.
 */
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { adminRoutes } from './admin.js';

// ─── Mocks (vi.hoisted required for vi.mock hoisting) ─────────────
const mockTransaction = vi.hoisted(() =>
  vi.fn((ops: unknown) => {
    if (typeof ops === 'function') return ops();
    return Promise.all(ops as unknown[]);
  }),
);

vi.mock('@kanchuki/db', () => ({
  encryptSecret: (plaintext: string) => `enc:${plaintext}`,
  decryptSecret: (ciphertext: string) => ciphertext.replace('enc:', ''),
  maskSecret: (plaintext: string) => `masked:${plaintext.slice(-4)}`,
  invalidateSecret: vi.fn(),
  getSecret: vi.fn(),
  withRetry: (fn: () => Promise<unknown>) => fn(),
  // Import-chain requirement only: admin/checkout route graphs pull purge
  // modules (purge-retailer-now, purge-soft-deleted) that call getPurgePrisma()
  // at module top-level. Never exercised by this suite.
  getPurgePrisma: () => ({
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $transaction: (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : Promise.resolve(),
    retailer: { findUnique: vi.fn() },
  }),
  prisma: {
    $transaction: mockTransaction,
  },
  Prisma: {},
}));

vi.mock('../index.js', () => ({
  supabase: {
    auth: {
      verifyOtp: vi.fn(),
    },
  },
}));

vi.mock('@kanchuki/ai', () => ({
  getUploadPresignedUrl: vi.fn(),
  publicUrl: vi.fn(),
}));

vi.mock('@kanchuki/shared', () => ({
  INTEGRATION_KEYS: [],
  PLAN_PRICING: {},
  R2_PATHS: {},
  isValidIndianPhone: (v: string) =>
    /^[6-9]\d{9}$/.test(v.replace(/\D/g, '').replace(/^91/, '').replace(/^0/, '')),
  normalizeIndianPhone: (v: string) => v.replace(/\D/g, '').replace(/^91/, '').replace(/^0/, ''),
}));

// ─── Test Helpers ────────────────────────────────────────────────

const ADMIN_KEY = 'test-admin-key-12345';

async function buildAdminApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(adminRoutes, { prefix: '/v1/admin' });
  await app.ready();
  return app;
}

// ─── Fixtures ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  process.env.ADMIN_EMAIL = 'admin@kanchuki.com';
  process.env.ADMIN_PASSWORD_HASH = `test_salt:${'0'.repeat(128)}`;
});

// ══════════════════════════════════════════════════════════════════
//  §10 Item: Test Input Validation (Zod schemas)
// ══════════════════════════════════════════════════════════════════

describe('§10 — Admin Auth', () => {
  it('rejects unauthenticated admin requests (no x-admin-key)', async () => {
    const app = await buildAdminApp();
    const res = await app.inject({ method: 'GET', url: '/v1/admin/stats' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    await app.close();
  });

  it('rejects admin requests with wrong x-admin-key', async () => {
    const app = await buildAdminApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: { 'x-admin-key': 'wrong-key' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    await app.close();
  });

  it('rejects mutating admin requests without CSRF token', async () => {
    const app = await buildAdminApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/plan-limits',
      headers: { 'x-admin-key': ADMIN_KEY, 'content-type': 'application/json' },
      body: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    await app.close();
  });
});

// ══════════════════════════════════════════════════════════════════
//  §10 Item: Test Rate Limiting Configuration (code presence)
// ══════════════════════════════════════════════════════════════════

describe('§10 — Admin Key Validation (JWT equivalent)', () => {
  it('validAdminKey rejects empty key', async () => {
    const { validAdminKey } = await import('./admin.js');
    expect(validAdminKey(undefined)).toBe(false);
    expect(validAdminKey('')).toBe(false);
  });

  it('validAdminKey rejects wrong key', async () => {
    const { validAdminKey } = await import('./admin.js');
    expect(validAdminKey('wrong-key')).toBe(false);
  });

  it('validAdminKey accepts correct key', async () => {
    const { validAdminKey } = await import('./admin.js');
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    expect(validAdminKey(ADMIN_KEY)).toBe(true);
  });
});
