// Referral qualification — T5 of
// docs/tasks/referral-program-retailer-affiliate.md.
//
// WHAT THIS DOES
//
// Moves every due PENDING conversion to its terminal-for-now status:
//
//   QUALIFIED    the referred store paid AND is active → the referrer has
//                earned a commission on it
//   CLAWED_BACK  the referral is dead (store deleted, or it paid and then
//                churned inside the qualify window) → nothing ever accrues
//   (stays PENDING)  not there yet — re-examined tomorrow night
//
// Run nightly from the maintenance queue. T5 is the ONLY writer of
// `qualified_at` / `clawed_back_at`; T6 accrues on QUALIFIED rows and T7 pays
// them, so a row that never leaves PENDING never costs anyone anything.
//
// ─── WHERE THE DAY COUNT IS ──────────────────────────────────────────────
//
// This job contains no day count, no literal and no settings read for one, and
// that is the design rather than an omission. `qualifies_at` is stamped at
// SIGNUP by T4 from `qualify_days` (referral-conversions.ts), and the schema says
// exactly that: "computed at signup by T4 and enforced nightly by T5". So the
// rule the spec asks for — "read the window from settings, not a hardcoded 30" —
// is satisfied one layer up, and restating the arithmetic here would create a
// second answer to "when is this due?".
//
// The consequence is deliberate and worth stating: an admin who changes
// `qualify_days` changes conversions created AFTER that edit, not ones already
// pending. `qualifies_at` is the record of the terms in effect when the referral
// happened — the same snapshot discipline as `commission_base_amount` below, and
// it means a referrer who was told "30 days" cannot have it silently become 7.
//
// ─── THE THREE WAYS THIS COULD PAY THE WRONG AMOUNT ──────────────────────
//
//  1. `paid_at` is NOT stamped here, though everything about the word suggests
//     it should be. The DB CHECK forbids it: QUALIFIED requires `paid_at IS
//     NULL`. It is the date the REFERRER was paid out (T7), not the date the
//     referred store paid us. Writing it here is a constraint violation, and
//     the constraint is the only reason that is obvious.
//  2. `commission_accrued` is NOT touched — T6's column, and the schema says so.
//     T5 snapshots only the BASE.
//  3. `commission_base_amount` is taken from `Subscription.amount_inr`, which the
//     schema documents as paise, same unit as this column. No `* 100`: the field
//     is named "_inr" and IS paise, which is the kind of unit mismatch that
//     multiplies a payout by 100 without failing anything.
//
// ─── REFUNDS: WHAT A REFUND DOES HERE, AND WHAT IT DELIBERATELY DOES NOT ──
//
// Until §5A.1 nothing in the repo could write `SubscriptionPayment.status =
// 'refunded'`, so the question could not arise. It can now, and the owner
// decided it on 2026-09-24: **a refund stops FUTURE earning; it never claws
// back.** No branch was added for it, and this is why none is needed:
//
//   refund BEFORE qualification  → `hasSuccessfulPayment` (the grouped query
//                                  below, `status: 'success'`) goes false, so
//                                  the gate returns WAIT / NOT_PAID. The store
//                                  simply never qualifies — and if it pays
//                                  again inside its window, it still can.
//   refund AFTER qualification   → nothing happens AT ALL, by construction:
//                                  this job selects `status: 'PENDING'` rows
//                                  only, so a QUALIFIED/PAID conversion is
//                                  never re-examined. Installments already
//                                  accrued stand; future months stop earning
//                                  (T6's paid-month whitelist).
//
// The board's original proposal was `refund → CLAWED_BACK`. Rejected on the
// same ground as RC-033: the clawback is irreversible while a refund's *cause*
// is not always a churn (a billing dispute, a duplicate charge, a plan
// correction) — and once T7 has paid installments out, a clawback would mean
// recovering real money from the referrer. The lenient direction leaves an
// uncollected accrual, which a future rule can still act on; the strict one
// cannot be undone. The cost is stated rather than hidden: a referrer keeps
// commission on revenue later handed back.
//
// ─── WHY EACH BRANCH IS REACHABLE (AND ONE DELIBERATELY IS NOT) ──────────
//
// A guard that can never fire is worse than no guard, because it reads as
// coverage. So each transition has a real input that produces it, and the two
// states that LOOK like churn but are recoverable are deliberately left PENDING
// rather than written to an irreversible status:
//
//   deleted store                  → CLAWED_BACK (purge is scheduled; it can
//                                    never qualify)
//   paid, then cancelled           → CLAWED_BACK (the spec's "churns inside the
//                                    window, no commission accrues")
//   paid, then COMPLETED           → stays PENDING. A term that ran its full
//                                    course is not churn — the retailer paid
//                                    and stopped — so this must NOT take the
//                                    clawback branch above it (owner ruling
//                                    2026-09-24, RC-033). Note the consequence
//                                    it also accepts: completion is not a
//                                    qualification either, because the gate
//                                    below wants a still-ACTIVE subscription.
//                                    A conversion that reaches this state was
//                                    never qualified during the whole term,
//                                    so nothing had accrued to lose — but it
//                                    is worth knowing that this path pays
//                                    nothing rather than assuming otherwise.
//   suspended (F-015)              → stays PENDING. Suspension is REVERSIBLE —
//                                    `unsuspend` exists — and an irreversible
//                                    clawback on a reversible state would
//                                    punish an admin's temporary action.
//   PAST_DUE                       → stays PENDING. Dunning is recoverable; a
//                                    card retry must not end a referral.
//   cancelled but NEVER paid       → stays PENDING. There was no value to lose,
//                                    and if the store resubscribes and pays
//                                    inside its window it can still qualify.
//
// The cost of that conservatism is that a conversion whose store never pays sits
// PENDING indefinitely. Nothing accrues and nothing is owed, so it is inert — but
// it is reported in the summary rather than left invisible.
//
// ─── IDEMPOTENCY ─────────────────────────────────────────────────────────
//
// Every write is a compare-and-swap: `updateMany` with `status: 'PENDING'` in the
// WHERE, inside the same transaction as its audit row. Two overlapping runs (or a
// nightly cron plus a manual trigger) cannot both transition a row — the loser
// sees count 0 — and no run can clobber a row an admin changed in between. The
// READ-then-WRITE version of this would be correct only if runs never overlap,
// which is not a property cron gives you.

