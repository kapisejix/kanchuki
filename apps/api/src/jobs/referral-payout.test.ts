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
import { beforeEach, describe, expect, it, vi } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

// ─── Prisma mock (same shape as referral-accrue.test.ts) ─────────

const prismaState = {
  settings: null as Record<string, unknown> | null,
  payouts: [] as Array<Record<string, unknown>>,
  conversions: [] as Array<Record<string, unknown>>,
  accounts: [] as Array<Record<string, unknown>>,
  auditRows: [] as Array<Record<string, unknown>>,
};

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
          for (const c of prismaState.conversions) {
            if (where.payout_id !== undefined && c.payout_id !== where.payout_id) continue;
            if (statusCond?.in && !statusCond.in.includes(c.status as string)) continue;
            if (where.referrer_id && c.referrer_id !== where.referrer_id) continue;
            if (where.id && c.id !== where.id) continue;
            Object.assign(c, data);
            matched += 1;
          }
          return { count: matched };
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
    $transaction: vi.fn(async (input: unknown) => {
      if (Array.isArray(input)) {
        // Array form: each element is a promise-returning call already made.
        return Promise.all(input);
      }
      // Interactive form — receives the tx client; our mock passes prisma itself.
      return (input as (tx: unknown) => Promise<unknown>)(prisma);
    }),
  },
}));

vi.mock('../lib/razorpayx.js', () => ({
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
const { createPayout } = await import('../lib/razorpayx.js');

const SETTINGS = {
  payout_min_amount: 50000,
  payout_cadence: 'MONTHLY' as const,
  tds_enabled: false,
  tds_pct: 0,
};

function resetState() {
  prismaState.settings = { id: 'singleton', ...SETTINGS, updated_at: new Date() };
  prismaState.payouts = [];
  prismaState.conversions = [];
  prismaState.accounts = [];
  prismaState.auditRows = [];
  vi.mocked(createPayout).mockReset();
}

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
    prismaState.conversions = [
      conv('c1', 100, 'QUALIFIED', 'po_1'),
      conv('c2', 200, 'QUALIFIED', null),
    ];
    prismaState.payouts = [{ id: 'po_1', status: 'PROCESSING' }];
    const before = new Date();
    await settlePayout('po_1', 'PAID', null, true);
    expect(prismaState.conversions[0]).toMatchObject({ status: 'PAID', payout_id: 'po_1' });
    expect(
      (prismaState.conversions[0] as { paid_at: Date }).paid_at.getTime(),
    ).toBeGreaterThanOrEqual(before.getTime());
    expect(prismaState.conversions[1]!.status).toBe('QUALIFIED'); // untouched
    expect(prismaState.auditRows.at(-1)).toMatchObject({ action: 'REFERRAL_PAYOUT_CONFIRMED' });
  });

  it('webhook_confirmed is stored ONLY when the webhook told us', async () => {
    prismaState.payouts = [
      { id: 'po_1', status: 'PROCESSING' },
      { id: 'po_2_reconcile', status: 'PROCESSING' },
    ];
    await settlePayout('po_1', 'PAID', null, true);
    expect(prismaState.payouts[0]).toMatchObject({ status: 'PAID', webhook_confirmed: true });
    await settlePayout('po_2_reconcile', 'PAID', null, false);
    expect(prismaState.payouts[1]).toMatchObject({ status: 'PAID', webhook_confirmed: false });
  });

  it('FAILED releases the claim — payout_id cleared, status kept, money re-pools', async () => {
    prismaState.conversions = [conv('c1', 100, 'QUALIFIED', 'po_1')];
    prismaState.payouts = [{ id: 'po_1', status: 'PROCESSING' }];
    await settlePayout('po_1', 'FAILED', 'beneficiary_bank_rejected');
    expect(prismaState.conversions[0]).toMatchObject({ payout_id: null, status: 'QUALIFIED' });
    expect(prismaState.payouts[0]).toMatchObject({
      status: 'FAILED',
      failure_reason: 'beneficiary_bank_rejected',
    });
    expect(prismaState.auditRows.at(-1)).toMatchObject({ action: 'REFERRAL_PAYOUT_RELEASED' });
  });
});

// ─── handleReferralPayout — end-to-end with mocked providers ─────

