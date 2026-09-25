// T7 tests — referral payout job, settlement, webhook, and payout-account
// routes. Spec: docs/tasks/referral-program-retailer-affiliate.md §7 T7.
//
// House style (T5/T6): pure decision functions tested as branch tables, write
// payloads asserted with full-payload toEqual (any extra field turns red), CAS
// WHERE clauses asserted as MECHANISM not outcome, cron wiring asserted by
// source scan, and every new guard falsified separately (see the falsify
// describe block at the bottom — each documents the exact mutation applied).
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

// ─── Prisma mock (same shape as referral-accrue.test.ts) ─────────

type PayoutFixture = {
  settings: Record<string, unknown> | null;
  payouts: Array<Record<string, unknown>>;
  conversions: Array<Record<string, unknown>>;
  accounts: Array<Record<string, unknown>>;
  auditRows: Array<Record<string, unknown>>;
};

/**
 * A fresh, empty fixture. `settings` is left null here and filled in by
 * `resetState()`, because this function also runs at module init — before
 * `SETTINGS` below exists — purely to give the stand-in something to point at.
 */
function makeState(): PayoutFixture {
  return { settings: null, payouts: [], conversions: [], accounts: [], auditRows: [] };
}

// Swapped whole, never cleared in place — see `freshState()` for why that
// distinction is the entire fix (RC-039). The prisma stand-in below reads this
// variable at CALL time, which is correct for the stand-in and is exactly why a
// test must bind its own fixture instead of reaching for this name.
let prismaState: PayoutFixture = makeState();

vi.mock('@kanchuki/db', () => ({
  prisma: {
    referralSettings: {
      findUnique: vi.fn(async () => prismaState.settings),
    },
    referralPayout: {
      findUnique: vi.fn(
        async ({ where }: { where: { id?: string; razorpayx_payout_id?: string } }) =>
          prismaState.payouts.find(
            (p) =>
              (where.id && p.id === where.id) ||
              (where.razorpayx_payout_id && p.razorpayx_payout_id === where.razorpayx_payout_id),
          ),
      ),
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        let rows = prismaState.payouts;
        if (where) {
          for (const [key, cond] of Object.entries(where)) {
            if (cond && typeof cond === 'object' && 'in' in (cond as object)) {
              const list = (cond as { in: string[] }).in;
              rows = rows.filter((p) => list.includes(p[key] as string));
            } else if (cond === null) {
              rows = rows.filter((p) => p[key] == null);
            } else {
              rows = rows.filter((p) => p[key] === cond);
            }
          }
        }
        return rows;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: data.id ?? `po_${prismaState.payouts.length + 1}`, ...data };
        prismaState.payouts.push(row);
        return row;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = prismaState.payouts.find((p) => p.id === where.id);
          if (!row) throw new Error('payout row missing');
          Object.assign(row, data);
          return row;
        },
      ),
      aggregate: vi.fn(
        async ({ where }: { where: { referrer_id: string; status: { in: string[] } } }) => {
          const sum = prismaState.payouts
            .filter(
              (p) =>
                p.referrer_id === where.referrer_id &&
                (where.status.in as string[]).includes(p.status as string),
            )
            .reduce((acc, p) => acc + (p.amount_paise as number), 0);
          return { _sum: { amount_paise: sum } };
        },
      ),
    },
    referralConversion: {
      findUnique: vi.fn(),
      findMany: vi.fn(
        async ({
          where,
        }: { where?: { referrer_id?: string; status?: { in?: string[] } } } & Record<
          string,
          unknown
        >) => {
          let rows = prismaState.conversions;
          if (where?.referrer_id) rows = rows.filter((c) => c.referrer_id === where.referrer_id);
          if (where?.status?.in)
            rows = rows.filter((c) => where.status!.in!.includes(c.status as string));
          return rows;
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          let matched = 0;
          const statusCond = where.status as { in?: string[] } | undefined;
          const orConds = where.OR as Array<Record<string, unknown>> | undefined;
          for (const c of prismaState.conversions) {
            if (where.payout_id !== undefined && c.payout_id !== where.payout_id) continue;
            // The claim's OR: unattached, or attached to a PAID batch.
            if (
              orConds &&
              !(
                c.payout_id == null ||
                prismaState.payouts.some((p) => p.id === c.payout_id && p.status === 'PAID')
              )
            )
              continue;
            if (statusCond?.in && !statusCond.in.includes(c.status as string)) continue;
            if (where.referrer_id && c.referrer_id !== where.referrer_id) continue;
            if (where.id && c.id !== where.id) continue;
            Object.assign(c, data);
            matched += 1;
          }
          return { count: matched };
        },
      ),
      // Sums conversions by WHERE — the claim tx re-reads the ledger with
      // this under the per-referrer lock.
      aggregate: vi.fn(
        async ({
          where,
        }: {
          where?: { referrer_id?: string; status?: { in?: string[] } } & Record<string, unknown>;
        }) => {
          let rows = prismaState.conversions;
          if (where?.referrer_id) rows = rows.filter((c) => c.referrer_id === where.referrer_id);
          if (where?.status?.in)
            rows = rows.filter((c) => where.status!.in!.includes(c.status as string));
          return {
            _sum: {
              commission_accrued: rows.reduce(
                (acc, c) => acc + (c.commission_accrued as number),
                0,
              ),
            },
          };
        },
      ),
    },
    referralPayoutAccount: {
      findUnique: vi.fn(
        async ({ where }: { where: { retailer_id: string } }) =>
          prismaState.accounts.find((a) => a.retailer_id === where.retailer_id) ?? null,
      ),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        prismaState.auditRows.push(data);
        return data;
      }),
    },
    // The per-referrer advisory lock. Tests hook it to simulate a concurrent
    // run committing while this run waited on the lock.
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn(async (input: unknown) => {
      if (Array.isArray(input)) {
        // Array form: each element is a promise-returning call already made.
        return Promise.all(input);
      }
      // Interactive form — receives the tx client; our mock passes prisma
      // itself. A throw must ROLL BACK state the tx mutated (a real tx
      // would), so snapshot the mutable arrays and restore on failure —
      // without this, an EmptyClaimError test would see the loser's batch
      // row that a real Postgres transaction would have discarded.
      const beforePayouts = [...prismaState.payouts];
      const beforeConversions = prismaState.conversions.map((c) => ({ ...c }));
      try {
        return await (input as (tx: unknown) => Promise<unknown>)(prisma);
      } catch (error) {
        prismaState.payouts = beforePayouts;
        prismaState.conversions = beforeConversions;
        throw error;
      }
    }),
  },
}));