import { prisma } from '@kanchuki/db';

/** Rows per page. The work is a small scan of PENDING rows; this bounds memory. */
const BATCH_SIZE = 200;

/**
 * Ceiling on pages per run, so a pathological backlog cannot make one nightly run
 * unbounded. 50 x 200 = 10,000 conversions — orders of magnitude above a real
 * night's due work, and the cursor means the remainder is simply picked up
 * tomorrow.
 */
const MAX_BATCHES = 50;

export interface ReferralQualifySummary {
  /** PENDING rows whose `qualifies_at` had passed and were examined. */
  scanned: number;
  /** Moved to QUALIFIED. */
  qualified: number;
  /** Moved to CLAWED_BACK. */
  clawed_back: number;
  /**
   * Examined but not eligible: no successful payment, suspended, PAST_DUE, or a
   * never-paid cancellation. Includes the inert never-paid case explicitly, so
   * "the ledger is not shrinking" is observable instead of guessed at.
   */
  not_yet_eligible: number;
  /** Another run transitioned the row first — expected under overlap, not an error. */
  raced: number;
  /** Rows whose transaction threw. Isolated per row so one bad store cannot stop the night. */
  errors: number;
  /** True when the page ceiling stopped the run early. */
  truncated: boolean;
}

/** What the gate decided for one conversion. */
export type QualificationDecision =
  | { outcome: 'QUALIFY'; base_amount: number }
  | {
      outcome: 'CLAW_BACK';
      reason: 'REFERRED_DELETED' | 'REFERRED_CHURNED_AFTER_PAYMENT';
    }
  | {
      outcome: 'WAIT';
      reason: 'NOT_PAID' | 'SUSPENDED' | 'NO_ACTIVE_SUBSCRIPTION' | 'PAST_DUE_REVIEW';
    };

/** The subscription facts the gate needs. */
export interface ReferredSubscriptionFacts {
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'COMPLETED';
  /** Paise, ex-GST — the recurring base the commission is computed from. */
  amount_inr: number;
}

/**
 * Decide one conversion. Pure and exported, so every branch is testable without a
 * database and so the rule is readable in one screen.
 *
 * Order matters and is the whole substance of the function: the `NOT_PAID` gate
 * comes before the churn branch specifically so a store that cancelled without
 * ever paying lands in WAIT, not in an irreversible CLAWED_BACK.
 */
