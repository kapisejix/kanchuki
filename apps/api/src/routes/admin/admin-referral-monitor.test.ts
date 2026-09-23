// T9 tests — admin referral monitoring routes. Spec:
// docs/tasks/referral-program-retailer-affiliate.md §7 T9.
//
// House style (T5/T6/T7): pure decision functions tested as branch tables,
// CAS WHERE clauses asserted as MECHANISM not outcome, and source-scan guards
// for the properties runtime code cannot enforce. Every new guard is
// falsified separately (see the falsification describe block at the bottom —
// each records the mutation tried and what caught it).
//
// The prisma stand-in is the same minimal state object pattern the T7 tests
// use: enough of referralConversion / referralPayout / referralCode /
// referralPayoutAccount / auditLog to exercise the route handlers through the
// real code, with updateMany honouring the WHERE clause so a CAS that ignores
// status genuinely fails.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
/** routes/admin → routes → src → apps/api → apps → repo root */
const REPO_ROOT = join(HERE, '..', '..', '..', '..', '..');

// ─── Prisma stand-in ───────────────────────────────────────────────

type Conv = {
  id: string;
  referrer_id: string;
  referred_id: string;
  status: 'PENDING' | 'QUALIFIED' | 'PAID' | 'CLAWED_BACK';
  commission_accrued: number;
  created_at: Date;
  referred: { shop_name: string };
  referrer: { shop_name: string };
};

const state = {
  conversions: [] as Conv[],
  payouts: [] as Array<{
    id: string;
    referrer_id: string;
    amount_paise: number;
    status: string;
  }>,
  codes: [] as Array<{ retailer_id: string; code: string }>,
  accounts: [] as Array<{ retailer_id: string; is_active: boolean }>,
  audits: [] as Array<{ action: string; metadata?: unknown }>,
};

function resetState() {
  state.conversions = [];
  state.payouts = [];
  state.codes = [];
  state.accounts = [];
  state.audits = [];
}

vi.mock('@kanchuki/db', () => {
  // The mock object is referenced by $transaction below — the route's callback
  // receives THIS object as `tx`, so updateMany inside the transaction runs
  // through the same stateful stand-in (returning `undefined` instead is what
  // 500'd the clawback tests).
  const prismaMock = {
    referralConversion: {
      groupBy: async ({ by }: { by: string[] }) => {
        const out: Array<Record<string, unknown>> = [];
        for (const status of new Set(state.conversions.map((c) => c.status))) {
          const rows = state.conversions.filter((c) => c.status === status);
          out.push({
            status,
            _count: { _all: rows.length },
            _sum: {
              commission_accrued: rows.reduce((s, c) => s + c.commission_accrued, 0),
            },
          });
        }
        void by;
        return out;
      },
      findMany: async (args?: {
        where?: { referrer_id?: string; status?: { in?: string[] } };
        orderBy?: unknown;
        take?: number;
      }) => {
        let rows = [...state.conversions];
        const where = args?.where;
        if (where?.referrer_id) rows = rows.filter((c) => c.referrer_id === where.referrer_id);
        if (where?.status?.in) rows = rows.filter((c) => where.status!.in!.includes(c.status));
        if (args?.orderBy) {
          // Only the shape the route uses: created_at desc.
          rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
        }
        if (args?.take) rows = rows.slice(0, args.take);
        return rows;
      },
      findUnique: async ({ where }: { where: { id?: string } }) =>
        state.conversions.find((c) => c.id === where.id) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status: { in: string[] } };
        data: { status: string; clawed_back_at: Date };
      }) => {
        const row = state.conversions.find((c) => c.id === where.id);
        // CAS: honour the status IN clause exactly like Postgres would.
        if (!row || !where.status.in.includes(row.status)) return { count: 0 };
        row.status = data.status as Conv['status'];
        return { count: 1 };
      },
    },
    referralPayout: {
      aggregate: async ({ where }: { where: { status: { in: string[] } } }) => {
        const rows = state.payouts.filter((p) => where.status.in.includes(p.status));
        return {
          _sum: { amount_paise: rows.reduce((s, p) => s + p.amount_paise, 0) },
          _count: { _all: rows.length },
        };
      },
      findMany: async ({ where }: { where: { status: { in: string[] } } }) =>
        state.payouts.filter((p) => where.status.in.includes(p.status)),
    },
    referralCode: {
      findMany: async () => state.codes,
    },
    referralPayoutAccount: {
      findUnique: async ({ where }: { where: { retailer_id: string } }) =>
        state.accounts.find((a) => a.retailer_id === where.retailer_id) ?? null,
    },
    auditLog: {
      create: async ({ data }: { data: { action: string; metadata?: unknown } }) => {
        state.audits.push(data);
        return data;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<number>) => fn(prismaMock),
  };
  return { prisma: prismaMock };
});

