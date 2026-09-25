// T6 — the referral commission accrual job.
//
// Mirrors referral-qualify.test.ts's three priorities, adapted to what T6
// owns:
//
//  1. WHAT THE JOB WRITES. The UPDATE payload is asserted with a full
//     `toEqual`, not field-by-field — so `paid_at` (T7's, DB-CHECK-guarded),
//     `payout_id` (T7's) and `commission_base_amount` (T5's snapshot, never
//     re-read) cannot creep in without turning the payload test red. The
//     first-earn freeze (`commission_monthly_paise` written ONCE, then never
//     again) is asserted both ways.
//  2. THAT THE WRITE IS A COMPARE-AND-SWAP. The WHERE carries the old status,
//     old `accrued_months` AND old `accrued_through_period`. Dropping any one
//     lets two overlapping runs double-credit a month.
//  3. THAT EVERY BRANCH IS REACHABLE. EARN / FUTURE / CEILING / DONE each get
//     an input that produces it, plus the data-integrity throw for a
//     QUALIFIED row with no successful payment (unreachable through T5's
//     gate — reaching it means corrupted data).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '@kanchuki/shared/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockConversionFindMany,
  mockPaymentFindMany,
  mockSettingsFindUnique,
  mockTransaction,
  mockUpdateMany,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockConversionFindMany: vi.fn(),
  mockPaymentFindMany: vi.fn(),
  mockSettingsFindUnique: vi.fn(),
  mockTransaction: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    referralConversion: { findMany: mockConversionFindMany },
    subscriptionPayment: { findMany: mockPaymentFindMany },
    referralSettings: { findUnique: mockSettingsFindUnique },
    $transaction: mockTransaction,
  },
}));

import {
  type AccrualCandidate,
  decideAccrual,
  handleReferralAccrue,
  nextPeriod,
  periodEndExclusive,
  periodKey,
} from './referral-accrue.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** "Now" with August (IST) fully ended and September still running. */
const NOW = new Date('2026-09-15T10:00:00Z');
/** "Now" with September (IST) also fully ended — for tests that EARN September. */
const OCT_NOW = new Date('2026-10-15T10:00:00Z');
const SETTINGS = { commission_pct: 30, duration_months: 12 };

/** A fresh QUALIFIED conversion for a store that paid ₹9,999.00/mo. */
function candidate(overrides: Partial<AccrualCandidate> = {}): AccrualCandidate {
  return {
    id: 'rc_1',
    referrer_id: 'ref_1',
    referred_id: 'shop_1',
    status: 'QUALIFIED',
    commission_base_amount: 999_900,
    accrued_months: 0,
    accrued_through_period: null,
    commission_monthly_paise: null,
    ...overrides,
  };
}

/** The store paid on these UTC instants (all mid-month IST). */
function paidOn(...isoDates: string[]): Set<string> {
  return new Set(isoDates.map((d) => periodKey(new Date(d))));
}

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: clear leaves mockResolvedValueOnce
  // queues intact, so a test whose job exits early (e.g. the missing-settings
  // throw) leaks its queued page into the next test and poisons its scan.
  vi.resetAllMocks();
  mockSettingsFindUnique.mockResolvedValue({
    id: 'singleton',
    commission_pct: SETTINGS.commission_pct,
    duration_months: SETTINGS.duration_months,
  });
  mockPaymentFindMany.mockResolvedValue([]);
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockAuditCreate.mockResolvedValue({ id: 'audit_1' });
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      referralConversion: { updateMany: mockUpdateMany },
      auditLog: { create: mockAuditCreate },
    }),
  );
});

function withCandidates(...rows: unknown[]): void {
  mockConversionFindMany.mockResolvedValueOnce(rows);
  mockConversionFindMany.mockResolvedValue([]);
}

describe('period arithmetic', () => {
  it('periodKey uses the IST calendar, not UTC', () => {
    // 18:29:59 UTC = 23:59:59 IST → still August. One second later the IST
    // date rolls to September. A UTC periodKey would put the boundary at
    // 18:30 UTC minus nothing — the whole ledger would be offset by 5.5h.
    expect(periodKey(new Date('2026-08-31T18:29:59Z'))).toBe('2026-08');
    expect(periodKey(new Date('2026-08-31T18:30:00Z'))).toBe('2026-09');
  });

  it('nextPeriod rolls the year', () => {
    expect(nextPeriod('2025-12')).toBe('2026-01');
    expect(nextPeriod('2026-08')).toBe('2026-09');
  });

  it('periodEndExclusive is the first instant AFTER the IST month ends', () => {
    // March (IST) ends at 2026-03-31T18:30:00Z; December ends 2025-12-31T18:30Z.
    expect(periodEndExclusive('2026-03').toISOString()).toBe('2026-03-31T18:30:00.000Z');
    expect(periodEndExclusive('2025-12').toISOString()).toBe('2025-12-31T18:30:00.000Z');
  });
});

