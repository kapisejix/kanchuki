// T5 — the referral qualification cron.
//
// Three things this file exists to pin, in descending order of how expensive
// they are to get wrong:
//
//  1. WHAT THE JOB WRITES. `paid_at` and `commission_accrued` must NOT appear in
//     T5's UPDATE. `paid_at` is the referrer's payout date (T7) and the DB CHECK
//     forbids it on a QUALIFIED row; `commission_accrued` is T6's column. Both
//     are asserted by absence from the write payload, because a wrong extra
//     field here is a constraint violation at best and a wrong payout at worst.
//  2. THAT THE TRANSITION IS A COMPARE-AND-SWAP. `status: 'PENDING'` in the WHERE
//     is what makes overlapping runs safe; a read-then-write version passes every
//     single-threaded test and double-transitions in production.
//  3. THAT EVERY BRANCH IS REACHABLE. A clawback path no input can produce is
//     coverage that reads as protection and provides none, so the branch table
//     lives in `decideQualification` tests and the last case there asserts each
//     outcome is produced by some input.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockConversionFindMany,
  mockPaymentFindMany,
  mockTransaction,
  mockUpdateMany,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockConversionFindMany: vi.fn(),
  mockPaymentFindMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    referralConversion: { findMany: mockConversionFindMany },
    subscriptionPayment: { findMany: mockPaymentFindMany },
    $transaction: mockTransaction,
  },
}));

import { decideQualification, handleReferralQualify } from './referral-qualify.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** A due PENDING conversion for a paid, active store — the happy path baseline. */
function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rc_1',
    referrer_id: 'ref_1',
    referred_id: 'shop_1',
    referred: {
      id: 'shop_1',
      deleted_at: null,
      is_suspended: false,
      subscriptions: [{ status: 'ACTIVE' as const, amount_inr: 999_900 }],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPaymentFindMany.mockResolvedValue([]);
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockAuditCreate.mockResolvedValue({ id: 'audit_1' });
  // Interactive transaction: run the callback against a tx carrying the same
  // spies, so assertions see the writes the job actually makes inside it.
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      referralConversion: { updateMany: mockUpdateMany },
      auditLog: { create: mockAuditCreate },
    }),
  );
});

/**
 * Serve one page then an empty one. The job pages with a cursor until a page
 * comes back short, so a single `mockResolvedValue` would be re-served forever
 * if the fixture count ever equalled the page size.
 */
function withCandidates(...rows: unknown[]): void {
  mockConversionFindMany.mockResolvedValueOnce(rows);
  mockConversionFindMany.mockResolvedValue([]);
}