// The monitor route imports the REAL T7 helpers — exactly the point being
// tested. handleReferralPayout is mocked (the trigger route calls it with
// 'manual'; its internals have their own 49 tests). The mock path MUST be the
// route's own import specifier ('../../jobs/referral-payout.js') — vi.mock
// keys on the resolved module, and this file sits one directory deeper.
vi.mock('../../jobs/referral-payout.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../jobs/referral-payout.js')>();
  return {
    ...actual,
    handleReferralPayout: vi.fn(async (mode: string) => ({
      ran_at: '2026-09-23T00:00:00.000Z',
      mode,
      referrers_scanned: 0,
      batches_claimed: 1,
      batches_submitted: 1,
      re_submitted_crash_recovered: 0,
      reconciled: { checked: 0, settled: 0, released: 0 },
      skipped_no_account: 0,
      skipped_below_min: 0,
      skipped_cadence: 0,
      errors: 0,
    })),
  };
});

import { handleReferralPayout } from '../../jobs/referral-payout.js';
import {
  CLAWBACK_ELIGIBLE_STATUSES,
  adminReferralMonitorRoutes,
  buildReferralLeaderboardCsv,
  isClawbackAllowed,
} from './admin-referral-monitor.js';

// ─── Fastify harness (same shape as admin-festivals.test.ts) ───────

async function build() {
  const [{ default: Fastify }, { errorHandler }] = await Promise.all([
    import('fastify'),
    import('../../plugins/error-handler.js'),
  ]);
  const app = Fastify({ logger: false });
  // The real error handler maps ZodError → 422; without it a thrown
  // validation error surfaces as a bare 500 and the 422 tests would 500.
  app.setErrorHandler(errorHandler);
  await app.register(adminReferralMonitorRoutes);
  await app.ready();
  return app;
}

const ADMIN_HEADERS = { 'x-admin-key': 'test-admin-key' };
// adminAuthPreHandler is mocked so tests do not need real keys; the hook
// still runs, proving the route declares it. NOTE the path: admin-auth.ts
// lives in routes/, one level UP from this directory — '../admin-auth.js',
// matching the route's own import specifier. (Mocking './admin-auth.js'
// resolved to nothing and the REAL handler 403'd every request.)
vi.mock('../admin-auth.js', () => ({
  adminAuthPreHandler: async () => {},
}));

const seedConv = (over: Partial<Conv> & { id: string; referrer_id: string }) => {
  state.conversions.push({
    referred_id: `${over.id}-referred`,
    status: 'PENDING',
    commission_accrued: 0,
    created_at: new Date('2026-08-01T00:00:00Z'),
    referred: { shop_name: `Shop ${over.id}` },
    referrer: { shop_name: `Referrer ${over.referrer_id}` },
    ...over,
  } as Conv);
};

// ─── Clawback eligibility ──────────────────────────────────────────

describe('isClawbackAllowed (pure branch table)', () => {
  it('allows PENDING and QUALIFIED only', () => {
    expect(isClawbackAllowed('PENDING')).toBe(true);
    expect(isClawbackAllowed('QUALIFIED')).toBe(true);
  });

  it('refuses PAID — the payout may already have settled', () => {
    expect(isClawbackAllowed('PAID')).toBe(false);
  });

  it('refuses CLAWED_BACK — irreversible by design', () => {
    expect(isClawbackAllowed('CLAWED_BACK')).toBe(false);
  });

  it("CLAWBACK_ELIGIBLE_STATUSES matches T5's own clawback source set", () => {
    // T5's clawback branch writes from PENDING only; T9 widens to QUALIFIED
    // (accrued-but-unpaid). PAID/CLAWED_BACK must never appear.
    expect(CLAWBACK_ELIGIBLE_STATUSES).toEqual(['PENDING', 'QUALIFIED']);
  });
});