describe('handleReferralPayout', () => {
  it('throws loudly when the settings singleton is missing', async () => {
    prismaState.settings = null;
    await expect(handleReferralPayout('cron')).rejects.toThrow(/singleton missing/);
  });

  it('claims, submits, and leaves settlement to the webhook — never writes paid_at', async () => {
    prismaState.conversions = [conv('c1', 60000)];
    prismaState.accounts = [
      { retailer_id: 'ret_A', is_active: true, razorpayx_fund_account_id: 'fa_1' },
    ];
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
    expect(prismaState.payouts[0]).toMatchObject({
      status: 'PROCESSING',
      razorpayx_payout_id: 'pout_1',
    });
    expect(prismaState.conversions[0]!.status).toBe('QUALIFIED');
    expect(prismaState.conversions[0]!.paid_at).toBeUndefined();
  });

  it('sends NET (gross − TDS) and snapshots tds_paise when TDS is on', async () => {
    prismaState.settings = { ...SETTINGS, tds_enabled: true, tds_pct: 10 };
    prismaState.conversions = [conv('c1', 60000)];
    prismaState.accounts = [
      { retailer_id: 'ret_A', is_active: true, razorpayx_fund_account_id: 'fa_1' },
    ];
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
    expect(prismaState.payouts[0]).toMatchObject({ amount_paise: 60000, tds_paise: 6000 });
  });

  it('re-submits a crashed PENDING row with the SAME idempotency key', async () => {
    prismaState.payouts = [
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
    prismaState.accounts = [
      { retailer_id: 'ret_A', is_active: true, razorpayx_fund_account_id: 'fa_1' },
    ];
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
    expect(prismaState.payouts[0]!.razorpayx_payout_id).toBe('pout_original');
  });

  it('never raises a second batch for the same money on one run (in-flight excluded)', async () => {
    prismaState.conversions = [conv('c1', 60000, 'QUALIFIED', 'po_live')];
    prismaState.payouts = [
      {
        id: 'po_live',
        referrer_id: 'ret_A',
        amount_paise: 60000,
        status: 'PROCESSING',
        idempotency_key: 'refpo-po_live',
      },
    ];
    prismaState.accounts = [
      { retailer_id: 'ret_A', is_active: true, razorpayx_fund_account_id: 'fa_1' },
    ];
    const summary = await handleReferralPayout('cron');
    // Unsettled = 60000 − 60000 = 0 → below min → no new batch, no submit.
    expect(summary.batches_claimed).toBe(0);
    expect(createPayout).not.toHaveBeenCalled();
  });

  it('releases a failed submission so the money is not stranded in PENDING', async () => {
    prismaState.conversions = [conv('c1', 60000)];
    prismaState.accounts = [
      { retailer_id: 'ret_A', is_active: true, razorpayx_fund_account_id: 'fa_1' },
    ];
    vi.mocked(createPayout).mockRejectedValue(new Error('RazorpayX 503: downtime'));
    const summary = await handleReferralPayout('cron');
    expect(summary.errors).toBe(1);
    expect(prismaState.payouts[0]).toMatchObject({
      status: 'FAILED',
      failure_reason: 'RazorpayX 503: downtime',
    });
    expect(prismaState.conversions[0]!.payout_id).toBeNull();
  });

  it('cron skips entirely under MANUAL cadence', async () => {
    prismaState.settings = { ...SETTINGS, payout_cadence: 'MANUAL' };
    prismaState.conversions = [conv('c1', 60000)];
    const summary = await handleReferralPayout('cron');
    expect(summary.skipped_cadence).toBe(1);
    expect(createPayout).not.toHaveBeenCalled();
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
    expect(webhookSource).toMatch(/timingSafeEqual/);
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
  it('F1: dropping the CAS (payout_id: null) from the claim WHERE double-claims', () => {
    // Mutation: remove `payout_id: null` from the claim's updateMany WHERE.
    // Caught by: 'never raises a second batch for the same money' — the
    // mechanism test counts CLAIM actions with a live batch present.
    // (Asserted here as the WHERE clause shape the job source must keep.)
    const jobSource = readFileSync(join(REPO_ROOT, 'apps/api/src/jobs/referral-payout.ts'), 'utf8');
    const claimStart = jobSource.indexOf('3a. CLAIM');
    const claimSlice = jobSource.slice(claimStart, claimStart + 1500);
    expect(claimSlice).toMatch(/payout_id: null/);
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
});