describe('decideQualification', () => {
  it('claws back a deleted store even when it has paid and is active', () => {
    expect(
      decideQualification({
        referred: {
          deleted_at: new Date('2026-09-01'),
          is_suspended: false,
          subscriptions: [{ status: 'ACTIVE', amount_inr: 999_900 }],
        },
        hasSuccessfulPayment: true,
      }),
    ).toEqual({ outcome: 'CLAW_BACK', reason: 'REFERRED_DELETED' });
  });

  it('prefers terminal over never-paid — a deleted store is clawed back, not waited on', () => {
    // Pins the ORDER of the first two gates. Reversing them would leave a
    // deleted store PENDING forever, re-scanned nightly, and the ledger would
    // never say the referral died.
    expect(
      decideQualification({
        referred: { deleted_at: new Date('2026-09-01'), is_suspended: false, subscriptions: [] },
        hasSuccessfulPayment: false,
      }),
    ).toEqual({ outcome: 'CLAW_BACK', reason: 'REFERRED_DELETED' });
  });

  it('waits when the store has never paid', () => {
    expect(
      decideQualification({
        referred: {
          deleted_at: null,
          is_suspended: false,
          subscriptions: [{ status: 'ACTIVE', amount_inr: 999_900 }],
        },
        hasSuccessfulPayment: false,
      }),
    ).toEqual({ outcome: 'WAIT', reason: 'NOT_PAID' });
  });

  it('leaves a never-paid cancellation PENDING rather than clawing it back', () => {
    // The spec's churn clause is about a store that paid and then left. With no
    // payment there is no value to lose, and CLAWED_BACK is irreversible — so
    // this must stay eligible if the store resubscribes inside its window.
    expect(
      decideQualification({
        referred: {
          deleted_at: null,
          is_suspended: false,
          subscriptions: [{ status: 'CANCELLED', amount_inr: 999_900 }],
        },
        hasSuccessfulPayment: false,
      }),
    ).toEqual({ outcome: 'WAIT', reason: 'NOT_PAID' });
  });

  it('waits while suspended even when paid and active, because suspension is reversible', () => {
    expect(
      decideQualification({
        referred: {
          deleted_at: null,
          is_suspended: true,
          subscriptions: [{ status: 'ACTIVE', amount_inr: 999_900 }],
        },
        hasSuccessfulPayment: true,
      }),
    ).toEqual({ outcome: 'WAIT', reason: 'SUSPENDED' });
  });

  it('qualifies a paid, active store and snapshots the ex-GST base in paise', () => {
    // `Subscription.amount_inr` is documented as paise, the same unit as
    // commission_base_amount. A `* 100` here would multiply every payout by 100
    // without failing anything, so the exact value is asserted.
    expect(
      decideQualification({
        referred: {
          deleted_at: null,
          is_suspended: false,
          subscriptions: [{ status: 'ACTIVE', amount_inr: 999_900 }],
        },
        hasSuccessfulPayment: true,
      }),
    ).toEqual({ outcome: 'QUALIFY', base_amount: 999_900 });
  });

  it('claws back a store that paid and then cancelled inside the window', () => {
    expect(
      decideQualification({
        referred: {
          deleted_at: null,
          is_suspended: false,
          subscriptions: [{ status: 'CANCELLED', amount_inr: 999_900 }],
        },
        hasSuccessfulPayment: true,
      }),
    ).toEqual({ outcome: 'CLAW_BACK', reason: 'REFERRED_CHURNED_AFTER_PAYMENT' });
  });

  it('qualifies when an ACTIVE subscription sits alongside an older cancellation', () => {
    // Churn requires the ABSENCE of an active subscription. Treating any
    // cancellation on record as churn would claw back every retailer who ever
    // changed plan.
    expect(
      decideQualification({
        referred: {
          deleted_at: null,
          is_suspended: false,
          subscriptions: [
            { status: 'ACTIVE', amount_inr: 1_499_900 },
            { status: 'CANCELLED', amount_inr: 499_900 },
          ],
        },
        hasSuccessfulPayment: true,
      }),
    ).toEqual({ outcome: 'QUALIFY', base_amount: 1_499_900 });
  });

  it('waits on PAST_DUE — dunning is recoverable', () => {
    expect(
      decideQualification({
        referred: {
          deleted_at: null,
          is_suspended: false,
          subscriptions: [{ status: 'PAST_DUE', amount_inr: 999_900 }],
        },
        hasSuccessfulPayment: true,
      }),
    ).toEqual({ outcome: 'WAIT', reason: 'PAST_DUE_REVIEW' });
  });

  it('waits when the only subscription is a trial', () => {
    expect(
      decideQualification({
        referred: {
          deleted_at: null,
          is_suspended: false,
          subscriptions: [{ status: 'TRIAL', amount_inr: 0 }],
        },
        hasSuccessfulPayment: true,
      }),
    ).toEqual({ outcome: 'WAIT', reason: 'NO_ACTIVE_SUBSCRIPTION' });
  });

  it('waits when there is no subscription at all', () => {
    expect(
      decideQualification({
        referred: { deleted_at: null, is_suspended: false, subscriptions: [] },
        hasSuccessfulPayment: true,
      }),
    ).toEqual({ outcome: 'WAIT', reason: 'NO_ACTIVE_SUBSCRIPTION' });
  });

  it('every outcome and every reason is produced by an input in this file', () => {
    // Anti-vacuous-guard check. A branch nothing can reach is coverage that reads
    // as protection; this asserts the table above covers the whole decision type.
    const produced = new Set<string>();
    for (const hasSuccessfulPayment of [true, false]) {
      for (const subscriptions of [
        [] as { status: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELLED'; amount_inr: number }[],
        [{ status: 'ACTIVE' as const, amount_inr: 1 }],
        [{ status: 'TRIAL' as const, amount_inr: 1 }],
        [{ status: 'PAST_DUE' as const, amount_inr: 1 }],
        [{ status: 'CANCELLED' as const, amount_inr: 1 }],
      ]) {
        for (const deleted_at of [null, new Date('2026-09-01')]) {
          for (const is_suspended of [false, true]) {
            const d = decideQualification({
              referred: { deleted_at, is_suspended, subscriptions },
              hasSuccessfulPayment,
            });
            produced.add(d.outcome === 'WAIT' ? `WAIT:${d.reason}` : d.outcome);
          }
        }
      }
    }
    expect([...produced].sort()).toEqual([
      'CLAW_BACK', // both reasons, named in the REASONS assertion below
      'QUALIFY',
      // 'T' sorts before '_', so NOT_PAID precedes NO_ACTIVE_SUBSCRIPTION.
      'WAIT:NOT_PAID',
      'WAIT:NO_ACTIVE_SUBSCRIPTION',
      'WAIT:PAST_DUE_REVIEW',
      'WAIT:SUSPENDED',
    ]);
    // The two clawback REASONS are distinct outcomes reaching the same status, so
    // the status-level set above cannot prove both. Assert them by name.
    const reasons = new Set<string>();
    for (const input of [
      { deleted_at: new Date('2026-09-01'), is_suspended: false, subscriptions: [] },
      {
        deleted_at: null,
        is_suspended: false,
        subscriptions: [{ status: 'CANCELLED' as const, amount_inr: 1 }],
      },
    ]) {
      const d = decideQualification({ referred: input, hasSuccessfulPayment: true });
      if (d.outcome === 'CLAW_BACK') reasons.add(d.reason);
    }
    expect([...reasons].sort()).toEqual(['REFERRED_CHURNED_AFTER_PAYMENT', 'REFERRED_DELETED']);
  });
});

describe('handleReferralQualify', () => {
  const NOW = new Date('2026-09-22T01:00:00.000Z');

  it('does nothing when no conversion is due', async () => {
    mockConversionFindMany.mockResolvedValue([]);
    const summary = await handleReferralQualify({ now: NOW });
    expect(summary).toMatchObject({ scanned: 0, qualified: 0, clawed_back: 0 });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('considers only PENDING rows whose stored qualifies_at has passed', async () => {
    // The window comes from the row, not from settings read at run time: T4
    // stamped `qualifies_at` from `qualify_days` at signup. Asserting the clause
    // is asserting where that rule lives.
    mockConversionFindMany.mockResolvedValue([]);
    await handleReferralQualify({ now: NOW });
    expect(mockConversionFindMany.mock.calls[0]?.[0]?.where).toMatchObject({
      status: 'PENDING',
      qualifies_at: { lte: NOW },
    });
  });

  it('qualifies a due conversion and writes neither paid_at nor commission_accrued', async () => {
    withCandidates(candidate());
    mockPaymentFindMany.mockResolvedValue([{ retailer_id: 'shop_1' }]);

    const summary = await handleReferralQualify({ now: NOW });

    expect(summary).toMatchObject({ scanned: 1, qualified: 1, clawed_back: 0, errors: 0 });
    const call = mockUpdateMany.mock.calls[0]?.[0];
    expect(call.data).toMatchObject({
      status: 'QUALIFIED',
      qualified_at: NOW,
      commission_base_amount: 999_900,
    });
    // The two fields T5 must never write. `paid_at` would violate the DB CHECK
    // (QUALIFIED requires it NULL) and `commission_accrued` belongs to T6.
    expect(call.data).not.toHaveProperty('paid_at');
    expect(call.data).not.toHaveProperty('commission_accrued');
    expect(call.data).not.toHaveProperty('clawed_back_at');
  });

  it('gates the transition on status still being PENDING', async () => {
    // The compare-and-swap. Without `status: 'PENDING'` here, two overlapping
    // runs both transition the row and the second overwrites the first.
    withCandidates(candidate());
    mockPaymentFindMany.mockResolvedValue([{ retailer_id: 'shop_1' }]);

    await handleReferralQualify({ now: NOW });

    expect(mockUpdateMany.mock.calls[0]?.[0]?.where).toEqual({
      id: 'rc_1',
      status: 'PENDING',
    });
  });

  it('reports a row another run already transitioned, and audits nothing for it', async () => {
    withCandidates(candidate());
    mockPaymentFindMany.mockResolvedValue([{ retailer_id: 'shop_1' }]);
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const summary = await handleReferralQualify({ now: NOW });

    expect(summary).toMatchObject({ scanned: 1, qualified: 0, raced: 1 });
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('claws back a deleted store with the reason recorded', async () => {
    withCandidates(
      candidate({
        referred: {
          id: 'shop_1',
          deleted_at: new Date('2026-09-10'),
          is_suspended: false,
          subscriptions: [{ status: 'ACTIVE', amount_inr: 999_900 }],
        },
      }),
    );

    const summary = await handleReferralQualify({ now: NOW });

    expect(summary.clawed_back).toBe(1);
    const call = mockUpdateMany.mock.calls[0]?.[0];
    expect(call.data).toEqual({ status: 'CLAWED_BACK', clawed_back_at: NOW });
    expect(mockAuditCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      action: 'REFERRAL_CLAWED_BACK',
      actor_type: 'system',
      metadata: { reason: 'REFERRED_DELETED' },
    });
  });

  it('never writes anything for a row that is not yet eligible', async () => {
    withCandidates(candidate());
    mockPaymentFindMany.mockResolvedValue([]);

    const summary = await handleReferralQualify({ now: NOW });

    expect(summary).toMatchObject({ scanned: 1, not_yet_eligible: 1 });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('isolates a failing row and still processes the rest of the batch', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    withCandidates(
      candidate({ id: 'rc_1', referred_id: 'shop_1' }),
      candidate({ id: 'rc_2', referred_id: 'shop_2' }),
    );
    mockPaymentFindMany.mockResolvedValue([{ retailer_id: 'shop_1' }, { retailer_id: 'shop_2' }]);
    // First row throws, second succeeds.
    mockUpdateMany.mockRejectedValueOnce(new Error('deadlock detected'));

    const summary = await handleReferralQualify({ now: NOW });

    expect(summary).toMatchObject({ scanned: 2, qualified: 1, errors: 1 });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('resolves paid status in one query for the whole batch', async () => {
    withCandidates(candidate({ id: 'rc_1', referred_id: 'shop_1' }), {
      ...candidate({ id: 'rc_2', referred_id: 'shop_2' }),
    });
    mockPaymentFindMany.mockResolvedValue([{ retailer_id: 'shop_1' }, { retailer_id: 'shop_2' }]);

    await handleReferralQualify({ now: NOW });

    // One grouped lookup, not one per candidate — the N+1 this shape avoids.
    expect(mockPaymentFindMany).toHaveBeenCalledTimes(1);
    expect(mockPaymentFindMany.mock.calls[0]?.[0]?.where).toMatchObject({
      retailer_id: { in: ['shop_1', 'shop_2'] },
      status: 'success',
    });
  });
});

describe('referral-qualify cron wiring', () => {
  /**
   * Comments stripped before scanning. The job's own header EXPLAINS why it never
   * reads `qualify_days`, so a raw text scan would fail on the documentation of
   * the rule it is checking — and the fix for that must not be to delete the
   * explanation.
   */
  const code = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const jobsIndex = readFileSync(join(REPO_ROOT, 'apps/api/src/jobs/index.ts'), 'utf8');
  const jobSource = code(
    readFileSync(join(REPO_ROOT, 'apps/api/src/jobs/referral-qualify.ts'), 'utf8'),
  );

  it('is registered in the maintenance worker switch', () => {
    // A job function that exists but is absent from this switch never runs and
    // never errors — the "wired but never registered" class from the social
    // composer (BUILD-LOG 2026-09-04), where two routes 404'd for a day.
    expect(jobsIndex).toMatch(/case 'referral-qualify':\s*\n\s*return handleReferralQualify\(\);/);
  });

  it('is scheduled on the maintenance queue', () => {
    expect(jobsIndex).toMatch(
      /getMaintenanceQueue\(\)\.add\(\s*\n\s*'referral-qualify',[\s\S]{0,200}?repeat: \{ pattern: '[^']+'/,
    );
  });

  it('never recomputes the qualify window from current settings', () => {
    // The window is stamped on the row at signup (T4) and only ENFORCED here.
    // Re-deriving it would make an admin's qualify_days edit retroactively move
    // a date the referrer was already told, and would put the day-count
    // arithmetic in two places.
    expect(jobSource).not.toMatch(/qualify_days/);
    expect(jobSource).not.toMatch(/loadReferralSettings/);
  });
});