vi.mock('../lib/razorpayx.js', async (importOriginal) => ({
  RazorpayxHttpError: (await importOriginal<typeof import('../lib/razorpayx.js')>())
    .RazorpayxHttpError,
  createPayout: vi.fn(),
  fetchPayout: vi.fn(),
  createContact: vi.fn(),
  createBankFundAccount: vi.fn(),
  createVpaFundAccount: vi.fn(),
  deactivateFundAccount: vi.fn(),
}));

const { prisma } = await import('@kanchuki/db');
const {
  computeUnsettledPaise,
  decideReferrerBatch,
  splitTds,
  mapRazorpayxStatus,
  failureReasonFrom,
  PAYOUT_BODY_FIELDS,
  LEDGER_CONSUMING_STATUSES,
  handleReferralPayout,
} = await import('./referral-payout.js');
const { settlePayout } = await import('../lib/referral-payout-settle.js');
const { createPayout, RazorpayxHttpError } = await import('../lib/razorpayx.js');

const SETTINGS = {
  payout_min_amount: 50000,
  payout_cadence: 'MONTHLY' as const,
  tds_enabled: false,
  tds_pct: 0,
};

function resetState() {
  prismaState = {
    ...makeState(),
    settings: { id: 'singleton', ...SETTINGS, updated_at: new Date() },
  };
  vi.mocked(createPayout).mockReset();
}

/**
 * Bind THIS test's fixture and return it. **Must be the first statement of a
 * test that touches the fixture — before any `await`.**
 *
 * Why this exists (RC-039, found in the sibling `admin-referral-monitor` suite
 * and applied here because this file carried the same amplifier): vitest
 * abandoning a timed-out test does not cancel its promises. `build()`-style
 * setup resolved afterwards, the abandoned continuation ran its seeds, and —
 * with one shared fixture object that `beforeEach` merely cleared — those seeds
 * landed in the NEXT test's state. That test then asserted against numbers a
 * different test had put there, which reads as a job/payment bug and is not.
 *
 * Binding is only a fix because `resetState()` REPLACES the fixture object
 * instead of clearing the arrays inside it: a test that captured its own
 * object before its first await writes into its OWN (already retired) fixture,
 * which the next test cannot see, whatever the timing.
 *
 * `afterEach(retireState)` is the second half. Neither layer is sufficient
 * alone — freezing without ownership freezes arrays the next `beforeEach`
 * immediately replaces, which is precisely why the earlier attempt at this
 * (the freeze, shipped on its own and tested) did not stop the flake.
 */
function freshState(): PayoutFixture {
  resetState();
  return prismaState;
}

/**
 * Freeze the retired fixture so a test that TIMED OUT fails loudly instead of
 * poisoning its successor.
 *
 * Both the arrays AND the fixture object are frozen here, unlike the sibling
 * file where arrays alone suffice: these tests assign whole arrays
 * (`st.conversions = [...]`) as often as they push into them, and the prisma
 * stand-in's rollback path does the same (`prismaState.payouts = before…`).
 * Arrays-only would let a late reassignment through silently.
 */
function retireState() {
  Object.freeze(prismaState.payouts);
  Object.freeze(prismaState.conversions);
  Object.freeze(prismaState.accounts);
  Object.freeze(prismaState.auditRows);
  Object.freeze(prismaState);
}

afterEach(retireState);
beforeEach(resetState);

const conv = (
  id: string,
  accrued: number,
  status: 'QUALIFIED' | 'PAID' | 'PENDING' | 'CLAWED_BACK' = 'QUALIFIED',
  payout_id: string | null = null,
) => ({
  id,
  referrer_id: 'ret_A',
  status,
  commission_accrued: accrued,
  payout_id,
});

// ─── computeUnsettledPaise ───────────────────────────────────────

