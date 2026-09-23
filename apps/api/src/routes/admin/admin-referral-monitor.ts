// Admin referral program monitoring — T9 of
// docs/tasks/referral-program-retailer-affiliate.md.
//
// Surfaces (all mounted at /v1/admin/referral/*, all SUPER_ADMIN-only — see
// the admin-access.ts classification; money + an irreversible clawback put
// this tier with `commission` and `referral-settings`):
//
//   GET  /referral/overview        — program totals for the dashboard cards
//   GET  /referral/leaderboard     — per-referrer earnings + unsettled money
//   GET  /referral/export          — CSV of the leaderboard
//   POST /referral/payouts/trigger — run the T7 payout handler on demand
//                                    (works under MANUAL cadence: mode
//                                    'manual' skips the cadence gate)
//   POST /referral/conversions/:id/clawback — irreversible; CAS from PENDING
//                                    or QUALIFIED only (the same states T5
//                                    may claw back — never from PAID, whose
//                                    money may already have left the account)
//   GET/PUT /referral/retailers/:id/payout-account — the interim way to enter
//                                    a retailer's payout details until T8
//                                    ships (owner decision 2026-09-23)
//
// The unsettled math is NOT restated here — it imports T7's
// computeUnsettledPaise + LEDGER_CONSUMING_STATUSES so the screen shows the
// same number the payout job acts on. The clawback is the ONLY application
// writer of CLAWED_BACK outside T5's nightly job, and it uses the same
// compare-and-swap discipline so a concurrent qualification or payout settle
// cannot race an admin's click.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  LEDGER_CONSUMING_STATUSES,
  computeUnsettledPaise,
  handleReferralPayout,
} from '../../jobs/referral-payout.js';
import {
  PayoutAccountNotFoundError,
  savePayoutAccount,
} from '../../lib/referral-payout-account-save.js';
import { adminAuthPreHandler } from '../admin-auth.js';
import { putSchema as retailerPutSchema } from '../retailers/retailers-payout-account.js';

// ─── Shared pure helpers (exported for tests) ──────────────────────

export type ConversionStatus = 'PENDING' | 'QUALIFIED' | 'PAID' | 'CLAWED_BACK';

/**
 * Which conversions an admin clawback may CAS from. Same set T5's own clawback
 * branch writes from: PENDING (never qualified — e.g. the store was deleted
 * early) and QUALIFIED (accrued but unpaid). PAID is deliberately excluded —
 * the referrer's payout for those months may already have settled, and
 * reversing that is a payments operation, not a flag flip. CLAWED_BACK is
 * final (irreversible by design).
 */
export const CLAWBACK_ELIGIBLE_STATUSES: readonly ConversionStatus[] = ['PENDING', 'QUALIFIED'];

/** Pure decision: is a clawback attempt on this status allowed? */
export function isClawbackAllowed(status: ConversionStatus): boolean {
  return (CLAWBACK_ELIGIBLE_STATUSES as readonly string[]).includes(status);
}

