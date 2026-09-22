// T2 — admin referral settings API.
//
// The load-bearing behaviours here are the ones the spec's RC checklist calls
// out: enum-like columns rejected against a known set (RC-027), partial saves
// that never re-validate an unchanged value (RC-010), and the DB CHECK rules
// surfacing as clean 422s instead of Postgres 23514s.
//
// NOTE: the fixtures below hardcode 30 / 12 / 30 / 50000. That is fixture data
// standing in for "whatever the admin has configured" — it is NOT a term in
// application code, which is exactly what T1's no-hardcode rule requires.
import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { adminReferralRoutes, changedKeys, crossFieldError } from './admin-referral.js';

const { mockFindUnique, mockCreate, mockUpdate, mockAuditLogCreate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockAuditLogCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    referralSettings: {
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
    },
    auditLog: { create: mockAuditLogCreate },
  },
}));

const ADMIN_KEY = 'test-admin-key-12345';

// Every field the model has, at the migration-109 defaults.
const baseline = {
  id: 'singleton',
  commission_pct: 30,
  duration_months: 12,
  qualify_days: 30,
  referred_bonus_type: 'FREE_MONTH' as const,
  referred_bonus_value: 1,
  second_tier_enabled: false,
  second_tier_pct: null,
  payout_min_amount: 50000,
  payout_cadence: 'MONTHLY' as const,
  created_at: new Date('2026-09-22T00:00:00.000Z'),
  updated_at: new Date('2026-09-22T00:00:00.000Z'),
};

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(adminReferralRoutes, { prefix: '/v1/admin' });
  await app.ready();
  return app;
}

function getHeaders() {
  return { 'x-admin-key': ADMIN_KEY };
}

function putHeaders() {
  const token = randomBytes(16).toString('hex');
  return {
    'x-admin-key': ADMIN_KEY,
    'x-csrf-token': token,
    cookie: `csrf-token=${token}`,
    'content-type': 'application/json',
  };
}

beforeEach(() => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  // An allowlist set in the ambient environment would fail every request closed.
  delete process.env.ADMIN_IP_ALLOWLIST;
  vi.clearAllMocks();
  mockFindUnique.mockResolvedValue(baseline);
  mockAuditLogCreate.mockResolvedValue({});
  mockUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...baseline,
    ...data,
  }));
  mockCreate.mockResolvedValue(baseline);
});

// ─── Pure helpers ──────────────────────────────────────────────────

describe('changedKeys', () => {
  it('returns only the keys the patch actually moves', () => {
    expect(changedKeys(baseline, { commission_pct: 30 })).toEqual([]); // unchanged
    expect(changedKeys(baseline, { commission_pct: 35 })).toEqual(['commission_pct']);
    expect(changedKeys(baseline, { commission_pct: 35, qualify_days: 30 })).toEqual([
      'commission_pct',
    ]); // qualify_days matches the stored value → not a change
  });

  it('treats null and undefined as the same "no value" for the nullable pct', () => {
    expect(changedKeys(baseline, { second_tier_pct: null })).toEqual([]);
    expect(changedKeys(baseline, { second_tier_pct: 5 })).toEqual(['second_tier_pct']);
  });
});

describe('crossFieldError', () => {
  it('requires 0 bonus value when the referred bonus is switched off', () => {
    expect(crossFieldError(baseline, { referred_bonus_type: 'NONE' })).toMatch(/must be 0/);
    // ...and is satisfied when the caller also sends the paired 0.
    expect(
      crossFieldError(baseline, { referred_bonus_type: 'NONE', referred_bonus_value: 0 }),
    ).toBeNull();
  });

  it('checks the bonus pairing against the MERGED state, not the patch alone', () => {
    // Stored type is FREE_MONTH; sending only a value still has to be valid.
    expect(crossFieldError(baseline, { referred_bonus_value: 0 })).toMatch(/1-24 months/);
    expect(crossFieldError(baseline, { referred_bonus_value: 2 })).toBeNull();
  });

  it('bounds a flat discount as paise', () => {
    expect(
      crossFieldError(baseline, { referred_bonus_type: 'FLAT_DISCOUNT', referred_bonus_value: 0 }),
    ).toMatch(/paise/);
    expect(
      crossFieldError(baseline, {
        referred_bonus_type: 'FLAT_DISCOUNT',
        referred_bonus_value: 50000,
      }),
    ).toBeNull();
  });

  it('requires a second-tier percentage once the second tier is on', () => {
    expect(crossFieldError(baseline, { second_tier_enabled: true })).toMatch(/second_tier_pct/);
    expect(crossFieldError(baseline, { second_tier_enabled: true, second_tier_pct: 5 })).toBeNull();
  });
});