describe('decideAccrual', () => {
  it("EARNs the first installment on the store's FIRST payment month — the anchor is the first charge, not qualification", () => {
    // Owner rule: "after the trial the retailer starts paying us, then we pay
    // the referrer." A store that paid since August but only qualified in
    // September still earns month 1 for August — the trial months (no
    // payments) were never month 1 to begin with.
    const decision = decideAccrual({
      candidate: candidate(),
      facts: {
        first_payment_period: '2026-08',
        paid_periods: paidOn('2026-08-05T06:00:00Z'),
        now: NOW,
      },
      settings: SETTINGS,
    });
    expect(decision).toEqual({
      action: 'EARN',
      period: '2026-08',
      monthly_amount: 299_970, // 999_900 × 30% — exact, no rounding drift
      skipped_months: 0,
    });
  });

  it('rounds the monthly amount to whole paise', () => {
    const decision = decideAccrual({
      candidate: candidate({ commission_base_amount: 999_999 }),
      facts: {
        first_payment_period: '2026-08',
        paid_periods: paidOn('2026-08-05T06:00:00Z'),
        now: NOW,
      },
      settings: SETTINGS,
    });
    expect(decision).toMatchObject({ action: 'EARN', monthly_amount: 300_000 }); // 299 999.7 → 300 000
  });

  it('is FUTURE while the candidate month has not fully ended', () => {
    // The store's first payment is THIS month — nobody can know September's
    // payment picture on September 15. Earning now would also let a
    // mid-month payment land in the wrong month.
    const decision = decideAccrual({
      candidate: candidate(),
      facts: {
        first_payment_period: '2026-09',
        paid_periods: paidOn('2026-09-10T06:00:00Z'),
        now: NOW,
      },
      settings: SETTINGS,
    });
    expect(decision).toEqual({ action: 'FUTURE', period: '2026-09', skipped_months: 0 });
  });

  it('EARNs again in a later paid month, walking past unpaid ones without advancing the installment', () => {
    // Store paid Aug (already earned), skipped Sep, paid Oct. The SAME
    // installment number (2) stays available for October — owner decision 3:
    // an unpaid month is skipped, never clawed back, and never consumed.
    const decision = decideAccrual({
      candidate: candidate({
        accrued_months: 1,
        accrued_through_period: '2026-08',
        commission_monthly_paise: 299_970,
      }),
      facts: {
        first_payment_period: '2026-08',
        paid_periods: paidOn('2026-08-05T06:00:00Z', '2026-10-06T06:00:00Z'),
        now: new Date('2026-11-15T10:00:00Z'),
      },
      settings: SETTINGS,
    });
    expect(decision).toEqual({
      action: 'EARN',
      period: '2026-10',
      monthly_amount: 299_970,
      skipped_months: 1,
    });
  });

  it('a month already earned is NEVER re-earned — the cursor advances past it', () => {
    // The mechanism that makes nightly runs idempotent: with Aug earned and
    // the store having paid nothing since, the walk starts at Sep — NOT at
    // the first payment month again. A walk that restarted at '2026-08'
    // would double-credit month 1 on every subsequent run.
    const decision = decideAccrual({
      candidate: candidate({
        accrued_months: 1,
        accrued_through_period: '2026-08',
        commission_monthly_paise: 299_970,
      }),
      facts: {
        first_payment_period: '2026-08',
        paid_periods: paidOn('2026-08-05T06:00:00Z'),
        now: NOW,
      },
      settings: SETTINGS,
    });
    expect(decision).toEqual({ action: 'FUTURE', period: '2026-09', skipped_months: 0 });
  });

  // ─── Refunds (§5A.2) ───────────────────────────────────────────────
  // "Does a refunded month still earn?" has two halves, and only one of them
  // is a no. These two tests exist to state both, because the interesting one
  // is the half that is NOT a clawback and would otherwise be assumed.

  it('a month whose only payment was REFUNDED does not earn — the walk skips it and the installment is not consumed', () => {
    // The store paid July, was refunded for August, and paid September.
    // `paid_periods` is the set of months with a SUCCESS payment (a refunded
    // row is excluded by the loader's `status: 'success'` whitelist), so
    // August is simply absent — the same treatment as a month the store never
    // paid for at all. The installment number stays available for September:
    // a refund SKIPS a month, it does not advance the program.
    const decision = decideAccrual({
      candidate: candidate({
        accrued_months: 1,
        accrued_through_period: '2026-07',
        commission_monthly_paise: 299_970,
      }),
      facts: {
        first_payment_period: '2026-07',
        paid_periods: paidOn('2026-07-05T06:00:00Z', '2026-09-10T06:00:00Z'),
        now: OCT_NOW,
      },
      settings: SETTINGS,
    });
    expect(decision).toEqual({
      action: 'EARN',
      period: '2026-09',
      monthly_amount: 299_970,
      skipped_months: 1, // August — refunded, so it counts as skipped, not earned
    });
  });

  it('a refund AFTER a month already earned does NOT un-earn it — this job never looks back', () => {
    // The honest boundary of ".a refunded month stops earning": it stops
    // FUTURE months. An installment that was already credited when the charge
    // was 'success' stays credited — the cursor only ever moves forward, and
    // nothing here writes a negative accrual. Stated as a test because the
    // opposite is what an operator would reasonably expect, and an owner
    // deciding refund policy needs the real behaviour, not the intuitive one.
    const decision = decideAccrual({
      candidate: candidate({
        accrued_months: 1,
        accrued_through_period: '2026-07',
        commission_monthly_paise: 299_970,
      }),
      facts: {
        first_payment_period: '2026-07',
        // July's payment has since been refunded — it is gone from the set...
        paid_periods: paidOn('2026-08-05T06:00:00Z'),
        now: NOW,
      },
      settings: SETTINGS,
    });
    // ...and the walk still starts at August, so July's earned installment is
    // never re-examined. July cannot be revoked by anything in this job.
    expect(decision).toEqual({
      action: 'EARN',
      period: '2026-08',
      monthly_amount: 299_970,
      skipped_months: 0,
    });
    expect(decision).not.toHaveProperty('revoke');
  });

  it('freezes the monthly amount at first earn — later pct edits cannot reprice it', () => {
    // commission_monthly_paise is set, and settings now say 10%: the frozen
    // 299 970 wins. Both directions matter — an admin halving pct must not
    // claw earned months, and raising it must not enrich them retroactively.
    const decision = decideAccrual({
      candidate: candidate({
        accrued_months: 1,
        accrued_through_period: '2026-08',
        commission_monthly_paise: 299_970,
      }),
      facts: {
        first_payment_period: '2026-08',
        paid_periods: paidOn('2026-08-05T06:00:00Z', '2026-09-05T06:00:00Z'),
        now: OCT_NOW,
      },
      settings: { commission_pct: 10, duration_months: 12 },
    });
    expect(decision).toMatchObject({ action: 'EARN', period: '2026-09', monthly_amount: 299_970 });
  });

  it('is DONE once duration_months installments have earned — checked before anything else', () => {
    const decision = decideAccrual({
      candidate: candidate({
        accrued_months: 12,
        accrued_through_period: '2026-08',
        commission_monthly_paise: 299_970,
      }),
      facts: {
        first_payment_period: '2026-08',
        paid_periods: paidOn('2026-08-05T06:00:00Z'),
        now: NOW,
      },
      settings: SETTINGS,
    });
    expect(decision).toEqual({ action: 'DONE' });
  });

  it('hits the CEILING after 60 consecutive unpaid months and parks the conversion', () => {
    // Store stopped paying after Aug 2026. Five years of dead months must
    // not make every nightly walk unbounded — the earned months stand and
    // the conversion is skipped until its store pays again.
    const decision = decideAccrual({
      candidate: candidate({
        accrued_months: 1,
        accrued_through_period: '2026-08',
        commission_monthly_paise: 299_970,
      }),
      facts: {
        first_payment_period: '2026-08',
        paid_periods: paidOn('2026-08-05T06:00:00Z'),
        now: new Date('2032-01-15T10:00:00Z'),
      },
      settings: SETTINGS,
    });
    expect(decision).toEqual({ action: 'CEILING', skipped_months: 60 });
  });

  it('throws on a QUALIFIED row whose store has no successful payment — data integrity, not a silent DONE', () => {
    // Unreachable through T5's gate (QUALIFIED requires ≥1 successful
    // payment). Silently treating it as DONE would bury corruption; the
    // throw surfaces it through the per-row isolation and the error counter.
    expect(() =>
      decideAccrual({
        candidate: candidate(),
        facts: { first_payment_period: null, paid_periods: new Set(), now: NOW },
        settings: SETTINGS,
      }),
    ).toThrow(/no successful payment/);
  });
});