/** Rupees, 2 decimals, no ₹ symbol (CSV/Excel friendliness — §42 pattern). */
function fmtRs(paise: number): string {
  return (paise / 100).toFixed(2);
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export type LeaderboardRow = {
  referrer_id: string;
  shop_name: string;
  code: string | null;
  conversions_total: number;
  pending: number;
  qualified: number;
  paid: number;
  clawed_back: number;
  commission_accrued_paise: number;
  paid_out_paise: number;
  unsettled_paise: number;
};

/**
 * Build the CSV document for a leaderboard. Pure — unit-testable without a DB.
 */
export function buildReferralLeaderboardCsv(rows: LeaderboardRow[]): string {
  const lines: string[] = [];
  lines.push('Kanchuki Referral Leaderboard Export');
  lines.push(
    `Generated,${csvField(`${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`)}`,
  );
  lines.push('');
  lines.push(
    [
      'Shop',
      'Code',
      'Conversions',
      'Pending',
      'Qualified',
      'Paid',
      'Clawed Back',
      'Commission Accrued (INR)',
      'Paid Out (INR)',
      'Unsettled (INR)',
    ].join(','),
  );
  for (const r of rows) {
    lines.push(
      [
        csvField(r.shop_name),
        csvField(r.code ?? ''),
        String(r.conversions_total),
        String(r.pending),
        String(r.qualified),
        String(r.paid),
        String(r.clawed_back),
        fmtRs(r.commission_accrued_paise),
        fmtRs(r.paid_out_paise),
        fmtRs(r.unsettled_paise),
      ].join(','),
    );
  }
  lines.push('');
  lines.push(
    `Totals,,,,,,${fmtRs(rows.reduce((s, r) => s + r.commission_accrued_paise, 0))},${fmtRs(rows.reduce((s, r) => s + r.paid_out_paise, 0))},${fmtRs(rows.reduce((s, r) => s + r.unsettled_paise, 0))}`,
  );
  return lines.join('\n');
}

// ─── Routes ────────────────────────────────────────────────────────

export const adminReferralMonitorRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /referral/overview ──────────────────────────────────────
  // Program totals — no per-referrer detail (that is the leaderboard's job).
  server.get('/referral/overview', async () => {
    const [conversions, payoutsAgg] = await Promise.all([
      prisma.referralConversion.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { commission_accrued: true },
      }),
      prisma.referralPayout.aggregate({
        where: { status: { in: [...LEDGER_CONSUMING_STATUSES] } },
        _sum: { amount_paise: true },
        _count: { _all: true },
      }),
    ]);

    const byStatus = (status: ConversionStatus) =>
      conversions.find((c) => c.status === status)?._count._all ?? 0;
    const accrued = conversions.reduce((sum, c) => sum + (c._sum.commission_accrued ?? 0), 0);
    const committed = payoutsAgg._sum.amount_paise ?? 0;

    return {
      data: {
        conversions_total: conversions.reduce((s, c) => s + c._count._all, 0),
        pending: byStatus('PENDING'),
        qualified: byStatus('QUALIFIED'),
        paid: byStatus('PAID'),
        clawed_back: byStatus('CLAWED_BACK'),
        commission_accrued_paise: accrued,
        paid_out_paise: committed,
        // Same identity the payout job enforces: unsettled = accrued −
        // committed(PENDING/PROCESSING/PAID). REVERSED/FAILED batches released
        // their claim, so they are excluded on BOTH sides.
        unsettled_paise: accrued - committed,
        payout_batches_in_flight: payoutsAgg._count._all,
      },
    };
  });

  // ─── GET /referral/leaderboard ───────────────────────────────────
  // One row per referrer with unsettled money. The unsettled figure per row
  // uses the T7 ledger identity, so a row showing ₹0 exactly means the next
  // payout run has nothing to claim for that referrer.
  server.get('/referral/leaderboard', async () => {
    const conversions = await prisma.referralConversion.findMany({
      where: { status: { in: ['PENDING', 'QUALIFIED', 'PAID', 'CLAWED_BACK'] } },
      select: {
        referrer_id: true,
        status: true,
        commission_accrued: true,
        referrer: { select: { shop_name: true } },
      },
    });
    const payoutRows = await prisma.referralPayout.findMany({
      where: { status: { in: [...LEDGER_CONSUMING_STATUSES] } },
      select: { referrer_id: true, amount_paise: true },
    });
    const codes = await prisma.referralCode.findMany({
      select: { retailer_id: true, code: true },
    });
    const codeByRetailer = new Map(codes.map((c) => [c.retailer_id, c.code]));

    const committedByReferrer = new Map<string, number>();
    for (const p of payoutRows) {
      committedByReferrer.set(
        p.referrer_id,
        (committedByReferrer.get(p.referrer_id) ?? 0) + p.amount_paise,
      );
    }

    const byReferrer = new Map<string, typeof conversions>();
    for (const c of conversions) {
      const list = byReferrer.get(c.referrer_id) ?? [];
      list.push(c);
      byReferrer.set(c.referrer_id, list);
    }

    const rows: LeaderboardRow[] = [];
    for (const [referrerId, list] of byReferrer) {
      const count = (status: ConversionStatus) => list.filter((c) => c.status === status).length;
      const accrued = list.reduce((s, c) => s + c.commission_accrued, 0);
      const committed = committedByReferrer.get(referrerId) ?? 0;
      // The exact per-referrer unsettled identity T7 acts on: accrued on ALL
      // QUALIFIED/PAID conversions (claimed ones included — their money sits on
      // both sides of the identity and cancels) minus committed batches.
      // Filtering to payout_id === null here would subtract claimed money
      // twice. Reusing the job's own helper + statuses constant keeps the
      // screen honest if the job ever changes its set.
      const unsettledPaise = computeUnsettledPaise(
        list
          .filter((c) => c.status === 'QUALIFIED' || c.status === 'PAID')
          .map((c) => ({
            id: c.referrer_id,
            status: c.status,
            commission_accrued: c.commission_accrued,
            payout_id: null,
          })),
        committed,
      );
      rows.push({
        referrer_id: referrerId,
        shop_name: list[0]?.referrer.shop_name ?? referrerId,
        code: codeByRetailer.get(referrerId) ?? null,
        conversions_total: list.length,
        pending: count('PENDING'),
        qualified: count('QUALIFIED'),
        paid: count('PAID'),
        clawed_back: count('CLAWED_BACK'),
        commission_accrued_paise: accrued,
        paid_out_paise: committed,
        unsettled_paise: unsettledPaise,
      });
    }
    rows.sort((a, b) => b.commission_accrued_paise - a.commission_accrued_paise);

    return { data: rows };
  });

  // ─── GET /referral/export ────────────────────────────────────────
  server.get('/referral/export', async (_request, reply) => {
    // Reuse the leaderboard computation by calling the same selects inline.
    const conversions = await prisma.referralConversion.findMany({
      where: { status: { in: ['PENDING', 'QUALIFIED', 'PAID', 'CLAWED_BACK'] } },
      select: {
        referrer_id: true,
        status: true,
        commission_accrued: true,
        referrer: { select: { shop_name: true } },
      },
    });
    const payoutRows = await prisma.referralPayout.findMany({
      where: { status: { in: [...LEDGER_CONSUMING_STATUSES] } },
      select: { referrer_id: true, amount_paise: true },
    });
    const codes = await prisma.referralCode.findMany({ select: { retailer_id: true, code: true } });
    const codeByRetailer = new Map(codes.map((c) => [c.retailer_id, c.code]));
    const committedByReferrer = new Map<string, number>();
    for (const p of payoutRows) {
      committedByReferrer.set(
        p.referrer_id,
        (committedByReferrer.get(p.referrer_id) ?? 0) + p.amount_paise,
      );
    }
    const byReferrer = new Map<string, typeof conversions>();
    for (const c of conversions) {
      const list = byReferrer.get(c.referrer_id) ?? [];
      list.push(c);
      byReferrer.set(c.referrer_id, list);
    }
    const rows: LeaderboardRow[] = [...byReferrer.entries()].map(([referrerId, list]) => {
      const count = (status: ConversionStatus) => list.filter((c) => c.status === status).length;
      const accrued = list.reduce((s, c) => s + c.commission_accrued, 0);
      const committed = committedByReferrer.get(referrerId) ?? 0;
      // Same identity as the leaderboard: ALL QUALIFIED/PAID conversions,
      // never the payout_id-filtered subset (claimed money would otherwise be
      // subtracted twice).
      const unsettledPaise = computeUnsettledPaise(
        list
          .filter((c) => c.status === 'QUALIFIED' || c.status === 'PAID')
          .map((c) => ({
            id: c.referrer_id,
            status: c.status,
            commission_accrued: c.commission_accrued,
            payout_id: null,
          })),
        committed,
      );
      return {
        referrer_id: referrerId,
        shop_name: list[0]?.referrer.shop_name ?? referrerId,
        code: codeByRetailer.get(referrerId) ?? null,
        conversions_total: list.length,
        pending: count('PENDING'),
        qualified: count('QUALIFIED'),
        paid: count('PAID'),
        clawed_back: count('CLAWED_BACK'),
        commission_accrued_paise: accrued,
        paid_out_paise: committed,
        unsettled_paise: unsettledPaise,
      };
    });
    rows.sort((a, b) => b.commission_accrued_paise - a.commission_accrued_paise);

    const csv = buildReferralLeaderboardCsv(rows);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header(
      'Content-Disposition',
      `attachment; filename="referral-leaderboard-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return reply.send(csv);
  });

  // ─── POST /referral/payouts/trigger ──────────────────────────────
  // Runs the SAME handler the nightly cron runs, in 'manual' mode — MANUAL
  // cadence gates the cron, never on-demand money movement (T7's own contract).
  server.post('/referral/payouts/trigger', async (request) => {
    const summary = await handleReferralPayout('manual');
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'REFERRAL_PAYOUT_TRIGGERED',
        resource_type: 'ReferralPayoutRun',
        resource_id: summary.ran_at,
        metadata: {
          mode: summary.mode,
          batches_claimed: summary.batches_claimed,
          batches_submitted: summary.batches_submitted,
          skipped_no_account: summary.skipped_no_account,
          skipped_below_min: summary.skipped_below_min,
          errors: summary.errors,
        },
        ip_address: request.ip,
      },
    });
    request.log.info({ summary }, 'Manual referral payout run');
    return { data: summary };
  });

  // ─── POST /referral/conversions/:id/clawback ─────────────────────
  // IRREVERSIBLE (DB CHECK lets nothing un-claw). CAS: the WHERE re-checks the
  // live status, so a conversion that qualified or settled between the admin's
  // page-load and click is not overwritten. Never writes a timestamp other
  // than clawed_back_at — and the CHECK lets paid_at remain set when clawing
  // back is impossible from PAID, which this route refuses outright.
  server.post('/referral/conversions/:id/clawback', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ reason: z.string().min(3).max(500) }).parse(request.body ?? {});

    const existing = await prisma.referralConversion.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, referrer_id: true, referred_id: true },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', status: 404 } });
    }
    if (!isClawbackAllowed(existing.status)) {
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          status: 422,
          message:
            `A ${existing.status} conversion cannot be clawed back — clawback is available for ${CLAWBACK_ELIGIBLE_STATUSES.join(' and ')} only. ${existing.status === 'PAID' ? 'Payouts against it may already have settled; reverse via RazorpayX instead.' : ''}`.trim(),
        },
      });
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const rows = await tx.referralConversion.updateMany({
        where: { id: params.id, status: { in: [...CLAWBACK_ELIGIBLE_STATUSES] } },
        data: { status: 'CLAWED_BACK', clawed_back_at: now },
      });
      if (rows.count === 0) return 0;
      await tx.auditLog.create({
        data: {
          actor_type: 'admin',
          action: 'REFERRAL_CLAWED_BACK_MANUAL',
          resource_type: 'ReferralConversion',
          resource_id: params.id,
          metadata: {
            referrer_id: existing.referrer_id,
            referred_id: existing.referred_id,
            prior_status: existing.status,
            reason: body.reason,
          },
          ip_address: request.ip,
        },
      });
      return rows.count;
    });

    if (updated === 0) {
      // Lost the race — the status moved under us. Same honest answer T5 gives.
      return reply.status(409).send({
        error: {
          code: 'CONFLICT',
          status: 409,
          message:
            'The conversion changed state while the clawback was being applied — reload and retry.',
        },
      });
    }
    request.log.warn({ conversionId: params.id, reason: body.reason }, 'Manual referral clawback');
    return { data: { id: params.id, status: 'CLAWED_BACK', clawed_back_at: now.toISOString() } };
  });

  // ─── GET /referral/retailers/:id/conversions ─────────────────────
  // The detail drawer's conversion list (newest first).
  server.get('/referral/retailers/:id/conversions', async (request, _reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const rows = await prisma.referralConversion.findMany({
      where: { referrer_id: params.id },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        status: true,
        created_at: true,
        commission_accrued: true,
        referred: { select: { shop_name: true } },
      },
      take: 200,
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        status: r.status,
        referred_shop: r.referred.shop_name,
        created_at: r.created_at,
        commission_accrued_paise: r.commission_accrued,
      })),
    };
  });

  // ─── GET /referral/retailers/:id/payout-account ──────────────────
  // Masked shape only, same as the retailer GET.
  server.get('/referral/retailers/:id/payout-account', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const row = await prisma.referralPayoutAccount.findUnique({
      where: { retailer_id: params.id },
      select: { account_type: true, masked_display: true, is_active: true, updated_at: true },
    });
    if (!row) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', status: 404 } });
    }
    return { data: row };
  });

  // ─── PUT /referral/retailers/:id/payout-account ──────────────────
  // The interim path for entering a retailer's payout details until T8 ships
  // (owner decision 2026-09-23). Uses the SHARED save lib — identical
  // contact-reuse + deactivate-then-create semantics as the retailer's own
  // self-serve PUT. Audit-logged: an admin entering someone's bank details is
  // a sensitive action.
  server.put('/referral/retailers/:id/payout-account', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const parsed = retailerPutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', status: 422, message: parsed.error.issues[0]?.message },
      });
    }

    try {
      const row = await savePayoutAccount({
        retailerId: params.id,
        body: parsed.data,
        logWarn: (obj, msg) => request.log.warn(obj, msg),
      });
      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          action: 'REFERRAL_PAYOUT_ACCOUNT_SET',
          resource_type: 'ReferralPayoutAccount',
          resource_id: row.id,
          metadata: { retailer_id: params.id, account_type: row.account_type },
          ip_address: request.ip,
        },
      });
      return { data: row };
    } catch (error) {
      if (error instanceof PayoutAccountNotFoundError) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', status: 404 } });
      }
      throw error;
    }
  });
};