describe('computeUnsettledPaise', () => {
  it('sums accrued minus consumed', () => {
    expect(computeUnsettledPaise([conv('c1', 30000), conv('c2', 40000)], 20000)).toBe(50000);
  });
  it('excludes nothing from the accrual side — claim state lives in the payout sum', () => {
    // A conversion claimed by a live batch is subtracted via consumedPaise,
    // not filtered here — the job's aggregate does that.
    expect(computeUnsettledPaise([conv('c1', 30000, 'QUALIFIED', 'po_1')], 30000)).toBe(0);
  });
  it('failed/reversed batches are NOT in consumedPaise, so their claim auto-releases', () => {
    // 100000 accrued, one PAID batch of 50000 — the FAILED batch of 50000 is
    // excluded by LEDGER_CONSUMING_STATUSES upstream → 50000 unsettled.
    expect(computeUnsettledPaise([conv('c1', 100000)], 50000)).toBe(50000);
  });
  it('never goes negative (over-consumption clamps at 0)', () => {
    expect(computeUnsettledPaise([conv('c1', 10000)], 20000)).toBe(0);
  });
});

// ─── decideReferrerBatch ─────────────────────────────────────────

describe('decideReferrerBatch', () => {
  it('claims at exactly the threshold (>= min)', () => {
    const d = decideReferrerBatch({
      settings: SETTINGS,
      hasActiveAccount: true,
      unsettledPaise: 50000,
      isCron: true,
    });
    expect(d).toEqual({ action: 'CLAIM', gross_paise: 50000 });
  });
  it('skips below min', () => {
    expect(
      decideReferrerBatch({
        settings: SETTINGS,
        hasActiveAccount: true,
        unsettledPaise: 49999,
        isCron: true,
      }),
    ).toEqual({ action: 'SKIP_BELOW_MIN' });
  });
  it('skips without an active payout account', () => {
    expect(
      decideReferrerBatch({
        settings: SETTINGS,
        hasActiveAccount: false,
        unsettledPaise: 999999,
        isCron: true,
      }),
    ).toEqual({ action: 'SKIP_NO_ACCOUNT' });
  });
  it('cron respects MANUAL cadence', () => {
    expect(
      decideReferrerBatch({
        settings: { ...SETTINGS, payout_cadence: 'MANUAL' },
        hasActiveAccount: true,
        unsettledPaise: 999999,
        isCron: true,
      }),
    ).toEqual({ action: 'SKIP_CADENCE' });
  });
  it('manual trigger IGNORES cadence — admin can pay under MANUAL settings', () => {
    const d = decideReferrerBatch({
      settings: { ...SETTINGS, payout_cadence: 'MANUAL' },
      hasActiveAccount: true,
      unsettledPaise: 60000,
      isCron: false,
    });
    expect(d).toEqual({ action: 'CLAIM', gross_paise: 60000 });
  });
});

// ─── splitTds ────────────────────────────────────────────────────

describe('splitTds', () => {
  it('passes gross through when TDS is disabled', () => {
    expect(splitTds(100000, SETTINGS)).toEqual({ net_paise: 100000, tds_paise: 0 });
  });
  it('splits 10% when enabled', () => {
    expect(splitTds(100000, { ...SETTINGS, tds_enabled: true, tds_pct: 10 })).toEqual({
      net_paise: 90000,
      tds_paise: 10000,
    });
  });
  it('floors partial paise', () => {
    expect(splitTds(99999, { ...SETTINGS, tds_enabled: true, tds_pct: 10 }).tds_paise).toBe(9999);
  });
  it('never lets TDS swallow the batch — net stays ≥ 1 paise even at 100%', () => {
    const { net_paise, tds_paise } = splitTds(1000, {
      ...SETTINGS,
      tds_enabled: true,
      tds_pct: 100,
    });
    expect(net_paise).toBe(1);
    expect(tds_paise).toBe(999);
  });
});

// ─── mapRazorpayxStatus ──────────────────────────────────────────

describe('mapRazorpayxStatus', () => {
  it.each([
    ['queued', 'PROCESSING'],
    ['pending', 'PROCESSING'],
    ['initiated', 'PROCESSING'],
    ['processed', 'PAID'],
    ['rejected', 'FAILED'],
    ['canceled', 'FAILED'],
    ['failed', 'FAILED'],
    ['reversed', 'REVERSED'],
  ] as const)('%s → %s', (input, expected) => {
    expect(mapRazorpayxStatus(input)).toBe(expected);
  });
  it('returns null for an unrecognized status — never guesses with money', () => {
    expect(mapRazorpayxStatus('some_new_state' as never)).toBeNull();
  });
});

// ─── failureReasonFrom ───────────────────────────────────────────

describe('failureReasonFrom', () => {
  it('keeps the provider message bounded to 500 chars', () => {
    const long = 'x'.repeat(2000);
    expect(failureReasonFrom(new Error(long)).length).toBe(500);
  });
  it('sanitizes non-Error throws to a generic line', () => {
    expect(failureReasonFrom({ weird: true })).toBe('payout submission failed');
  });
});

// ─── settlePayout — the settlement mechanism ─────────────────────

