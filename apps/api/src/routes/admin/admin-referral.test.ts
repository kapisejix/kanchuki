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
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import {
  BONUS_TYPES,
  UNIMPLEMENTED_BONUS_TYPES,
  adminReferralRoutes,
  changedKeys,
  crossFieldError,
} from './admin-referral.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

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

// Every field the model has, at the migration-109 defaults (plus migration
// 114's tax knobs at their all-OFF defaults — owner decision 2026-09-23).
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
  tds_enabled: false,
  tds_pct: 0,
  gst_applicable: false,
  gst_pct: 0,
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

  it('still bounds a flat discount as paise for a row that already holds one', () => {
    // T4 narrowed the ACCEPTED set to FREE_MONTH/NONE (nothing can apply a
    // discount), so the route can no longer produce this pairing. The check is
    // kept for a row written before the narrowing or by hand in SQL: patching
    // any other field must still not land an impossible value. The cast is the
    // point — the type no longer admits it, and that is the desired state.
    const legacy = (patch: Record<string, unknown>) =>
      crossFieldError(baseline, patch as Parameters<typeof crossFieldError>[1]);

    expect(legacy({ referred_bonus_type: 'FLAT_DISCOUNT', referred_bonus_value: 0 })).toMatch(
      /paise/,
    );
    expect(
      legacy({ referred_bonus_type: 'FLAT_DISCOUNT', referred_bonus_value: 50000 }),
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

  it('refuses FLAT_DISCOUNT by name instead of storing a bonus nothing applies', async () => {
    // The whole point of the narrowing: an admin must not be able to set a
    // referred-side bonus that no code path delivers. Rejected before zod so the
    // message explains WHY rather than saying `Invalid enum value`, and rejected
    // before any write so the row is untouched.
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/referral-settings',
      headers: putHeaders(),
      payload: { referred_bonus_type: 'FLAT_DISCOUNT', referred_bonus_value: 50000 },
    });

    expect(res.statusCode).toBe(422);
    const message = res.json().error.message as string;
    expect(message).toMatch(/FLAT_DISCOUNT/);
    expect(message).toMatch(/not available/);
    // The reason, not just the rejection — this is the string an operator reads.
    expect(message).toMatch(/nothing applies a discount/i);
    expect(mockUpdate).not.toHaveBeenCalled();
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

// ─── The enum guard ──────────────────────────────────────────────────
//
// RC-027's shape: a value the CODE does not implement, stored and then silently
// ignored. `BONUS_TYPES` (selectable) and `UNIMPLEMENTED_BONUS_TYPES` (refused,
// with a reason) are two hand-maintained lists, and the thing they can both
// drift from is the PostgreSQL enum in schema.prisma — which is the only place a
// new member actually appears. Deriving the requirement from the schema is what
// makes adding one impossible to miss, and it is the same technique the purge
// guards use so their lists cannot rot either.
describe('every bonus type in the database is accounted for in code', () => {
  function bonusEnumMembers(): string[] {
    const schema = readFileSync(join(REPO_ROOT, 'packages/db/prisma/schema.prisma'), 'utf8');
    const start = schema.indexOf('\nenum ReferralBonusType {');
    expect(start, 'enum ReferralBonusType not found in schema.prisma').toBeGreaterThan(-1);
    const body = schema.slice(start + 1);
    return body
      .slice(body.indexOf('{') + 1, body.indexOf('}'))
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('//') && !line.startsWith('@@'));
  }

  it('parses the enum it is guarding', () => {
    // Without this the assertions below could pass vacuously on a bad parse —
    // an empty list trivially has no unhandled members. The three members are
    // asserted as a floor, not as a snapshot: adding a fourth must not fail here.
    const members = bonusEnumMembers();
    expect(members).toContain('FREE_MONTH');
    expect(members).toContain('NONE');
    expect(members.length).toBeGreaterThanOrEqual(3);
  });

  it('has no member that is neither selectable nor refused with a reason', () => {
    const handled = new Set<string>([...BONUS_TYPES, ...Object.keys(UNIMPLEMENTED_BONUS_TYPES)]);
    const unhandled = bonusEnumMembers().filter((m) => !handled.has(m));

    expect(unhandled).toEqual([]);
  });

  it('names a real enum member in every "not implemented" entry', () => {
    // A stale entry — a renamed or removed enum member — would silently widen
    // the list of things covered, hiding the day a NEW member needs handling.
    const members = new Set(bonusEnumMembers());
    const stale = Object.keys(UNIMPLEMENTED_BONUS_TYPES).filter((k) => !members.has(k));

    expect(stale).toEqual([]);
  });

  it('gives every refusal a reason, and never lists a type as both', () => {
    for (const [type, reason] of Object.entries(UNIMPLEMENTED_BONUS_TYPES)) {
      expect(reason.trim(), `${type} needs a reason an operator can read`).not.toBe('');
      expect(BONUS_TYPES).not.toContain(type);
    }
  });
});
