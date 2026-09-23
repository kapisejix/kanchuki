// Referral commission payout — T7 of
// docs/tasks/referral-program-retailer-affiliate.md.
//
// WHAT THIS DOES
//
// Settles the ledger T6 grew. Per referrer with an active payout account:
//   unsettled = Σ(conversions.commission_accrued)
//             − Σ(payouts.amount_paise where status in PENDING/PROCESSING/PAID)
// If unsettled ≥ payout_min_amount, one batch is claimed and submitted to
// RazorpayX (IMPS). FAILED/REVERSED batches are excluded from the sum, so
// their claim auto-releases and the money is re-batched next cycle — nothing
// is ever lost, nothing is ever paid twice.
//
// THE CLAIM MODEL (why this is safe under crash/retry)
//
// 1. CLAIM (one transaction): a per-referrer advisory lock serializes
//    overlapping runs, the unsettled amount is re-read under it, a PENDING
//    row is created for exactly that amount with a random 'refpo-' key, and
//    every QUALIFIED/PAID conversion not held by an in-flight batch is
//    attached (payout_id) so settlement can stamp paid_at. The audit row
//    joins the transaction (T5/T6 discipline — a claim without its audit is
//    an unaudited money move).
// 2. SUBMIT: POST /v1/payouts with X-Payout-Idempotency = the row's key and a
//    body derived purely from stored values (RazorpayX requires the identical
//    body on retry; anything timestamp- or random-derived would break it).
// 3. SETTLE: only the webhook (or reconciliation) flips payout → PAID and
//    stamps paid_at on the claimed conversions. This job NEVER writes
//    paid_at at submit time — the DB CHECK ties PAID to paid_at, and paid_at
//    is the REFERRER's payout date, not a submit timestamp (T5's rule).
// 4. RELEASE: webhook failed/reversed/rejected → payout row FAILED/REVERSED
//    and claimed conversions' payout_id cleared. Next run re-includes them.
//
// CRASH RECOVERY: a PENDING row with no razorpayx_payout_id was claimed but
// never confirmed submitted — every run re-submits it with the SAME key and
// SAME body. RazorpayX's idempotency contract returns the original payout
// instead of double-paying. This is why the key lives on the row, not in a
// variable regenerated per attempt.
//
// TDS (owner decision 2026-09-23, defaults OFF until the CA conversation):
// settings.tds_enabled ⇒ RazorpayX receives NET = gross − TDS and tds_paise
// is snapshotted per batch. amount_paise stays the GROSS claim against the
// ledger — otherwise the withheld tax would be re-paid next cycle.
//
// CONCURRENCY: one batch per referrer per run; the unsettled sum EXCLUDES
// in-flight (PENDING/PROCESSING) batches, so a partially-crashed run cannot
// double-claim. The cron is monthly on the 30th (owner decision) — February
// has no 30th, so February pays on March 30 and the balance simply carries.
//
// CADENCE: payout_cadence MONTHLY runs the cron; MANUAL skips it (T9's admin
// trigger endpoint pays on demand through the same exported function).
import { randomBytes } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import {
  RazorpayxHttpError,
  type RazorpayxPayoutStatus,
  createPayout,
  fetchPayout,
} from '../lib/razorpayx.js';
import { settlePayout } from '../lib/referral-payout-settle.js';

/**
 * Internal signal that the claim transaction attached zero conversions — the
 * caller lost a race with a concurrent payout run. Thrown (not returned) so it
 * unwinds the transaction and rolls back the just-created batch row; the outer
 * handler converts it to a skipped batch, not an error.
 */
class EmptyClaimError extends Error {
  constructor() {
    super('claim attached zero conversions — concurrent run won the race');
    this.name = 'EmptyClaimError';
  }
}

// ─── Pure decision core (unit-tested without RazorpayX or DB) ────

export interface PayoutJobSettings {
  payout_min_amount: number;
  payout_cadence: 'MONTHLY' | 'MANUAL';
  tds_enabled: boolean;
  tds_pct: number;
}

/** Statuses whose amount still counts as claimed-or-settled against the ledger. */
export const LEDGER_CONSUMING_STATUSES = ['PENDING', 'PROCESSING', 'PAID'] as const;

export interface UnsettledConversion {
  id: string;
  /** Prisma's status enum narrows to QUALIFIED | PAID via the WHERE clause. */
  status: 'QUALIFIED' | 'PAID' | 'PENDING' | 'CLAWED_BACK';
  commission_accrued: number;
  payout_id: string | null;
}