describe('settlePayout', () => {
  it('PAID stamps paid_at ONLY on conversions still attached to this batch', async () => {
    const st = freshState();
    st.conversions = [conv('c1', 100, 'QUALIFIED', 'po_1'), conv('c2', 200, 'QUALIFIED', null)];
    st.payouts = [{ id: 'po_1', status: 'PROCESSING' }];
    const before = new Date();
    await settlePayout('po_1', 'PAID', null, true);
    expect(st.conversions[0]).toMatchObject({ status: 'PAID', payout_id: 'po_1' });
    expect((st.conversions[0] as { paid_at: Date }).paid_at.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
    expect(st.conversions[1]!.status).toBe('QUALIFIED'); // untouched
    expect(st.auditRows.at(-1)).toMatchObject({ action: 'REFERRAL_PAYOUT_CONFIRMED' });
  });

  it('webhook_confirmed is stored ONLY when the webhook told us', async () => {
    const st = freshState();
    st.payouts = [
      { id: 'po_1', status: 'PROCESSING' },
      { id: 'po_2_reconcile', status: 'PROCESSING' },
    ];
    await settlePayout('po_1', 'PAID', null, true);
    expect(st.payouts[0]).toMatchObject({ status: 'PAID', webhook_confirmed: true });
    await settlePayout('po_2_reconcile', 'PAID', null, false);
    expect(st.payouts[1]).toMatchObject({ status: 'PAID', webhook_confirmed: false });
  });

  it('FAILED releases the claim — payout_id cleared, status kept, money re-pools', async () => {
    const st = freshState();
    st.conversions = [conv('c1', 100, 'QUALIFIED', 'po_1')];
    st.payouts = [{ id: 'po_1', status: 'PROCESSING' }];
    await settlePayout('po_1', 'FAILED', 'beneficiary_bank_rejected');
    expect(st.conversions[0]).toMatchObject({ payout_id: null, status: 'QUALIFIED' });
    expect(st.payouts[0]).toMatchObject({
      status: 'FAILED',
      failure_reason: 'beneficiary_bank_rejected',
    });
    expect(st.auditRows.at(-1)).toMatchObject({ action: 'REFERRAL_PAYOUT_RELEASED' });
  });
});

// ─── handleReferralPayout — end-to-end with mocked providers ─────

describe('handleReferralPayout', () => {
  it('throws loudly when the settings singleton is missing', async () => {
    const st = freshState();
    st.settings = null;
    await expect(handleReferralPayout('cron')).rejects.toThrow(/singleton missing/);
  });

  it('claims, submits, and leaves settlement to the webhook — never writes paid_at', async () => {
    const st = freshState();
    st.conversions = [conv('c1', 60000)];
    st.accounts = [{ retailer_id: 'ret_A', is_active: true, razorpayx_fund_account_id: 'fa_1' }];
    vi.mocked(createPayout).mockResolvedValue({
      id: 'pout_1',
      status: 'initiated',
      amount: 60000,
      fees: 0,
      tax: 0,
      utr: null,
      reference_id: null,
    });
    const summary = await handleReferralPayout('cron');
    expect(summary.batches_claimed).toBe(1);
    expect(summary.batches_submitted).toBe(1);
    // Amount sent to RazorpayX is the GROSS (TDS off).
    expect(createPayout).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 60000, idempotencyKey: expect.stringMatching(/^refpo-/) }),
    );
    // The job must NOT have settled anything — status PROCESSING, no paid_at.
    expect(st.payouts[0]).toMatchObject({
      status: 'PROCESSING',
      razorpayx_payout_id: 'pout_1',
    });
    expect(st.conversions[0]!.status).toBe('QUALIFIED');
    expect(st.conversions[0]!.paid_at).toBeUndefined();
  });

  it('sends NET (gross − TDS) and snapshots tds_paise when TDS is on', async () => {
    const st = freshState();
    st.settings = { ...SETTINGS, tds_enabled: true, tds_pct: 10 };
    st.conversions = [conv('c1', 60000)];
    st.accounts = [{ retailer_id: 'ret_A', is_active: true, razorpayx_fund_account_id: 'fa_1' }];
    vi.mocked(createPayout).mockResolvedValue({
      id: 'pout_1',
      status: 'initiated',
      amount: 54000,
      fees: 0,
      tax: 0,
      utr: null,
      reference_id: null,
    });
    await handleReferralPayout('cron');
    expect(createPayout).toHaveBeenCalledWith(expect.objectContaining({ amount: 54000 }));
    expect(st.payouts[0]).toMatchObject({ amount_paise: 60000, tds_paise: 6000 });
  });

  it('re-submits a crashed PENDING row with the SAME idempotency key', async () => {
    const st = freshState();
    st.payouts = [
      {
        id: 'po_stuck',
        referrer_id: 'ret_A',
        amount_paise: 60000,
        tds_paise: 0,
        status: 'PENDING',
        idempotency_key: 'refpo-po_stuck',
        razorpayx_payout_id: null,
      },
    ];
    st.accounts = [{ retailer_id: 'ret_A', is_active: true, razorpayx_fund_account_id: 'fa_1' }];
    vi.mocked(createPayout).mockResolvedValue({
      id: 'pout_original',
      status: 'initiated',
      amount: 60000,
      fees: 0,
      tax: 0,
      utr: null,
      reference_id: null,
    });
    const summary = await handleReferralPayout('cron');
    expect(summary.re_submitted_crash_recovered).toBe(1);
    expect(createPayout).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'refpo-po_stuck' }),
    );
    expect(st.payouts[0]!.razorpayx_payout_id).toBe('pout_original');
  });

  it('never raises a second batch for the same money on one run (in-flight excluded)', async () => {
    const st = freshState();
    st.conversions = [conv('c1', 60000, 'QUALIFIED', 'po_live')];
    st.payouts = [
      {
        id: 'po_live',
        referrer_id: 'ret_A',
        amount_paise: 60000,
        status: 'PROCESSING',
        idempotency_key: 'refpo-po_live',
      },
    ];
    st.accounts = [{ retailer_id: 'ret_A', is_active: true, razorpayx_fund_account_id: 'fa_1' }];
    const summary = await handleReferralPayout('cron');
    // Unsettled = 60000 − 60000 = 0 → below min → no new batch, no submit.
    expect(summary.batches_claimed).toBe(0);
    expect(createPayout).not.toHaveBeenCalled();
  });

  it('releases a definitively rejected submission (4xx) so the money re-pools', async () => {
    const st = freshState();
    st.conversions = [conv('c1', 60000)];
    st.accounts = [{ retailer_id: 'ret_A', is_active: true, razorpayx_fund_account_id: 'fa_1' }];
    vi.mocked(createPayout).mockRejectedValue(new RazorpayxHttpError(400, 'bad fund account'));
    const summary = await handleReferralPayout('cron');
    expect(summary.errors).toBe(1);
    expect(st.payouts[0]).toMatchObject({
      status: 'FAILED',
      failure_reason: 'RazorpayX 400: bad fund account',
    });
    expect(st.conversions[0]!.payout_id).toBeNull();
  });

  it('keeps an ambiguous submission (5xx/timeout) PENDING — releasing would re-pay under a new key', async () => {
    const st = freshState();
    st.conversions = [conv('c1', 60000)];
    st.accounts = [{ retailer_id: 'ret_A', is_active: true, razorpayx_fund_account_id: 'fa_1' }];
    vi.mocked(createPayout).mockRejectedValueOnce(new RazorpayxHttpError(503, 'downtime'));
    const first = await handleReferralPayout('cron');
    expect(first.errors).toBe(1);
    const key = st.payouts[0]!.idempotency_key;
    expect(st.payouts[0]!.status).toBe('PENDING');
    expect(st.conversions[0]!.payout_id).toBe(st.payouts[0]!.id);

    // Next run re-submits the SAME row with the SAME key — no second batch.
    vi.mocked(createPayout).mockResolvedValue({
      id: 'pout_1',
      status: 'initiated',
      amount: 60000,
      fees: 0,
      tax: 0,
      utr: null,
      reference_id: null,
    });
    const second = await handleReferralPayout('cron');
    expect(second.re_submitted_crash_recovered).toBe(1);
    expect(second.batches_claimed).toBe(0);
    expect(st.payouts).toHaveLength(1);
    expect(createPayout).toHaveBeenLastCalledWith(expect.objectContaining({ idempotencyKey: key }));
  });

  it('pays again after a settled payout — later months re-attach from the PAID batch', async () => {
    const st = freshState();
    // Month 1 paid 60000 via po_old; the conversion kept accruing to 120000.
    st.conversions = [{ ...conv('c1', 120000, 'PAID', 'po_old'), paid_at: new Date() }];
    st.payouts = [
      {
        id: 'po_old',
        referrer_id: 'ret_A',
        amount_paise: 60000,
        tds_paise: 0,
        status: 'PAID',
        idempotency_key: 'refpo-old',
        razorpayx_payout_id: 'pout_old',
      },
    ];
    st.accounts = [{ retailer_id: 'ret_A', is_active: true, razorpayx_fund_account_id: 'fa_1' }];
    vi.mocked(createPayout).mockResolvedValue({
      id: 'pout_2',
      status: 'initiated',
      amount: 60000,
      fees: 0,
      tax: 0,
      utr: null,
      reference_id: null,
    });
    const summary = await handleReferralPayout('cron');
    expect(summary.batches_claimed).toBe(1);
    expect(summary.skipped_concurrent).toBe(0);
    expect(createPayout).toHaveBeenCalledWith(expect.objectContaining({ amount: 60000 }));
    const fresh = st.payouts.at(-1)!;
    expect(fresh.id).not.toBe('po_old');
    expect(st.conversions[0]!.payout_id).toBe(fresh.id);
  });

  it('cron skips entirely under MANUAL cadence', async () => {
    const st = freshState();
    st.settings = { ...SETTINGS, payout_cadence: 'MANUAL' };
    st.conversions = [conv('c1', 60000)];
    const summary = await handleReferralPayout('cron');
    expect(summary.skipped_cadence).toBe(1);
    expect(createPayout).not.toHaveBeenCalled();
  });

  // ── Claim race (RC-015 server half / RC-036): two overlapping runs both
  // pre-read unsettled. The per-referrer lock serializes the claim txs and the
  // ledger is re-read under it, so the second run sees the first's batch.
  // Simulated by committing a "winner" batch while this run waits on the lock.

  const winnerCommitsDuringLock = (st: PayoutFixture, amount: number) => {
    vi.mocked(prisma.$executeRaw).mockImplementationOnce((async () => {
      st.payouts.push({
        id: 'po_winner',
        referrer_id: 'ret_A',
        amount_paise: amount,
        tds_paise: 0,
        status: 'PENDING',
        idempotency_key: 'refpo-winner',
        razorpayx_payout_id: 'pout_w',
      });
      return 0;
    }) as never);
  };

  it('race: the loser re-reads under the lock, finds nothing left, and pays nothing', async () => {
    const st = freshState();
    st.conversions = [conv('c1', 60000)];
    st.accounts = [{ retailer_id: 'ret_A', is_active: true, razorpayx_fund_account_id: 'fa_1' }];
    winnerCommitsDuringLock(st, 60000);
    const summary = await handleReferralPayout('cron');
    expect(summary.skipped_concurrent).toBe(1);
    expect(summary.batches_claimed).toBe(0);
    expect(createPayout).not.toHaveBeenCalled();
    // The loser's batch row (if any) rolled back with the tx.
    expect(st.payouts.filter((p) => p.id !== 'po_winner')).toHaveLength(0);
  });

  it('race: a partial remainder is sized from the locked re-read, not the stale pre-read', async () => {
    const st = freshState();
    st.conversions = [conv('c1', 45000), conv('c2', 60000)];
    st.accounts = [{ retailer_id: 'ret_A', is_active: true, razorpayx_fund_account_id: 'fa_1' }];
    // Pre-read sees 105000; the winner commits 45000 while we wait -> 60000.
    winnerCommitsDuringLock(st, 45000);
    vi.mocked(createPayout).mockResolvedValue({
      id: 'pout_p',
      status: 'initiated',
      amount: 60000,
      fees: 0,
      tax: 0,
      utr: null,
      reference_id: null,
    });
    const summary = await handleReferralPayout('cron');
    expect(summary.batches_claimed).toBe(1);
    expect(createPayout).toHaveBeenCalledWith(expect.objectContaining({ amount: 60000 }));
    // The STORED row carries the same figure — ledger and payment agree.
    expect(st.payouts.at(-1)).toMatchObject({ amount_paise: 60000 });
  });
});

