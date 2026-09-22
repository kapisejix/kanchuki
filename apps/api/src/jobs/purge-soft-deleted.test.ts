// Regression guard for the purge CRON's half of the retailer-child FK graph.
//
// purge-soft-deleted.ts sweeps soft-deleted rows for every retailer at once and
// ends with `DELETE FROM retailers`. A table holding a RESTRICT FK to retailers
// that isn't deleted first makes that statement throw, and because the whole
// sweep shares one transaction the entire thing rolls back — so the cron
// silently does nothing, and (since the audit row is written at the very end)
// nothing is logged either. That is the product_attributes / social_accounts
// bug class from migrations 046/052.
//
// purge-retailer-now.test.ts guards the admin single-retailer path. This file
// guards the cron, which previously had no test at all: the retailer referral
// tables (migration 109) were added to BOTH jobs in one change and only one
// half was covered.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDeleteObject,
  mockExecuteRaw,
  mockQueryRaw,
  mockTransaction,
  mockRetailerFindMany,
  mockAuditLogCreate,
} = vi.hoisted(() => ({
  mockDeleteObject: vi.fn(),
  mockExecuteRaw: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockTransaction: vi.fn(),
  mockRetailerFindMany: vi.fn(),
  mockAuditLogCreate: vi.fn(),
}));

vi.mock('@kanchuki/ai', () => ({
  deleteObject: mockDeleteObject,
}));

vi.mock('@kanchuki/db', () => ({
  // The module reads this once at import time (const db = getPurgePrisma()).
  getPurgePrisma: () => ({
    $executeRawUnsafe: mockExecuteRaw,
    $queryRawUnsafe: mockQueryRaw,
    $transaction: mockTransaction,
    retailer: { findMany: mockRetailerFindMany },
    auditLog: { create: mockAuditLogCreate },
  }),
}));

import { handlePurgeSoftDeleted } from './purge-soft-deleted.js';

/** Collapse the SQL's indentation so assertions read as one line. */
const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();

/** Every statement passed to $executeRawUnsafe, in call order. */
function statements(): string[] {
  return mockExecuteRaw.mock.calls.map((c) => String(c[0]));
}

function deletes(): string[] {
  return statements().filter((s) => s.startsWith('DELETE'));
}

/**
 * Make purgeTable() actually issue its DELETE for the named tables: return one
 * id on that table's first `SELECT id FROM "t"` and nothing afterwards, so the
 * cursor loop terminates after a single batch.
 *
 * Matched on `SELECT id FROM "t"` specifically — the R2-key queries are
 * `SELECT r2_key FROM ...` and the child sweeps embed `SELECT id FROM
 * "retailers"` inside their subquery, so a looser match would consume the
 * wrong call and leave the real DELETE unexercised.
 */
function withRows(...tables: string[]): void {
  const seen = new Set<string>();
  mockQueryRaw.mockImplementation(async (sql: string) => {
    const s = norm(String(sql));
    for (const t of tables) {
      if (!s.startsWith(`SELECT id FROM "${t}"`) || seen.has(t)) continue;
      seen.add(t);
      return [{ id: `${t}_1` }];
    }
    return [];
  });
}

/** The `$1` cutoff argument of every call that carries one. */
function cutoffArgs(): Date[] {
  const args: Date[] = [];
  for (const call of mockExecuteRaw.mock.calls) {
    if (call[1] instanceof Date) args.push(call[1]);
  }
  for (const call of mockQueryRaw.mock.calls) {
    for (const arg of call.slice(1)) {
      if (arg instanceof Date) args.push(arg);
    }
  }
  return args;
}