export function decideQualification(input: {
  referred: {
    deleted_at: Date | null;
    is_suspended: boolean;
    subscriptions: ReferredSubscriptionFacts[];
  };
  /** A `SubscriptionPayment` with status `success` exists for this retailer. */
  hasSuccessfulPayment: boolean;
}): QualificationDecision {
  const { referred } = input;

  // Terminal and irreversible — a soft-deleted store is on the purge path and can
  // never become paid and active inside its window. Checked first because it is
  // the one state where "there is no future here" is certain, regardless of what
  // the billing rows say.
  if (referred.deleted_at) {
    return { outcome: 'CLAW_BACK', reason: 'REFERRED_DELETED' };
  }

  // Nothing was ever earned, so there is nothing to claw back. A store that
  // cancelled a free trial before paying stays eligible: if it resubscribes and
  // pays inside its window, the referrer is still paid. This gate must stay
  // ABOVE the churn branch.
  if (!input.hasSuccessfulPayment) {
    return { outcome: 'WAIT', reason: 'NOT_PAID' };
  }

  // Reversible (F-015 ships an unsuspend), so it blocks qualification for now
  // without ending the referral.
  if (referred.is_suspended) {
    return { outcome: 'WAIT', reason: 'SUSPENDED' };
  }

  // The newest ACTIVE subscription is the one being commissioned, and its amount
  // is what gets snapshotted.
  const active = referred.subscriptions.find((s) => s.status === 'ACTIVE');
  if (active) {
    return { outcome: 'QUALIFY', base_amount: active.amount_inr };
  }

  // Paid, no active subscription, and a cancellation on record: this is the
  // spec's churn case, and it has a real value to lose.
  //
  // CANCELLED only, deliberately — `COMPLETED` must NOT reach this branch
  // (RC-033, owner ruling 2026-09-24: a term that ran its full course is not
  // churn, and this transition is irreversible by design). A completed term
  // falls through to the PAST_DUE/NO_ACTIVE_SUBSCRIPTION wait below, so this
  // referral is not ended and nothing already accrued is taken back.
  //
  // Edge case, decided rather than inherited: a store that has BOTH a
  // historical CANCELLED row and a later COMPLETED one still claws back — it
  // did cancel at some point, and `some()` is on the whole history. Pinned by
  // test so the reading is visible to whoever revisits this.
  if (referred.subscriptions.some((s) => s.status === 'CANCELLED')) {
    return { outcome: 'CLAW_BACK', reason: 'REFERRED_CHURNED_AFTER_PAYMENT' };
  }

  // Paid but neither active nor cancelled — PAST_DUE, or an inconsistent billing
  // state. Recoverable, so it waits rather than ending the referral; the reason
  // distinguishes it from "never paid" in the logs.
  return {
    outcome: 'WAIT',
    reason: referred.subscriptions.some((s) => s.status === 'PAST_DUE')
      ? 'PAST_DUE_REVIEW'
      : 'NO_ACTIVE_SUBSCRIPTION',
  };
}

/**
 * Retailers in this batch with at least one successful charge, in ONE query.
 *
 * Deliberately not a nested `include` with a filter: a payment filter inside the
 * per-candidate include would either be per-row (N+1) or would need filtering on
 * a relation Prisma does not expose filtered counts for. One grouped query over
 * the batch keeps the run at a constant number of round-trips per page.
 */
async function loadPaidRetailerIds(retailerIds: string[]): Promise<Set<string>> {
  if (retailerIds.length === 0) return new Set();
  // A WHITELIST, and it is load-bearing for refunds (§5A.1/§5A.2): once the
  // webhook started writing `status = 'refunded'`, this filter is what makes a
  // refunded qualifying payment read as "never paid" — so the referral waits
  // rather than qualifying off money that was handed back. A blacklist
  // (`status: { not: 'refunded' }`) would instead count a FAILED charge as a
  // paid one, and would silently accept whatever status is invented next.
  const rows = await prisma.subscriptionPayment.findMany({
    where: { retailer_id: { in: retailerIds }, status: 'success' },
    select: { retailer_id: true },
    distinct: ['retailer_id'],
  });
  return new Set(rows.map((r) => r.retailer_id));
}

/**
 * Transition every due PENDING conversion. Returns a summary rather than a bare
 * count, so the caller's log line distinguishes "nothing was due" from "everything
 * was due and none of it qualified" — the two situations that look identical in a
 * number and need opposite responses.
 *
 * `now` is injectable so the gate is pinnable in tests; it also becomes the
 * transition timestamp, so `qualified_at` is never a different instant from the
 * one that decided the row was due.
 */