// ─── Source-scan guards (RC-025 / RC-027 class) ──────────────────

describe('T7 source-scan guards', () => {
  // LINE comments FIRST, then block comments — the reverse order breaks on a
  // `/*` sequence INSIDE a line comment (the webhook header has `/v1/public/*;`),
  // which eats the following code and vacates the scan.
  const code = (source: string) =>
    source.replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');

  const jobsIndex = readFileSync(join(REPO_ROOT, 'apps/api/src/jobs/index.ts'), 'utf8');
  const jobSource = code(
    readFileSync(join(REPO_ROOT, 'apps/api/src/jobs/referral-payout.ts'), 'utf8'),
  );
  const settleSource = code(
    readFileSync(join(REPO_ROOT, 'apps/api/src/lib/referral-payout-settle.ts'), 'utf8'),
  );
  const apiIndex = readFileSync(join(REPO_ROOT, 'apps/api/src/index.ts'), 'utf8');
  const webhookSource = code(
    readFileSync(join(REPO_ROOT, 'apps/api/src/routes/webhooks/razorpayx-payout.ts'), 'utf8'),
  );

  it('cron is monthly on the 30th (owner decision 2026-09-23), NOT daily', () => {
    expect(jobsIndex).toMatch(/'referral-payout',[\s\S]{0,200}?pattern: '30 2 30 \* \*'/);
    expect(jobsIndex).not.toMatch(/'referral-payout',[\s\S]{0,200}?pattern: '30 2 \* \* \*'/);
  });

  it('is registered in the maintenance worker switch', () => {
    expect(jobsIndex).toMatch(
      /case 'referral-payout':\s*\n\s*return handleReferralPayout\('cron'\);/,
    );
  });

  it('settlePayout is IMPORTED by the job, not redefined — one settlement path', () => {
    expect(jobSource).toMatch(
      /import \{ settlePayout \} from '\.\.\/lib\/referral-payout-settle\.js';/,
    );
    expect(jobSource).not.toMatch(/async function settlePayout/);
    expect(settleSource).toMatch(/export async function settlePayout/);
  });

  it("paid_at has exactly ONE writer — settlePayout's CAS updateMany", () => {
    // payout + qualify jobs must not touch paid_at AT ALL.
    for (const file of ['referral-payout.ts', 'referral-qualify.ts']) {
      const src = code(readFileSync(join(REPO_ROOT, `apps/api/src/jobs/${file}`), 'utf8'));
      expect(src).not.toMatch(/paid_at:/);
    }
    // accrue legitimately READS paid_at exactly once (T6's SubscriptionPayment
    // select — the store's charge date); anything beyond that read is a bug.
    const accrueSrc = code(
      readFileSync(join(REPO_ROOT, 'apps/api/src/jobs/referral-accrue.ts'), 'utf8'),
    );
    expect(accrueSrc.match(/paid_at:/g)).toHaveLength(1);
    expect(accrueSrc).toMatch(/select: \{[^}]*paid_at: true/);
    // settle is the ONLY write site.
    expect(settleSource.match(/paid_at: new Date\(\)/g)).toHaveLength(1);
  });

  it('the webhook is registered with the /v1 prefix in the API index', () => {
    expect(apiIndex).toMatch(/razorpayxPayoutWebhookRoutes/);
    expect(apiIndex).toMatch(/register\(razorpayxPayoutWebhookRoutes, \{ prefix: '\/v1' \}\)/);
  });

  it('the webhook verifies the X secret and has a replay window', () => {
    expect(webhookSource).toMatch(/RAZORPAYX_WEBHOOK_SECRET/);
    expect(webhookSource).toMatch(/WEBHOOK_MAX_AGE_SECONDS = 300/);
    expect(webhookSource).toMatch(/hexEquals\(expected, signature\)/);
    // Fastify hooks are plugin-scoped: without its own preParsing hook the
    // route never sees rawBody and 401s every delivery.
    expect(webhookSource).toMatch(/addHook\('preParsing', captureRawBody\)/);
  });

  it('the payout body derives from PAYOUT_BODY_FIELDS only — retry idempotency', () => {
    // The body literal inside createPayout may only reference these values.
    const libSource = code(readFileSync(join(REPO_ROOT, 'apps/api/src/lib/razorpayx.ts'), 'utf8'));
    const bodyStart = libSource.indexOf('export async function createPayout');
    const bodySlice = libSource.slice(bodyStart, bodyStart + 2200);
    expect(bodySlice).toMatch(/account_number: accountNumber/);
    expect(bodySlice).not.toMatch(/Date\.now|Math\.random|new Date\(/);
  });

  it('LEDGER_CONSUMING_STATUSES excludes FAILED and REVERSED', () => {
    expect(LEDGER_CONSUMING_STATUSES).not.toContain('FAILED');
    expect(LEDGER_CONSUMING_STATUSES).not.toContain('REVERSED');
    expect([...LEDGER_CONSUMING_STATUSES].sort()).toEqual(['PAID', 'PENDING', 'PROCESSING']);
  });
});

// ─── Falsification block ─────────────────────────────────────────
// Each test re-states a mutation applied to the code during development and
// asserts the guard that caught it. If the mutation passed silently, the
// guard was vacuous. See docs/root-cause/root-cause issues.md for the method.

describe('falsification record', () => {
  it('F1: the claim must lock per referrer and size the batch from the locked re-read', () => {
    // Mutation: drop the advisory lock, or size the batch from the pre-read.
    // Caught by: the two race mechanism tests above (they hook the lock).
    // Window runs to the 3b marker so it tracks the claim block as it evolves.
    const jobSource = readFileSync(join(REPO_ROOT, 'apps/api/src/jobs/referral-payout.ts'), 'utf8');
    const claimStart = jobSource.indexOf('3a. CLAIM');
    const claimEnd = jobSource.indexOf('3b. SUBMIT');
    expect(claimEnd).toBeGreaterThan(claimStart);
    const claimSlice = jobSource.slice(claimStart, claimEnd);
    expect(claimSlice).toMatch(/pg_advisory_xact_lock/);
    expect(claimSlice).toMatch(/amount_paise: lockedGross/);
    // An empty locked re-read aborts instead of paying.
    expect(claimSlice).toMatch(/EmptyClaimError/);
  });

  it('F2: settling at submit time (instead of webhook) would write paid_at — the source scan forbids it', () => {
    // Mutation: call settlePayout(row.id, 'PAID', ...) inside submitPayoutRow
    // right after create. Caught by: the paid_at single-writer scan (the job
    // source would then need a paid_at write or a PAID settle on create).
    const jobSource = readFileSync(join(REPO_ROOT, 'apps/api/src/jobs/referral-payout.ts'), 'utf8');
    const code = jobSource.replace(/\/[\*][\s\S]*?[\*]\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    // The submit path maps processed → settle, but only via the remote entity
    // actually saying 'processed' — a blind settle-on-submit would call
    // settlePayout unconditionally after createPayout. The scan: settle calls
    // in submitPayoutRow must be guarded by mapped === 'PAID' etc.
    const submitStart = code.indexOf('async function submitPayoutRow');
    const submitSlice = code.slice(submitStart, code.indexOf('/**', submitStart));
    expect(submitSlice).toMatch(/mapped === 'PAID'/);
  });

  it('F3: a regenerated idempotency key per retry would double-pay — key must be stored', () => {
    const jobSource = readFileSync(join(REPO_ROOT, 'apps/api/src/jobs/referral-payout.ts'), 'utf8');
    // Key is created ONCE inside the claim transaction (created before the
    // insert, stored on the row) — never re-derived at submit time from the
    // clock or a fresh random source.
    expect(jobSource).toMatch(/idempotency_key: claimKey/);
    expect(jobSource).toMatch(/claimKey = `refpo-\$\{randomBytes/);
    expect(jobSource).not.toMatch(/idempotencyKey: `refpo-\$\{Date/);
    expect(jobSource).not.toMatch(/idempotencyKey: `refpo-\$\{random/);
  });

  it('F4: releasing FAILED claims would strand money if LEDGER_CONSUMING_STATUSES included FAILED', () => {
    // Mutation: add 'FAILED' to LEDGER_CONSUMING_STATUSES. Caught by the
    // statuses scan + computeUnsettledPaise's release test.
    expect(LEDGER_CONSUMING_STATUSES).not.toContain('FAILED');
    expect(LEDGER_CONSUMING_STATUSES).not.toContain('REVERSED');
  });

  it('F5: a shared webhook secret with payments would break independent rotation', () => {
    const webhookSource = readFileSync(
      join(REPO_ROOT, 'apps/api/src/routes/webhooks/razorpayx-payout.ts'),
      'utf8',
    );
    // The secret NAME in the getSecret call is what counts — the header
    // MENTIONS the payments secret to explain why they differ.
    expect(webhookSource).toMatch(/getSecret\('RAZORPAYX_WEBHOOK_SECRET'\)/);
    expect(webhookSource).not.toMatch(/getSecret\('RAZORPAY_WEBHOOK_SECRET'\)/);
  });

  it('F6: mapRazorpayxStatus defaulting to FAILED (instead of null) would strand real payouts', () => {
    // Mutation: replace `default: return null` with `default: return 'FAILED'`.
    // Caught by: 'returns null for an unrecognized status' — an unknown state
    // must never decide money.
    expect(mapRazorpayxStatus('brand_new_status' as never)).toBeNull();
  });

  it('F7: PAYOUT_BODY_FIELDS pins the retry-contract — a drifted body breaks RazorpayX idempotency', () => {
    expect(PAYOUT_BODY_FIELDS).toEqual([
      'fund_account_id',
      'amount',
      'idempotency_key',
      'reference_id',
      'narration',
    ]);
  });

  it("F8: a late write lands in the ABANDONED test's fixture and throws — it cannot poison the next test", () => {
    // The poison this prevents (RC-039, the shape the admin referral-monitor
    // suite hit for real): vitest abandoning a timed-out test does not cancel
    // its promises, so the abandoned continuation runs its seeds afterwards.
    // With ONE shared fixture object that `beforeEach` merely cleared, those
    // seeds land in the NEXT test's state, which then asserts against numbers a
    // different test put there.
    //
    // Both halves are asserted, and each is falsifiable on its own:
    //   1. OWNERSHIP — revert `resetState` to clearing the arrays in place and
    //      `abandoned` and `next` are the SAME object, so `not.toBe` fails.
    //   2. RETIRING — delete `afterEach(retireState)` and the `toThrow`s fail:
    //      the writes succeed silently into a dead fixture.
    // Neither alone is sufficient, which is why the freeze shipped first on the
    // sibling file and did not stop the flake (it froze arrays the next
    // `beforeEach` immediately replaces).
    const abandoned = freshState();
    retireState(); // what `afterEach` does the moment the abandoned test ends
    const next = freshState();

    expect(abandoned.payouts).not.toBe(next.payouts);

    expect(() =>
      abandoned.payouts.push({ id: 'leaked', referrer_id: 'ret_A', amount_paise: 60000 }),
    ).toThrow(/not extensible|read.only|cannot add/i);

    // The REASSIGNMENT shape matters as much as the push in this file: these
    // tests assign whole arrays (`st.conversions = [...]`) as often as they
    // mutate them, and the stand-in's rollback does the same. Arrays-only
    // freezing is what would let this one through.
    expect(() => {
      abandoned.conversions = [];
    }).toThrow(/read.only|cannot assign|not extensible/i);

    // What the two assertions above buy: the next test starts clean.
    expect(next.payouts).toHaveLength(0);
  });

  // F9 is a PAIR, ordered on purpose: 9a captures its fixture, 9b reads it after
  // 9a has ended — the only vantage point from which the HOOK is observable,
  // since F8 calls `retireState()` itself and so can never see whether it is
  // registered. Vitest runs tests in declaration order within a file.
  let captured: PayoutFixture | undefined;

  it('F9a: captures its own fixture, unfrozen while the test runs (read by F9b)', () => {
    captured = freshState();
    // A fixture frozen mid-test would make every seed throw, so assert the
    // other direction too.
    expect(Object.isFrozen(captured.payouts)).toBe(false);
  });

  it("F9b: afterEach froze the previous test's fixture — the hook is wired", () => {
    // Falsified by deleting the `afterEach(retireState)` registration: this goes
    // red (`expected false to be true`) while F8 stays green — measured on the
    // sibling file, where that deletion left the whole suite passing.
    expect(captured).toBeDefined();
    expect(Object.isFrozen(captured?.payouts)).toBe(true);
    expect(Object.isFrozen(captured)).toBe(true);
  });

  it('F10: no test body writes the module-level fixture directly (ownership is the rule)', () => {
    // F8 proves the mechanism works; this keeps every test using it. A new test
    // that reaches for the module-level name instead of its own `st` re-opens
    // the leak for its own abandoned-continuation case, and nothing else in
    // this file would notice.
    //
    // Three scoping decisions, all load-bearing:
    //   • comments are stripped first, because the prose above quotes the
    //     offending shape;
    //   • the scan starts at the first `describe(`, so the prisma stand-in —
    //     which MUST read whatever fixture is current — is out of scope rather
    //     than special-cased inside;
    //   • the file is located via `import.meta.url`, never a literal filename. A
    //     literal scans some OTHER file the moment this one is copied or renamed,
    //     which is exactly how the sibling file's scan was found green while a
    //     mutant sat in the file it was supposed to be reading.
    const raw = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const bodies = raw
      .slice(raw.indexOf("describe('computeUnsettledPaise'"))
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const bareUses = [
      ...bodies.matchAll(/\bprismaState\.(payouts|conversions|accounts|auditRows|settings)/g),
    ].map((m) => m[0]);
    expect(bareUses).toEqual([]);
  });
});