/**
 * The unsettled balance for one referrer: accrued money not yet consumed by a
 * live (or settled) batch. FAILED/REVERSED batches are excluded — releasing
 * their claim IS how the money returns to this pool.
 */
export function computeUnsettledPaise(
  conversions: UnsettledConversion[],
  consumedPaise: number,
): number {
  const accrued = conversions.reduce((sum, c) => sum + c.commission_accrued, 0);
  return Math.max(0, accrued - consumedPaise);
}

/**
 * Should a batch be raised for this referrer this run?
 *
 * Returns a discriminated action so the caller's branches are exhaustive:
 *   SKIP_NO_ACCOUNT   — no active payout destination; money stays accrued.
 *   SKIP_BELOW_MIN    — unsettled below payout_min_amount; stays accrued.
 *   SKIP_CADENCE      — settings say MANUAL; the cron must not pay (T9 can).
 *   CLAIM             — raise a batch of `gross_paise` now.
 */
export function decideReferrerBatch(params: {
  settings: PayoutJobSettings;
  hasActiveAccount: boolean;
  unsettledPaise: number;
  /** Cron invocation vs admin manual trigger — MANUAL cadence ignores this. */
  isCron: boolean;
}):
  | { action: 'SKIP_NO_ACCOUNT' | 'SKIP_BELOW_MIN' | 'SKIP_CADENCE' }
  | { action: 'CLAIM'; gross_paise: number } {
  const { settings, hasActiveAccount, unsettledPaise, isCron } = params;
  if (isCron && settings.payout_cadence === 'MANUAL') return { action: 'SKIP_CADENCE' };
  if (!hasActiveAccount) return { action: 'SKIP_NO_ACCOUNT' };
  if (unsettledPaise < settings.payout_min_amount) return { action: 'SKIP_BELOW_MIN' };
  return { action: 'CLAIM', gross_paise: unsettledPaise };
}

/**
 * TDS split for a batch. Net (what RazorpayX receives) must stay positive —
 * the DB CHECK forbids tds_paise >= amount_paise, and a zero-net payout would
 * be rejected by RazorpayX anyway (minimum 100 paise). A settings row can
 * carry 100% (the CHECK only bounds 0..100), so the guard lives here at the
 * point the money moves.
 */
export function splitTds(
  grossPaise: number,
  settings: PayoutJobSettings,
): { net_paise: number; tds_paise: number } {
  if (!settings.tds_enabled || settings.tds_pct <= 0)
    return { net_paise: grossPaise, tds_paise: 0 };
  const tds = Math.min(Math.floor((grossPaise * settings.tds_pct) / 100), grossPaise - 1);
  return { net_paise: grossPaise - tds, tds_paise: tds };
}

/**
 * RazorpayX payout status → our row transition. Intermediate states
 * (queued/pending/initiated) keep the row PROCESSING; terminal states map to
 * PAID/FAILED/REVERSED. Unknown statuses (RazorpayX added one we don't know)
 * return null so the caller leaves the row untouched rather than guessing —
 * an unrecognized value must never silently decide money (RC-027).
 */
export function mapRazorpayxStatus(
  status: RazorpayxPayoutStatus,
): 'PROCESSING' | 'PAID' | 'FAILED' | 'REVERSED' | null {
  switch (status) {
    case 'queued':
    case 'pending':
    case 'initiated':
      return 'PROCESSING';
    case 'processed':
      return 'PAID';
    case 'rejected':
    case 'canceled':
    case 'failed':
      return 'FAILED';
    case 'reversed':
      return 'REVERSED';
    default:
      return null;
  }
}

/**
 * Body-stability guard: the idempotent retry contract requires the SAME body.
 * Only these fields may influence the payout body — a caller deriving any
 * body field from something not stored on the row (clock, random, settings
 * re-read) would break retry idempotency. Exported so tests can pin the set.
 */
export const PAYOUT_BODY_FIELDS = [
  'fund_account_id',
  'amount',
  'idempotency_key',
  'reference_id',
  'narration',
] as const;

/** Sanitize a provider failure into something storable — raw bodies can carry internal detail. */
export function failureReasonFrom(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 500);
  return 'payout submission failed';
}

// ─── Job implementation ──────────────────────────────────────────

const BATCH_SIZE = 50;

export interface PayoutRunSummary {
  ran_at: string;
  mode: 'cron' | 'manual';
  referrers_scanned: number;
  batches_claimed: number;
  batches_submitted: number;
  re_submitted_crash_recovered: number;
  reconciled: { checked: number; settled: number; released: number };
  skipped_no_account: number;
  skipped_below_min: number;
  skipped_cadence: number;
  /** Claim tx attached zero conversions — a concurrent run won the race. */
  skipped_concurrent: number;
  errors: number;
}