beforeEach(() => {
  mockDeleteObject.mockReset().mockResolvedValue(undefined);
  mockExecuteRaw.mockReset().mockResolvedValue(null);
  mockQueryRaw.mockReset().mockResolvedValue([]);
  mockRetailerFindMany.mockReset().mockResolvedValue([]);
  mockAuditLogCreate.mockReset().mockResolvedValue({});
  // Calls each op so the mock invocations are recorded, then returns a
  // destructurable tuple (purgeChildren reads `const [, result]`).
  mockTransaction.mockReset().mockImplementation(async (ops: unknown[]) => {
    if (Array.isArray(ops)) {
      for (const op of ops) await op;
    }
    return [null, 1];
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handlePurgeSoftDeleted — retailer referral children (migration 109)', () => {
  it('deletes every referral child before the retailer row', async () => {
    withRows('retailers');
    await handlePurgeSoftDeleted();

    const stmts = statements();
    const retailerIdx = stmts.findIndex((s) => norm(s).startsWith('DELETE FROM "retailers"'));
    // If this is -1 the assertion below would pass vacuously, so pin it first.
    expect(retailerIdx, 'the sweep must delete the retailer row').toBeGreaterThanOrEqual(0);

    for (const child of ['referral_payouts', 'referral_conversions', 'referral_codes']) {
      const idx = stmts.findIndex((s) => norm(s).startsWith(`DELETE FROM "${child}"`));
      expect(idx, `expected a DELETE for ${child}`).toBeGreaterThanOrEqual(0);
      expect(idx, `${child} must be deleted before retailers`).toBeLessThan(retailerIdx);
    }
  });

  it('sweeps referral_conversions for the REFERRED retailer, not just the referrer', async () => {
    withRows('retailers');
    await handlePurgeSoftDeleted();

    const conversions = deletes()
      .map(norm)
      .filter((s) => s.startsWith('DELETE FROM "referral_conversions"'));

    // A conversion is a child of BOTH retailers. Missing the referred side
    // means purging the referred shop throws on the RESTRICT FK and rolls the
    // whole sweep back — a referrer's row blocking an unrelated store's purge.
    expect(conversions.some((s) => s.includes('"referrer_id" IN'))).toBe(true);
    expect(conversions.some((s) => s.includes('"referred_id" IN'))).toBe(true);
  });

  it('deletes referral_payouts before referral_conversions', async () => {
    withRows('retailers');
    await handlePurgeSoftDeleted();

    const stmts = statements();
    const payouts = stmts.findIndex((s) => norm(s).startsWith('DELETE FROM "referral_payouts"'));
    const conversions = stmts.findIndex((s) =>
      norm(s).startsWith('DELETE FROM "referral_conversions"'),
    );

    expect(payouts).toBeGreaterThanOrEqual(0);
    expect(conversions).toBeGreaterThanOrEqual(0);
    // conversions.payout_id -> payouts is ON DELETE SET NULL, so clearing the
    // parent first is another write on the child rows; the other order can
    // deadlock the two concurrent deletes.
    expect(payouts).toBeLessThan(conversions);
  });

  it('scopes the referral sweep to the parent retailer, never a bare table delete', async () => {
    withRows('retailers');
    await handlePurgeSoftDeleted();

    for (const child of ['referral_payouts', 'referral_conversions', 'referral_codes']) {
      const sql = norm(deletes().find((s) => s.startsWith(`DELETE FROM "${child}"`)) as string);
      // Unscoped `DELETE FROM referral_codes` would wipe every retailer's rows.
      expect(sql, child).toContain('IN ( SELECT id FROM "retailers" WHERE deleted_at IS NOT NULL');
      expect(sql, child).toContain('deleted_at < $1');
    }
  });
});

describe('handlePurgeSoftDeleted — sweep invariants', () => {
  it('scopes every delete to rows soft-deleted before the 15-day cutoff', async () => {
    withRows('products', 'collections', 'customers', 'retailers');
    await handlePurgeSoftDeleted();

    // The child sweeps carry the cutoff inline...
    for (const sql of deletes()
      .map(norm)
      .filter((s) => s.includes(' IN ('))) {
      expect(sql).toContain('deleted_at IS NOT NULL AND deleted_at < $1');
    }
    // ...while purgeTable batched its ids from a SELECT, so the predicate has
    // to be there instead (the DELETE itself is `WHERE id = ANY($1::text[])`).
    const idSelects = mockQueryRaw.mock.calls
      .map((c) => norm(String(c[0])))
      .filter((s) => s.startsWith('SELECT id FROM'));
    expect(idSelects.length).toBeGreaterThan(0);
    for (const sql of idSelects) {
      expect(sql).toContain('deleted_at IS NOT NULL AND deleted_at < $1');
    }

    const expected = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const cutoffs = cutoffArgs();
    expect(cutoffs.length).toBeGreaterThan(0);
    for (const cutoff of cutoffs) {
      expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(10_000);
    }
  });

  it('sets the hard-delete bypass in the same transaction as every delete', async () => {
    withRows('retailers');
    await handlePurgeSoftDeleted();

    // Every $executeRawUnsafe call site pairs SET then DELETE inside one
    // $transaction array. The flag is per-connection, and Prisma's pool may
    // route the SET and the DELETE to different connections if they are not
    // in the same transaction — in which case the guardrail trigger fires and
    // the delete is refused.
    const stmts = statements();
    expect(stmts.length).toBeGreaterThan(0);
    expect(stmts.length % 2).toBe(0);
    stmts.forEach((sql, i) => {
      if (i % 2 === 0) {
        expect(sql, `call ${i} should be the bypass flag`).toContain(
          "SET app.allow_hard_delete = 'true'",
        );
      } else {
        expect(sql, `call ${i} should be a DELETE`).toMatch(/^DELETE FROM "/);
      }
    });
  });

  it('purges the four main tables, cleans up retailer R2 assets, and audits once', async () => {
    withRows('products', 'collections', 'customers', 'retailers');
    mockRetailerFindMany.mockResolvedValue([
      {
        logo_r2_key: 'logo.jpg',
        banner_r2_key: null,
        kyc_gst_r2_key: null,
        kyc_aadhar_front_r2_key: null,
        kyc_aadhar_back_r2_key: null,
      },
    ]);

    const result = await handlePurgeSoftDeleted();

    for (const table of ['products', 'collections', 'customers', 'retailers']) {
      expect(
        deletes()
          .map(norm)
          .some((s) => s.startsWith(`DELETE FROM "${table}"`)),
        `expected a DELETE for ${table}`,
      ).toBe(true);
    }

    expect(mockDeleteObject.mock.calls.map((c) => c[0])).toContain('logo.jpg');
    expect(result).toMatchObject({ products: 1, collections: 1, customers: 1, retailers: 1 });

    expect(mockAuditLogCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditLogCreate.mock.calls[0]?.[0] as {
      data: { action: string; metadata: Record<string, number> };
    };
    expect(entry.data.action).toBe('PURGE_SOFT_DELETED');
    expect(entry.data.metadata).toMatchObject({
      products_deleted: 1,
      collections_deleted: 1,
      customers_deleted: 1,
      retailers_deleted: 1,
      purge_after_days: 15,
    });
  });
});