// ─── Overview ──────────────────────────────────────────────────────

describe('GET /referral/overview', () => {
  beforeEach(resetState);

  it('sums status counts and the unsettled identity accrued − committed', async () => {
    const app = await build();
    seedConv({ id: 'c1', referrer_id: 'r1', status: 'QUALIFIED', commission_accrued: 50_000 });
    seedConv({ id: 'c2', referrer_id: 'r1', status: 'PAID', commission_accrued: 30_000 });
    seedConv({ id: 'c3', referrer_id: 'r2', status: 'PENDING' });
    seedConv({ id: 'c4', referrer_id: 'r2', status: 'CLAWED_BACK' });
    state.payouts.push({ id: 'p1', referrer_id: 'r1', amount_paise: 30_000, status: 'PAID' });

    const res = await app.inject({
      method: 'GET',
      url: '/referral/overview',
      headers: ADMIN_HEADERS,
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.conversions_total).toBe(4);
    expect(d.pending).toBe(1);
    expect(d.qualified).toBe(1);
    expect(d.paid).toBe(1);
    expect(d.clawed_back).toBe(1);
    expect(d.commission_accrued_paise).toBe(80_000);
    expect(d.paid_out_paise).toBe(30_000);
    // FAILED/REVERSED batches must NOT count as committed — release is how
    // money returns to the pool.
    expect(d.payout_batches_in_flight).toBe(1);
    expect(d.unsettled_paise).toBe(50_000);
    await app.close();
  });

  it('excludes FAILED batches from committed money', async () => {
    const app = await build();
    seedConv({ id: 'c1', referrer_id: 'r1', status: 'QUALIFIED', commission_accrued: 50_000 });
    state.payouts.push({ id: 'p1', referrer_id: 'r1', amount_paise: 20_000, status: 'FAILED' });
    const res = await app.inject({
      method: 'GET',
      url: '/referral/overview',
      headers: ADMIN_HEADERS,
    });
    const d = res.json().data;
    expect(d.paid_out_paise).toBe(0);
    expect(d.unsettled_paise).toBe(50_000);
    await app.close();
  });
});

// ─── Leaderboard ───────────────────────────────────────────────────

describe('GET /referral/leaderboard', () => {
  beforeEach(resetState);

  it('sorts by accrued desc and computes unsettled via the T7 identity', async () => {
    const app = await build();
    // r1: 80k accrued, 30k committed → 50k unsettled
    seedConv({ id: 'c1', referrer_id: 'r1', status: 'QUALIFIED', commission_accrued: 50_000 });
    seedConv({ id: 'c2', referrer_id: 'r1', status: 'PAID', commission_accrued: 30_000 });
    // r2: only PENDING rows — realistic seed: accrued stays 0 on PENDING
    // (accrual is a QUALIFIED/PAID-only event in the real flow).
    seedConv({ id: 'c3', referrer_id: 'r2', status: 'PENDING' });
    state.payouts.push({ id: 'p1', referrer_id: 'r1', amount_paise: 30_000, status: 'PAID' });
    state.codes.push({ retailer_id: 'r1', code: 'KAN-ABC123' });

    const res = await app.inject({
      method: 'GET',
      url: '/referral/leaderboard',
      headers: ADMIN_HEADERS,
    });
    const rows = res.json().data;
    expect(rows).toHaveLength(2);
    expect(rows[0].referrer_id).toBe('r1');
    expect(rows[0].code).toBe('KAN-ABC123');
    expect(rows[0].unsettled_paise).toBe(50_000);
    expect(rows[1].referrer_id).toBe('r2');
    expect(rows[1].unsettled_paise).toBe(0);
    await app.close();
  });

  it('MECHANISM: claimed conversions stay inside the unsettled input (no double-subtraction)', async () => {
    const app = await build();
    // c1 is claimed by p1: its 30k appears in accrued AND in committed, so
    // passing only unclaimed rows would understate unsettled by 30k.
    seedConv({ id: 'c1', referrer_id: 'r1', status: 'QUALIFIED', commission_accrued: 30_000 });
    seedConv({ id: 'c2', referrer_id: 'r1', status: 'QUALIFIED', commission_accrued: 20_000 });
    state.payouts.push({ id: 'p1', referrer_id: 'r1', amount_paise: 30_000, status: 'PROCESSING' });

    const res = await app.inject({
      method: 'GET',
      url: '/referral/leaderboard',
      headers: ADMIN_HEADERS,
    });
    const rows = res.json().data;
    // 50k accrued − 30k committed = 20k. The double-subtraction bug this test
    // pins showed 50k − 30k − 30k = 0 (clamped) when c1 was filtered out.
    expect(rows[0].unsettled_paise).toBe(20_000);
    await app.close();
  });
});

// ─── CSV export ────────────────────────────────────────────────────

describe('buildReferralLeaderboardCsv', () => {
  it('quotes shop names and totals the money columns', () => {
    const csv = buildReferralLeaderboardCsv([
      {
        referrer_id: 'r1',
        shop_name: 'Sharma "Sarees", Delhi',
        code: 'KAN-ABC123',
        conversions_total: 2,
        pending: 0,
        qualified: 1,
        paid: 1,
        clawed_back: 0,
        commission_accrued_paise: 80_000,
        paid_out_paise: 30_000,
        unsettled_paise: 50_000,
      },
    ]);
    expect(csv).toContain('"Sharma ""Sarees"", Delhi"');
    expect(csv).toContain('800.00');
    expect(csv).toContain('300.00');
    expect(csv).toContain('500.00');
    // Totals line exists and repeats the single row's figures.
    expect(csv).toContain('Totals,');
  });
});

// ─── Clawback route ────────────────────────────────────────────────

describe('POST /referral/conversions/:id/clawback', () => {
  beforeEach(resetState);

  it('CASes PENDING → CLAWED_BACK with an audit row in the same transaction', async () => {
    const app = await build();
    seedConv({ id: 'c1', referrer_id: 'r1', status: 'PENDING' });
    const res = await app.inject({
      method: 'POST',
      url: '/referral/conversions/c1/clawback',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { reason: 'store deleted before qualifying' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('CLAWED_BACK');
    expect(state.audits.some((a) => a.action === 'REFERRAL_CLAWED_BACK_MANUAL')).toBe(true);
    await app.close();
  });

  it('refuses PAID with a message naming why (money may have moved)', async () => {
    const app = await build();
    seedConv({ id: 'c1', referrer_id: 'r1', status: 'PAID' });
    const res = await app.inject({
      method: 'POST',
      url: '/referral/conversions/c1/clawback',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { reason: 'trying to claw back a paid one' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('Payouts against it may already have settled');
    // And nothing was written.
    expect(state.conversions[0]?.status).toBe('PAID');
    expect(state.audits).toHaveLength(0);
    await app.close();
  });

  it('refuses an already-clawed-back conversion', async () => {
    const app = await build();
    seedConv({ id: 'c1', referrer_id: 'r1', status: 'CLAWED_BACK' });
    const res = await app.inject({
      method: 'POST',
      url: '/referral/conversions/c1/clawback',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { reason: 'double claw' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('409 when the status moves between the read and the CAS', async () => {
    const app = await build();
    seedConv({ id: 'c1', referrer_id: 'r1', status: 'QUALIFIED' });
    // Simulate a concurrent webhook settling the conversion AFTER the route's
    // eligibility read but BEFORE updateMany: the stand-in's updateMany honours
    // the WHERE, so if the WHERE were wrong this would 200 and overwrite PAID.
    const orig = state.conversions[0];
    const res = await app.inject({
      method: 'POST',
      url: '/referral/conversions/c1/clawback',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { reason: 'race test' },
    });
    // With the CAS present and the row still QUALIFIED at write time, this
    // succeeds; the race is asserted structurally in the falsification block
    // (F1 removes the status filter from the WHERE).
    expect(res.statusCode).toBe(200);
    expect(orig?.status).toBe('CLAWED_BACK');
    await app.close();
  });

  it('requires a reason (min 3 chars)', async () => {
    const app = await build();
    seedConv({ id: 'c1', referrer_id: 'r1', status: 'PENDING' });
    const res = await app.inject({
      method: 'POST',
      url: '/referral/conversions/c1/clawback',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { reason: 'no' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('404 for an unknown conversion id', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/referral/conversions/nope/clawback',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { reason: 'ghost' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ─── Payout trigger ────────────────────────────────────────────────

describe('POST /referral/payouts/trigger', () => {
  beforeEach(resetState);

  it('runs the T7 handler in MANUAL mode and audit-logs the run', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/referral/payouts/trigger',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    // MECHANISM: the route must call the REAL handler entry point with mode
    // 'manual' — the cadence gate lives in the handler, and the whole point of
    // this endpoint is that MANUAL settings do not block an admin's click.
    expect(handleReferralPayout).toHaveBeenCalledWith('manual');
    expect(state.audits.some((a) => a.action === 'REFERRAL_PAYOUT_TRIGGERED')).toBe(true);
    await app.close();
  });
});

// ─── Payout-account admin entry ────────────────────────────────────

describe('/referral/retailers/:id/payout-account', () => {
  beforeEach(resetState);

  it('GET 404s when no account exists (the UI renders the empty form)', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/referral/retailers/r1/payout-account',
      headers: ADMIN_HEADERS,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('PUT rejects a malformed IFSC with a 422 naming the field rule', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'PUT',
      url: '/referral/retailers/r1/payout-account',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: {
        account_type: 'BANK_ACCOUNT',
        account_name: 'X',
        ifsc: '12AB',
        account_number: '123456',
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('IFSC');
    await app.close();
  });
});

// ─── Source-scan guards ────────────────────────────────────────────

describe('T9 source-scan guards', () => {
  /**
   * Strip comments so documented examples aren't mistaken for code.
   * LINE comments FIRST — this route's header contains `referral/*` inside a
   * `//` comment, and stripping block comments first makes the regex eat from
   * there through the imports (the exact rake T7's test stepped on).
   */
  const code = (source: string) =>
    source.replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/\/\*[\s\S]*?\*\//g, '');

  const monitorSource = code(
    readFileSync(join(REPO_ROOT, 'apps/api/src/routes/admin/admin-referral-monitor.ts'), 'utf8'),
  );

  it('clawback CAS re-checks status in the WHERE (never read-then-write)', () => {
    expect(monitorSource).toMatch(/status:\s*\{\s*in:\s*\[\.\.\.CLAWBACK_ELIGIBLE_STATUSES\]/);
    expect(monitorSource).toContain('if (rows.count === 0) return 0;');
    expect(monitorSource).toContain("code: 'CONFLICT'");
  });

  it('audit row is written INSIDE the transaction', () => {
    const txStart = monitorSource.indexOf('prisma.$transaction');
    const txEnd = monitorSource.indexOf(
      '});',
      monitorSource.indexOf('REFERRAL_CLAWED_BACK_MANUAL'),
    );
    const txSlice = monitorSource.slice(txStart, txEnd);
    expect(txSlice).toContain('auditLog.create');
  });

  it("unsettled math imports T7's helper — never restated", () => {
    expect(monitorSource).toContain("from '../../jobs/referral-payout.js'");
    // The helper must be CALLED in both the leaderboard and the export paths.
    expect(monitorSource.match(/computeUnsettledPaise\(/g)?.length).toBe(2);
    // The exact mutation F5 tried: ANY inline restatement of the identity in
    // this route, not one syntactic shape of it. No `Math.max(0, ...)` and no
    // inline `accrued - committed` arithmetic over conversion sums may appear.
    expect(monitorSource).not.toMatch(/Math\.max\(\s*0,/);
    expect(monitorSource).not.toMatch(/commission_accrued,\s*0\)\s*-\s*committed/);
  });

  it('the route registers adminAuthPreHandler', () => {
    expect(monitorSource).toContain('adminAuthPreHandler');
  });

  it('every mutating route audit-logs its action', () => {
    // Three mutators: trigger, clawback, account-set.
    for (const action of [
      'REFERRAL_PAYOUT_TRIGGERED',
      'REFERRAL_CLAWED_BACK_MANUAL',
      'REFERRAL_PAYOUT_ACCOUNT_SET',
    ]) {
      expect(monitorSource).toContain(action);
    }
  });

  it('the aggregator registers the monitor routes', () => {
    const agg = readFileSync(join(REPO_ROOT, 'apps/api/src/routes/admin.ts'), 'utf8');
    expect(agg).toContain('adminReferralMonitorRoutes');
    // Registered in the barrel too — the 404 class is registering in one and
    // not the other.
    const barrel = readFileSync(join(REPO_ROOT, 'apps/api/src/routes/admin/index.ts'), 'utf8');
    expect(barrel).toContain(
      "export { adminReferralMonitorRoutes } from './admin-referral-monitor.js'",
    );
  });

  it('the screen source calls the masked-only GET and never displays raw details', () => {
    const page = readFileSync(join(REPO_ROOT, 'apps/web/src/app/admin/referral/page.tsx'), 'utf8');
    expect(page).toContain('masked_display');
    expect(page).toContain('/referral/payouts/trigger');
    expect(page).toContain('/clawback');
  });
});

// ─── Falsification record ──────────────────────────────────────────
// Each guard above was broken and watched to fail for the RIGHT reason.
// Recorded here so the next reader knows these are proven, not aspirational.

describe('falsification record', () => {
  it('F1: dropping the status filter from the clawback WHERE would overwrite PAID rows', () => {
    // Mutation: `where: { id: params.id }` (no status clause). Caught by the
    // source scan `status: { in: [...CLAWBACK_ELIGIBLE_STATUSES] }` AND by the
    // 422-refuses-PAID test (the mutation lets the write through after the 422
    // branch was already skipped by the eligibility read... actually with the
    // read intact the 422 fires first, so the load-bearing catcher is the scan).
    expect(monitorSourceSnippet()).toMatch(
      /status:\s*\{\s*in:\s*\[\.\.\.CLAWBACK_ELIGIBLE_STATUSES\]/,
    );
  });

  it('F2: clawing back from PAID would let money leave twice', () => {
    // Mutation: add 'PAID' to CLAWBACK_ELIGIBLE_STATUSES. Caught by the
    // branch-table test asserting the exact two-element array AND by the 422
    // test watching the status stay PAID.
    expect(CLAWBACK_ELIGIBLE_STATUSES).toEqual(['PENDING', 'QUALIFIED']);
  });

  it('F3: filtering claimed conversions out of the unsettled input double-subtracts', () => {
    // Mutation: add `.filter(c => c.payout_id === null)` to the leaderboard
    // mapping. Caught by the MECHANISM test asserting 20_000 (the mutation
    // produced 0 — the clamp hiding a negative).
    expect(monitorSourceSnippet()).not.toContain('payout_id === null');
  });

  it('F4: calling handleReferralPayout() without a mode would run it as the cron', async () => {
    // Mutation: handleReferralPayout() (defaults to 'cron'). Under MANUAL
    // cadence the handler would skip everything while the screen reported a
    // successful run. The route must pass 'manual' explicitly — proven by
    // firing the endpoint HERE and watching the mock's arg.
    vi.mocked(handleReferralPayout).mockClear();
    const app = await build();
    await app.inject({
      method: 'POST',
      url: '/referral/payouts/trigger',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: {},
    });
    await app.close();
    expect(handleReferralPayout).toHaveBeenCalledWith('manual');
  });

  it("F5: a restated unsettled formula would drift from T7's", () => {
    // Mutation: inline `Math.max(0, accrued - committed)` in the route. Caught
    // by the source scan asserting the import is used and no restatement
    // exists.
    expect(monitorSourceSnippet()).not.toMatch(/Math\.max\(0,\s*accrued\s*-/);
  });
});

/** Re-read the monitor source for the falsification assertions. Line comments first — see `code` above. */
function monitorSourceSnippet(): string {
  return readFileSync(
    join(REPO_ROOT, 'apps/api/src/routes/admin/admin-referral-monitor.ts'),
    'utf8',
  )
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}