/**
 * Reconcile PENDING/PROCESSING rows older than 24h against RazorpayX — the
 * safety net for missed webhooks. Applies the same transitions the webhook
 * does (via settlePayout). Rows settled here keep webhook_confirmed = false:
 * the DDL deliberately separates "provider says processed" from "the webhook
 * told us", so the flag stays truthful evidence.
 */
async function reconcileStale(olderThanMs: number, summary: PayoutRunSummary): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await prisma.referralPayout.findMany({
    where: { status: { in: ['PENDING', 'PROCESSING'] }, updated_at: { lt: cutoff } },
    select: { id: true, razorpayx_payout_id: true, status: true },
    take: BATCH_SIZE,
  });

  for (const row of stale) {
    try {
      if (!row.razorpayx_payout_id) {
        // Claimed, never submitted, AND stale past the crash-recovery window —
        // an unusual state (re-submit should have caught it). Leave for the
        // re-submit step; counted, not guessed.
        continue;
      }
      const remote = await fetchPayout(row.razorpayx_payout_id);
      const mapped = mapRazorpayxStatus(remote.status);
      if (!mapped) {
        await prisma.referralPayout.update({
          where: { id: row.id },
          data: { failure_reason: `unrecognized RazorpayX status: ${remote.status}` },
        });
        continue;
      }
      if (mapped === 'PROCESSING') continue;
      const settled = await settlePayout(row.id, mapped, remote.status_details?.reason ?? null);
      if (settled === 'PAID') summary.reconciled.settled += 1;
      else if (settled === 'FAILED' || settled === 'REVERSED') summary.reconciled.released += 1;
      summary.reconciled.checked += 1;
    } catch (error) {
      // Provider call failed for this row — leave the row for the next run.
      summary.errors += 1;
      console.error(`[referral-payout] reconcile failed for ${row.id}:`, error);
    }
  }
}

/**
 * Submit (or re-submit) one payout row. The body is derived ONLY from stored
 * row values, so a retry is byte-identical and RazorpayX's idempotency
 * returns the original payout instead of paying twice.
 */
async function submitPayoutRow(payoutRowId: string): Promise<'submitted' | 'failed'> {
  const row = await prisma.referralPayout.findUnique({
    where: { id: payoutRowId },
    select: {
      id: true,
      referrer_id: true,
      amount_paise: true,
      tds_paise: true,
      idempotency_key: true,
      status: true,
      razorpayx_payout_id: true,
    },
  });
  if (!row) return 'failed';

  const account = await prisma.referralPayoutAccount.findUnique({
    where: { retailer_id: row.referrer_id },
    select: { razorpayx_fund_account_id: true, is_active: true },
  });
  if (!account?.is_active || !account.razorpayx_fund_account_id) {
    // Destination vanished between claim and submit — release the claim so the
    // money is not stranded in a PENDING row forever.
    await settlePayout(row.id, 'FAILED', 'no active payout account');
    return 'failed';
  }

  let remote: Awaited<ReturnType<typeof createPayout>>;
  try {
    remote = await createPayout({
      fundAccountId: account.razorpayx_fund_account_id,
      amount: row.amount_paise - row.tds_paise,
      idempotencyKey: row.idempotency_key,
      referenceId: row.id,
      narration: 'Kanchuki referral',
    });
  } catch (error) {
    // Only a definitive rejection releases the claim. A timeout, 5xx or 429
    // is ambiguous — RazorpayX may have created the payout — so the row stays
    // PENDING and the next run re-submits with the SAME key. Releasing here
    // would re-batch the money under a NEW key and pay it twice.
    if (error instanceof RazorpayxHttpError && error.isDefinitiveRejection) {
      await settlePayout(row.id, 'FAILED', failureReasonFrom(error));
      return 'failed';
    }
    throw error;
  }

  const mapped = mapRazorpayxStatus(remote.status);
  if (!mapped) {
    // Unrecognized status on create — store it, release nothing (the payout
    // EXISTS provider-side; guessing terminal would double-pay or strand).
    await prisma.referralPayout.update({
      where: { id: row.id },
      data: { failure_reason: `unrecognized RazorpayX status: ${remote.status}` },
    });
    return 'failed';
  }
  if (mapped === 'PAID') {
    // Synchronous processed on create — settle directly (webhook_confirmed
    // stays false: no webhook told us).
    await prisma.referralPayout.update({
      where: { id: row.id },
      data: { razorpayx_payout_id: remote.id },
    });
    await settlePayout(row.id, 'PAID', null, false);
    return 'submitted';
  }
  if (mapped === 'FAILED' || mapped === 'REVERSED') {
    await prisma.referralPayout.update({
      where: { id: row.id },
      data: { razorpayx_payout_id: remote.id },
    });
    await settlePayout(row.id, mapped, remote.status_details?.reason ?? 'rejected by RazorpayX');
    return 'submitted';
  }
  // PROCESSING — store the provider id and move on; the webhook settles it.
  await prisma.referralPayout.update({
    where: { id: row.id },
    data: { razorpayx_payout_id: remote.id, status: 'PROCESSING', failure_reason: null },
  });
  return 'submitted';
}