export async function handleReferralQualify(
  opts: { now?: Date; batchSize?: number } = {},
): Promise<ReferralQualifySummary> {
  const now = opts.now ?? new Date();
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  const summary: ReferralQualifySummary = {
    scanned: 0,
    qualified: 0,
    clawed_back: 0,
    not_yet_eligible: 0,
    raced: 0,
    errors: 0,
    truncated: false,
  };

  let cursor: string | undefined;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const candidates = await prisma.referralConversion.findMany({
      where: {
        status: 'PENDING',
        qualifies_at: { lte: now },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      // `id ASC` with a cursor: a stable order that does not shift when rows
      // transition underneath us.
      orderBy: { id: 'asc' },
      take: batchSize,
      select: {
        id: true,
        referrer_id: true,
        referred_id: true,
        referred: {
          select: {
            id: true,
            deleted_at: true,
            is_suspended: true,
            subscriptions: {
              orderBy: { created_at: 'desc' },
              select: { status: true, amount_inr: true },
            },
          },
        },
      },
    });

    if (candidates.length === 0) break;
    cursor = candidates[candidates.length - 1]?.id;
    summary.scanned += candidates.length;

    const paidIds = await loadPaidRetailerIds(candidates.map((c) => c.referred_id));

    for (const candidate of candidates) {
      const decision = decideQualification({
        referred: candidate.referred,
        hasSuccessfulPayment: paidIds.has(candidate.referred_id),
      });

      if (decision.outcome === 'WAIT') {
        summary.not_yet_eligible++;
        continue;
      }

      try {
        const transitioned = await applyTransition({
          conversionId: candidate.id,
          referrerId: candidate.referrer_id,
          referredId: candidate.referred_id,
          decision,
          now,
        });

        if (!transitioned) {
          summary.raced++;
          continue;
        }
        if (decision.outcome === 'QUALIFY') summary.qualified++;
        else summary.clawed_back++;
      } catch (error) {
        // Isolated per row: one store with a broken relation must not abandon the
        // rest of the night's work. Counted AND logged, because a silent error
        // here is a referral that quietly never qualifies.
        summary.errors++;
        console.error(
          `[referral-qualify] transition failed for conversion ${candidate.id} (${decision.outcome}):`,
          error,
        );
      }
    }

    if (candidates.length < batchSize) break;
    if (batch === MAX_BATCHES - 1) summary.truncated = true;
  }

  return summary;
}

/**
 * The compare-and-swap, with its audit row in the same transaction.
 *
 * Two things make this safe rather than merely likely-correct:
 *  - `status: 'PENDING'` in the WHERE. Postgres re-evaluates it under the row
 *    lock, so of two concurrent runs exactly one gets count 1 and the other gets
 *    0 — no read-then-write window exists to lose.
 *  - the audit row shares the transaction, so the status never moves without a
 *    trace, and a failed audit rolls the status back to PENDING for tomorrow
 *    instead of leaving a transition nobody can explain.
 *
 * Returns false when the row was no longer PENDING (already handled elsewhere).
 */
async function applyTransition(input: {
  conversionId: string;
  referrerId: string;
  referredId: string;
  decision: Exclude<QualificationDecision, { outcome: 'WAIT' }>;
  now: Date;
}): Promise<boolean> {
  const { decision, now } = input;

  return prisma.$transaction(async (tx) => {
    const updated =
      decision.outcome === 'QUALIFY'
        ? await tx.referralConversion.updateMany({
            where: { id: input.conversionId, status: 'PENDING' },
            data: {
              status: 'QUALIFIED',
              qualified_at: now,
              // Snapshotted, never recomputed: a later plan change must not
              // retroactively move an amount the referrer has already earned.
              commission_base_amount: decision.base_amount,
              // `paid_at` and `commission_accrued` are deliberately absent —
              // see the header. The CHECK constraint enforces paid_at.
            },
          })
        : await tx.referralConversion.updateMany({
            where: { id: input.conversionId, status: 'PENDING' },
            // Only `clawed_back_at` is required by the CHECK here, so a clawback
            // after payout (paid_at still set) remains legal without this branch
            // having to know about the payout.
            data: { status: 'CLAWED_BACK', clawed_back_at: now },
          });

    if (updated.count === 0) return false;

    await tx.auditLog.create({
      data: {
        actor_type: 'system',
        actor_id: null,
        action: decision.outcome === 'QUALIFY' ? 'REFERRAL_QUALIFIED' : 'REFERRAL_CLAWED_BACK',
        resource_type: 'ReferralConversion',
        resource_id: input.conversionId,
        metadata: {
          referrer_id: input.referrerId,
          referred_id: input.referredId,
          ...(decision.outcome === 'QUALIFY'
            ? {
                commission_base_amount: decision.base_amount,
                base_source: 'Subscription.amount_inr',
              }
            : { reason: decision.reason }),
        },
        ip_address: null,
      },
    });

    return true;
  });
}