describe('handleReferralAccrue — writes', () => {
  it('first earn writes EXACTLY the T6 columns — and never paid_at, payout_id or the base', async () => {
    withCandidates(candidate());
    mockPaymentFindMany.mockResolvedValue([
      {
        retailer_id: 'shop_1',
        paid_at: new Date('2026-08-05T06:00:00Z'),
        created_at: new Date('2026-08-05T06:00:00Z'),
      },
    ]);

    const summary = await handleReferralAccrue({ now: NOW });

    expect(summary).toMatchObject({ scanned: 1, earned: 1, earned_paise: 299_970 });
    const call = mockUpdateMany.mock.calls[0]?.[0];
    // Full toEqual: any extra field — paid_at (T7's, CHECK-guarded), payout_id
    // (T7's), commission_base_amount (T5's frozen snapshot) — fails here.
    expect(call.data).toEqual({
      accrued_months: 1,
      accrued_through_period: '2026-08',
      commission_accrued: { increment: 299_970 },
      commission_monthly_paise: 299_970,
    });
  });

  it('later earns do NOT touch the frozen monthly amount', async () => {
    withCandidates(
      candidate({
        accrued_months: 1,
        accrued_through_period: '2026-08',
        commission_monthly_paise: 299_970,
      }),
    );
    mockPaymentFindMany.mockResolvedValue([
      {
        retailer_id: 'shop_1',
        paid_at: new Date('2026-09-05T06:00:00Z'),
        created_at: new Date('2026-09-05T06:00:00Z'),
      },
    ]);

    await handleReferralAccrue({ now: OCT_NOW });

    const call = mockUpdateMany.mock.calls[0]?.[0];
    expect(call.data).toEqual({
      accrued_months: 2,
      accrued_through_period: '2026-09',
      commission_accrued: { increment: 299_970 },
    });
  });

  it('gates the transition on the full old state — status, accrued_months AND the cursor', async () => {
    // The compare-and-swap. Any of the three missing lets an overlapping run
    // (or a row an admin touched mid-flight) double-credit a month.
    withCandidates(
      candidate({
        accrued_months: 1,
        accrued_through_period: '2026-08',
        commission_monthly_paise: 299_970,
      }),
    );
    mockPaymentFindMany.mockResolvedValue([
      {
        retailer_id: 'shop_1',
        paid_at: new Date('2026-09-05T06:00:00Z'),
        created_at: new Date('2026-09-05T06:00:00Z'),
      },
    ]);

    await handleReferralAccrue({ now: OCT_NOW });

    expect(mockUpdateMany.mock.calls[0]?.[0]?.where).toEqual({
      id: 'rc_1',
      status: { in: ['QUALIFIED', 'PAID'] },
      accrued_months: 1,
      accrued_through_period: '2026-08',
    });
  });

  it('credits at most ONE installment per conversion per run', async () => {
    // The store has paid many months; one run earns one month and leaves the
    // rest to the following nights (a backlog drains, it never bursts).
    withCandidates(candidate());
    mockPaymentFindMany.mockResolvedValue([
      {
        retailer_id: 'shop_1',
        paid_at: new Date('2026-08-05T06:00:00Z'),
        created_at: new Date('2026-08-05T06:00:00Z'),
      },
    ]);

    await handleReferralAccrue({ now: new Date('2032-01-15T10:00:00Z') });

    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('reports a raced row and audits nothing for it', async () => {
    withCandidates(candidate());
    mockPaymentFindMany.mockResolvedValue([
      {
        retailer_id: 'shop_1',
        paid_at: new Date('2026-08-05T06:00:00Z'),
        created_at: new Date('2026-08-05T06:00:00Z'),
      },
    ]);
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const summary = await handleReferralAccrue({ now: NOW });

    expect(summary).toMatchObject({ scanned: 1, earned: 0, raced: 1 });
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('writes the audit row in the SAME transaction as the credit', async () => {
    withCandidates(candidate());
    mockPaymentFindMany.mockResolvedValue([
      {
        retailer_id: 'shop_1',
        paid_at: new Date('2026-08-05T06:00:00Z'),
        created_at: new Date('2026-08-05T06:00:00Z'),
      },
    ]);

    await handleReferralAccrue({ now: NOW });

    // Both writes go through the transaction's tx client, so a failed audit
    // rolls the credit back for tomorrow instead of leaving a credit with no
    // trace (and vice versa).
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      actor_type: 'system',
      action: 'REFERRAL_COMMISSION_ACCRUED',
      resource_type: 'ReferralConversion',
      resource_id: 'rc_1',
      metadata: {
        referrer_id: 'ref_1',
        referred_id: 'shop_1',
        period: '2026-08',
        monthly_amount: 299_970,
        accrued_months: 1,
        duration_months_total: 12,
        first_accrual: true,
      },
    });
  });

  it('isolates a failing row and still processes the rest of the batch', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    withCandidates(
      candidate({ id: 'rc_1', referred_id: 'shop_1' }),
      candidate({ id: 'rc_2', referred_id: 'shop_2' }),
    );
    mockPaymentFindMany.mockResolvedValue([
      {
        retailer_id: 'shop_1',
        paid_at: new Date('2026-08-05T06:00:00Z'),
        created_at: new Date('2026-08-05T06:00:00Z'),
      },
      {
        retailer_id: 'shop_2',
        paid_at: new Date('2026-08-05T06:00:00Z'),
        created_at: new Date('2026-08-05T06:00:00Z'),
      },
    ]);
    mockUpdateMany.mockRejectedValueOnce(new Error('deadlock detected'));

    const summary = await handleReferralAccrue({ now: NOW });

    expect(summary).toMatchObject({ scanned: 2, earned: 1, errors: 1 });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });
});

describe('handleReferralAccrue — selection and settings', () => {
  it('selects only QUALIFIED and PAID rows — never PENDING or CLAWED_BACK', async () => {
    withCandidates();

    await handleReferralAccrue({ now: NOW });

    expect(mockConversionFindMany.mock.calls[0]?.[0]?.where).toMatchObject({
      status: { in: ['QUALIFIED', 'PAID'] },
    });
  });

  it('reads commission_pct and duration_months from the settings singleton at call time', async () => {
    withCandidates();
    mockSettingsFindUnique.mockResolvedValue({
      id: 'singleton',
      commission_pct: 5,
      duration_months: 3,
    });

    await handleReferralAccrue({ now: NOW });

    expect(mockSettingsFindUnique).toHaveBeenCalledWith({ where: { id: 'singleton' } });
  });

  it('fails loudly when the settings singleton is missing (migration 109 unapplied)', async () => {
    withCandidates();
    mockSettingsFindUnique.mockResolvedValue(null);

    await expect(handleReferralAccrue({ now: NOW })).rejects.toThrow(
      /singleton.*109|109.*singleton/s,
    );
  });

  it('resolves payment months in one grouped query for the whole batch', async () => {
    withCandidates(
      candidate({ id: 'rc_1', referred_id: 'shop_1' }),
      candidate({ id: 'rc_2', referred_id: 'shop_2' }),
    );
    mockPaymentFindMany.mockResolvedValue([
      {
        retailer_id: 'shop_1',
        paid_at: new Date('2026-08-05T06:00:00Z'),
        created_at: new Date('2026-08-05T06:00:00Z'),
      },
      {
        retailer_id: 'shop_2',
        paid_at: new Date('2026-09-05T06:00:00Z'),
        created_at: new Date('2026-09-05T06:00:00Z'),
      },
    ]);

    await handleReferralAccrue({ now: NOW });

    // One lookup per batch, not one per candidate — the N+1 this avoids.
    expect(mockPaymentFindMany).toHaveBeenCalledTimes(1);
    expect(mockPaymentFindMany.mock.calls[0]?.[0]?.where).toMatchObject({
      retailer_id: { in: ['shop_1', 'shop_2'] },
      status: 'success',
    });
  });

  it('counts a paid month by a WHITELIST on success — a refunded row cannot earn', async () => {
    // The mechanism behind §5A.2's first half. A blacklist (`status: { not:
    // 'refunded' }`) would let a FAILED charge count as a paid month the
    // moment a new payment status appeared, and would count today's 'failed'
    // rows too. Asserting the exact form is the point: this test fails on any
    // relaxation, not just on removing the filter.
    withCandidates(candidate({ id: 'rc_1', referred_id: 'shop_1' }));
    mockPaymentFindMany.mockResolvedValue([]);

    await handleReferralAccrue({ now: NOW });

    const where = mockPaymentFindMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.status).toBe('success');
    expect(where.status).not.toEqual({ not: 'refunded' });
    expect(where.status).not.toEqual({ in: ['success', 'refunded'] });
  });

  it('sums earned paise across multiple conversions', async () => {
    withCandidates(
      candidate({ id: 'rc_1', referred_id: 'shop_1' }),
      candidate({ id: 'rc_2', referred_id: 'shop_2' }),
    );
    mockPaymentFindMany.mockResolvedValue([
      {
        retailer_id: 'shop_1',
        paid_at: new Date('2026-08-05T06:00:00Z'),
        created_at: new Date('2026-08-05T06:00:00Z'),
      },
      {
        retailer_id: 'shop_2',
        paid_at: new Date('2026-08-06T06:00:00Z'),
        created_at: new Date('2026-08-06T06:00:00Z'),
      },
    ]);

    const summary = await handleReferralAccrue({ now: NOW });

    expect(summary).toMatchObject({ earned: 2, earned_paise: 599_940 });
  });

  it('counts a store that never paid again as FUTURE-then-CEILING territory, writing nothing', async () => {
    // Fresh qualification whose only payment is the CURRENT month: nothing
    // is earnable, nothing is written — the inert case must write nothing
    // rather than advancing any cursor.
    withCandidates(candidate());
    mockPaymentFindMany.mockResolvedValue([
      {
        retailer_id: 'shop_1',
        paid_at: new Date('2026-09-10T06:00:00Z'),
        created_at: new Date('2026-09-10T06:00:00Z'),
      },
    ]);

    const summary = await handleReferralAccrue({ now: NOW });

    expect(summary).toMatchObject({ scanned: 1, earned: 0, future: 1 });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe('referral-accrue cron wiring', () => {
  /**
   * Comments stripped before scanning — the header EXPLAINS rules the scan checks.
   * The stripper is the shared one (`@kanchuki/shared/testing`, RC-043); this
   * file used to carry its own copy of the regex.
   */
  const code = stripComments;

  const jobsIndex = readFileSync(join(REPO_ROOT, 'apps/api/src/jobs/index.ts'), 'utf8');
  const jobSource = code(
    readFileSync(join(REPO_ROOT, 'apps/api/src/jobs/referral-accrue.ts'), 'utf8'),
  );

  it('is registered in the maintenance worker switch', () => {
    // The "wired but never registered" class — two social-composer routes
    // 404'd for a day because exactly this registration was missing.
    expect(jobsIndex).toMatch(/case 'referral-accrue':\s*\n\s*return handleReferralAccrue\(\);/);
  });

  it('is scheduled on the maintenance queue AFTER the 02:00 qualification', () => {
    // Accruing before qualification would mean tonight's newly-qualified rows
    // are invisible to tonight's accrual; 02:15 runs after T5's 02:00.
    expect(jobsIndex).toMatch(
      /getMaintenanceQueue\(\)\.add\(\s*\n\s*'referral-accrue',[\s\S]{0,200}?pattern: '15 2 \* \* \*'/,
    );
  });

  it('never writes paid_at in code — T7 is its only writer', () => {
    // `paid_at` appears exactly once in the job, in the SubscriptionPayment
    // SELECT (reading the store's charge date). A write site would be a
    // second occurrence shape — `paid_at:` in an update payload. The DB CHECK
    // only guards QUALIFIED, so a paid_at write on a PAID row would succeed
    // silently and corrupt the referrer's payout history.
    const writeSites = jobSource.match(/paid_at\s*:/g) ?? [];
    expect(writeSites).toHaveLength(1); // the payment-facts select only
    expect(jobSource).not.toMatch(/\bpayout_id\b/);
  });

  it('never reads commission_base_amount back from the subscription', () => {
    // The base is T5's snapshot; the only subscription write T6 may see is
    // its own snapshot column. Re-deriving the base would undo the
    // freeze-the-terms discipline for every already-earned month.
    expect(jobSource).not.toMatch(/subscription\.(findUnique|findFirst|findMany)/);
  });
});