/**
 * The exported handler. `isCron=false` is T9's manual trigger — same code
 * path, but MANUAL cadence no longer blocks it.
 */
export async function handleReferralPayout(
  mode: 'cron' | 'manual' = 'cron',
): Promise<PayoutRunSummary> {
  const summary: PayoutRunSummary = {
    ran_at: new Date().toISOString(),
    mode,
    referrers_scanned: 0,
    batches_claimed: 0,
    batches_submitted: 0,
    re_submitted_crash_recovered: 0,
    reconciled: { checked: 0, settled: 0, released: 0 },
    skipped_no_account: 0,
    skipped_below_min: 0,
    skipped_cadence: 0,
    skipped_concurrent: 0,
    errors: 0,
  };

  // Settings read at call time — NOTHING hardcoded (spec governing rule).
  const settingsRow = await prisma.referralSettings.findUnique({ where: { id: 'singleton' } });
  if (!settingsRow) {
    // Missing singleton is a data-integrity failure, not an empty run.
    throw new Error(
      '[referral-payout] referral_settings singleton missing — was migration 109 applied?',
    );
  }
  const settings: PayoutJobSettings = {
    payout_min_amount: settingsRow.payout_min_amount,
    payout_cadence: settingsRow.payout_cadence,
    tds_enabled: settingsRow.tds_enabled,
    tds_pct: settingsRow.tds_pct,
  };

  // 1. Reconcile stale in-flight rows FIRST so released money can join today's
  //    batch and settled money is not re-claimed.
  await reconcileStale(24 * 60 * 60 * 1000, summary);

  // 2. Crash recovery: PENDING rows with no provider id get re-submitted with
  //    the SAME idempotency key. RazorpayX returns the original payout.
  const unsubmitted = await prisma.referralPayout.findMany({
    where: { status: 'PENDING', razorpayx_payout_id: null },
    select: { id: true },
    take: BATCH_SIZE,
  });
  for (const row of unsubmitted) {
    try {
      const result = await submitPayoutRow(row.id);
      if (result === 'submitted') summary.re_submitted_crash_recovered += 1;
    } catch (error) {
      summary.errors += 1;
      console.error(`[referral-payout] re-submit failed for ${row.id}:`, error);
    }
  }

  // 3. New batches — per referrer with unsettled money.
  if (mode === 'cron' && settings.payout_cadence === 'MANUAL') {
    summary.skipped_cadence += 1;
    return summary;
  }

  // Referrers that HAVE unsettled conversions at all (candidate set — the
  // per-referrer math below decides skip vs claim).
  const referrerIds = await prisma.referralConversion.findMany({
    where: { status: { in: ['QUALIFIED', 'PAID'] } },
    select: { referrer_id: true },
    distinct: ['referrer_id'],
  });

  for (const { referrer_id: referrerId } of referrerIds) {
    summary.referrers_scanned += 1;
    try {
      const [account, conversions, consumedRows] = await Promise.all([
        prisma.referralPayoutAccount.findUnique({
          where: { retailer_id: referrerId },
          select: { is_active: true },
        }),
        prisma.referralConversion.findMany({
          where: { referrer_id: referrerId, status: { in: ['QUALIFIED', 'PAID'] } },
          select: { id: true, status: true, commission_accrued: true, payout_id: true },
        }),
        prisma.referralPayout.aggregate({
          where: { referrer_id: referrerId, status: { in: [...LEDGER_CONSUMING_STATUSES] } },
          _sum: { amount_paise: true },
        }),
      ]);

      const unsettledPaise = computeUnsettledPaise(
        conversions,
        consumedRows._sum.amount_paise ?? 0,
      );
      const decision = decideReferrerBatch({
        settings,
        hasActiveAccount: account?.is_active === true,
        unsettledPaise,
        isCron: mode === 'cron',
      });

      if (decision.action === 'SKIP_CADENCE') summary.skipped_cadence += 1;
      if (decision.action === 'SKIP_NO_ACCOUNT') summary.skipped_no_account += 1;
      if (decision.action === 'SKIP_BELOW_MIN') summary.skipped_below_min += 1;
      if (decision.action !== 'CLAIM') continue;

      // 3a. CLAIM — one transaction: per-referrer lock + ledger re-read +
      //      batch row + attach + audit. The pre-read above only decides
      //      whether to try; the amount is decided under the lock, so an
      //      overlapping run can never double-pay (RC-036). splitTds keeps
      //      net ≥ 1 paise for any gross ≥ 1, and gross 0 is refused in-tx.
      const payoutRowId = await prisma.$transaction(async (tx) => {
        // Serialize claims per referrer: an overlapping run (cron + manual
        // trigger, or two triggers) blocks here until the first commits, then
        // the re-read below sees the first run's batch as consumed. Lock is
        // released at tx end.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${referrerId}))`;
        // Re-read the ledger UNDER the lock and size the batch from it — never
        // from the pre-read figure, which a concurrent run may have consumed
        // (RC-036: a stale-sized batch pays money no ledger entry backs).
        const [accruedNow, consumedNow] = await Promise.all([
          tx.referralConversion.aggregate({
            where: { referrer_id: referrerId, status: { in: ['QUALIFIED', 'PAID'] } },
            _sum: { commission_accrued: true },
          }),
          tx.referralPayout.aggregate({
            where: { referrer_id: referrerId, status: { in: [...LEDGER_CONSUMING_STATUSES] } },
            _sum: { amount_paise: true },
          }),
        ]);
        const lockedGross = Math.max(
          0,
          (accruedNow._sum.commission_accrued ?? 0) - (consumedNow._sum.amount_paise ?? 0),
        );
        if (lockedGross === 0 || lockedGross < settings.payout_min_amount) {
          // A concurrent run paid this referrer while we waited on the lock.
          throw new EmptyClaimError();
        }
        const locked = splitTds(lockedGross, settings);
        // Pre-generate the claim key: idempotency_key is UNIQUE, so a
        // placeholder would collide under two overlapping claim transactions.
        // 24 hex chars -> "refpo-" + 24 = 30, within RazorpayX's 40-char cap.
        const claimKey = `refpo-${randomBytes(12).toString('hex')}`;
        const batch = await tx.referralPayout.create({
          data: {
            referrer_id: referrerId,
            amount_paise: lockedGross,
            tds_paise: locked.tds_paise,
            status: 'PENDING',
            idempotency_key: claimKey,
          },
        });
        // Attach every conversion not held by an in-flight batch — including
        // ones a PAID batch settled earlier: they keep accruing monthly after
        // the first payout, and settlePayout stamps paid_at via this link.
        // (Filtering on payout_id IS NULL alone stranded every month after the
        // first payout — nothing ever re-attached, so nothing paid again.)
        await tx.referralConversion.updateMany({
          where: {
            referrer_id: referrerId,
            status: { in: ['QUALIFIED', 'PAID'] },
            OR: [{ payout_id: null }, { payout: { status: 'PAID' } }],
          },
          data: { payout_id: batch.id },
        });
        await tx.auditLog.create({
          data: {
            actor_type: 'system',
            action: 'REFERRAL_PAYOUT_CLAIMED',
            resource_type: 'ReferralPayout',
            resource_id: batch.id,
            metadata: {
              referrer_id: referrerId,
              gross_paise: batch.amount_paise,
              tds_paise: batch.tds_paise,
              net_paise: batch.amount_paise - batch.tds_paise,
            },
          },
        });
        return batch.id;
      });
      summary.batches_claimed += 1;

      // 3b. SUBMIT — outside the claim transaction. A definitive rejection is
      //     released inside submitPayoutRow; anything that throws out is
      //     ambiguous and leaves a PENDING row the re-submit step recovers
      //     next run with the same idempotency key.
      try {
        if ((await submitPayoutRow(payoutRowId)) === 'submitted') summary.batches_submitted += 1;
        else summary.errors += 1;
      } catch (error) {
        summary.errors += 1;
        console.error(`[referral-payout] submit failed for ${payoutRowId}:`, error);
      }
    } catch (error) {
      if (error instanceof EmptyClaimError) {
        // Lost the claim race — a concurrent run paid this referrer first.
        // Not an error: count it so the run summary stays honest.
        summary.skipped_concurrent += 1;
        continue;
      }
      summary.errors += 1;
      console.error(`[referral-payout] referrer ${referrerId} failed:`, error);
    }
  }

  return summary;
}