// ─── GET ───────────────────────────────────────────────────────────

describe('GET /v1/admin/referral-settings', () => {
  it('returns the singleton row', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/referral-settings',
      headers: getHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.commission_pct).toBe(30);
    await app.close();
  });

  it('recreates the row from column defaults when the seed is missing', async () => {
    mockFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/referral-settings',
      headers: getHeaders(),
    });

    expect(res.statusCode).toBe(200);
    // An EMPTY data object — every term comes from the DB default, so no term
    // is restated in application code.
    expect(mockCreate).toHaveBeenCalledWith({ data: {} });
    await app.close();
  });
});

// ─── PUT ───────────────────────────────────────────────────────────

describe('PUT /v1/admin/referral-settings', () => {
  it('writes only the changed keys', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/referral-settings',
      headers: putHeaders(),
      payload: { commission_pct: 35, qualify_days: 30 }, // qualify_days is unchanged
    });

    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'singleton' },
      data: { commission_pct: 35 },
    });
    expect(res.json().changed).toEqual(['commission_pct']);
    await app.close();
  });

  it('is a no-op (no write, no audit row) when nothing changed', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/referral-settings',
      headers: putHeaders(),
      payload: { commission_pct: 30 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().changed).toEqual([]);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('records before/after for the changed keys in the audit log', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'PUT',
      url: '/v1/admin/referral-settings',
      headers: putHeaders(),
      payload: { duration_months: 6 },
    });

    const entry = mockAuditLogCreate.mock.calls[0]?.[0] as {
      data: { resource_type: string; metadata: { before: unknown; after: unknown } };
    };
    expect(entry.data.resource_type).toBe('ReferralSettings');
    expect(entry.data.metadata.before).toEqual({ duration_months: 12 });
    expect(entry.data.metadata.after).toEqual({ duration_months: 6 });
    await app.close();
  });

  it('rejects a commission outside 0-100 (422, not a DB error)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/referral-settings',
      headers: putHeaders(),
      payload: { commission_pct: 150 },
    });

    expect(res.statusCode).toBe(422);
    expect(mockUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an unknown bonus type rather than storing and ignoring it (RC-027)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/referral-settings',
      headers: putHeaders(),
      payload: { referred_bonus_type: 'CASHBACK' },
    });

    expect(res.statusCode).toBe(422);
    expect(mockUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an unknown payout cadence (RC-027)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/referral-settings',
      headers: putHeaders(),
      payload: { payout_cadence: 'WEEKLY' },
    });

    expect(res.statusCode).toBe(422);
    expect(mockUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an impossible cross-field state with a named fix', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/referral-settings',
      headers: putHeaders(),
      payload: { second_tier_enabled: true }, // no pct → DB CHECK would 23514
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/second_tier_pct/);
    await app.close();
  });

  it('accepts switching the referred bonus off, with the paired value', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/referral-settings',
      headers: putHeaders(),
      payload: { referred_bonus_type: 'NONE', referred_bonus_value: 0 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().changed).toEqual(['referred_bonus_type', 'referred_bonus_value']);
    await app.close();
  });

  it('accepts an empty body as a no-op rather than a 500', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/referral-settings',
      headers: putHeaders(),
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().changed).toEqual([]);
    await app.close();
  });
});
