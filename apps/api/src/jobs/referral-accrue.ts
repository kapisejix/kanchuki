// Referral commission accrual — T6 of
// docs/tasks/referral-program-retailer-affiliate.md.
//
// WHAT THIS DOES
//
// Pays the referrer in monthly installments. Every QUALIFIED or PAID
// conversion accrues one installment (paise) per calendar month — up to
// `duration_months` installments from ReferralSettings — and only for a month
// in which the referred store actually made a successful payment. T7 later
// batches the accrued amounts into payouts; this job only grows the ledger.
// At most ONE installment accrues per conversion per run, so a backlog
// drains over successive nights instead of bursting in a single run.
//
// ─── THE FOUR OWNER DECISIONS THIS JOB ENCODES (2026-09-23) ─────────────
//
// None of these were in the spec text; all were confirmed with the owner
// before code. They are restated here because this file is where a future
// reader will come looking for them:
//
//  1. THE BASE IS T5'S SNAPSHOT. `commission_base_amount` was snapshotted at
//     qualification from `Subscription.amount_inr` and is never re-read. A
//     store that upgrades mid-program does not raise the referrer's
//     commission; one that downgrades does not lower it. Same discipline as
//     the schema's "never recomputed from current settings".
//  2. MONTHLY, ON THE DAILY CRON. One installment per calendar month (IST —
//     the §42 Commission Tracker business calendar), not on qualification.
//  3. ONLY PAID MONTHS EARN. An installment accrues only for a month in which
//     the referred store made a successful payment (status 'success'). A month
//     with no payment is SKIPPED — never clawed back, nothing is ever written
//     for it — and the program simply continues in wall-time until
//     `duration_months` installments have EARNED. So a store that pays for 3
//     months, pauses, and resumes pays 3 + more installments, never more than
//     duration_months in total. The owner's own words: "after the trial the
//     retailer starts paying us, then we pay the referrer; if the retailer
//     stops paying, no payment to the referral account".
//  4. THE PER-MONTH AMOUNT FREEZES AT FIRST EARN. `commission_monthly_paise`
//     = base × commission_pct, computed once from the settings as they stand
//     at that instant, then never recomputed — an admin who halves
//     commission_pct cannot reprice months already earned, and one who raises
//     it cannot retroactively enrich them. (Migration 112's CHECKs pin the
//     freeze: the amount must exist once any month has earned.)
//
// ─── WHY PAID ROWS KEEP ACCRUING ─────────────────────────────────────────
//
// T7 moves a QUALIFIED row to PAID when a payout settles part of it — that is
// a settlement event, not the end of the program. If this job examined
// QUALIFIED rows only, every conversion would stop accruing the moment its
// first payout landed, and a 12-month program would pay exactly once. Hence
// status IN (QUALIFIED, PAID) throughout, and hence also why this job must
// never look at `paid_at`: on a PAID row that timestamp belongs to the
// referrer's payout history (T7 is its only writer), not to the accrual
// timeline.
//
// ─── WHY THE ANCHOR IS THE STORE'S FIRST PAYMENT, NOT qualified_at ───────
//
// T5 qualifies a store that has been paying for a while (the qualify gate is
// paid+active through qualify_days). Measuring month 1 from `qualified_at`
// would then start the program `qualify_days` after the store's first payment
// and silently drop the earliest earning month from consideration; measuring
// from the first payment keeps the anchor on the event the owner actually
// described — "the retailer starts paying us". Concretely: store pays from
// March, qualifies June (30-day window), duration 12 → months 1–12 are the
// store's paying months March onward. The store's FIRST payment is also the
// natural anchor for trial-then-pay: the trial months have no payment, so they
// are not month 1 — the first real charge is.
//
// The cursor math then falls out: the walk starts at the month after the
// last EARNED one — or at the store's first payment month before any earn —
// and moves forward one calendar month at a time. A month in which the store
// paid earns the installment and advances the earned count; a month it did
// not is walked past, leaving the SAME installment number available for the
// next paying month. Months already earned are never revisited — that, plus
// the compare-and-swap below, is what makes the nightly run idempotent
// without a "did I already run today" flag. Ended-but-unpaid months are
// re-walked each night (pure arithmetic, no I/O) until the program completes
// or the ceiling below parks the conversion; re-walking them is harmless
// because a past month's payments are immutable once the month has ended.
//
// ─── THE CEILING ─────────────────────────────────────────────────────────
//
// duration_months installments EARNED ends the program (accrued_months =
// duration_months → never selected again). The wall-time scan is additionally
// bounded: the job never examines a month whose calendar has not yet ended
// (a month can only earn once it is over — you cannot know a store's January
// payment picture before February), and it stops scanning a conversion's
// future after 60 skipped months (~5 years) as an anti-zombie bound. Both
// bounds are computed from settings/data, never hardcoded terms: the amount
// and the installment count come from ReferralSettings at call time, and the
// store's payment months come from its own SubscriptionPayment rows.
//
// ─── IDEMPOTENCY + CONCURRENCY ───────────────────────────────────────────
//
// The same compare-and-swap discipline as T5: every write is `updateMany`
// with the OLD state in the WHERE, inside the same transaction as its audit
// row. Two overlapping runs (or cron + manual trigger) cannot both credit the
// same month — the loser's WHERE misses and it reports the row as raced. The
// transaction also means a failed audit rolls the credit back rather than
// leaving an accrual nobody can explain.
//
// ─── WHAT THIS JOB NEVER WRITES ──────────────────────────────────────────
//
//  `paid_at`          — T7's, and the DB CHECK ties it to status PAID.
//  `payout_id`        — T7's.
//  `commission_base_amount` — T5's snapshot, read-only here.
//  Any row in PENDING or CLAWED_BACK — a PENDING conversion has earned
//  nothing by definition (its CHECK forbids accrual), and a clawed-back
//  referral is dead forever; neither is ever selected.
//
// Refunds: still unimplemented repo-wide (nothing writes
// SubscriptionPayment.status = 'refunded'), so there is no refund branch here
// — adding one would be a guard that can never fire (the RC-027 class). The
// payment-month check reads status = 'success' only.

import { prisma } from '@kanchuki/db';

/**
 * IST offset (ms) — the business calendar the §42 Commission Tracker and the
 * owner think in. Periods are YYYY-MM in IST; a "month" in this job is an IST
 * calendar month, matching how T7 will batch and how the admin will read the
 * ledger.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Rows per page. The accrual scan is small; this bounds memory like T5's. */
const BATCH_SIZE = 200;

/**
 * Ceiling on pages per run so a pathological backlog cannot make one nightly
 * run unbounded. 50 × 200 = 10,000 conversions per night — orders of
 * magnitude above a real night's work; the cursor means the remainder is
 * picked up tomorrow.
 */
const MAX_BATCHES = 50;

/**
 * Anti-zombie bound on the walk: the most consecutive unpaid calendar months
 * one conversion may present before the job parks it for the night. The
 * counter is per-run — but because the cursor only advances on an EARN, a
 * conversion parked once is parked EVERY night until its store pays in a
 * month within this bound of the last earned one. That is the deliberate
 * tradeoff: a referral whose store has not paid for ~5 years stops being
 * scanned even if the store later resurrects. The alternative — an unbounded
 * walk — lets a handful of dead referrals make every nightly run unbounded.
 * Chosen far above any real pause (a year of missed payments is 12) so it
 * can only fire on genuinely dead referrals, never a dunning pause.
 */
const MAX_CONSECUTIVE_SKIPPED_MONTHS = 60;

/** YYYY-MM (IST) for an instant. Mirrors §42's periodKey. */
export function periodKey(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The month immediately after a YYYY-MM period. Pure. */
export function nextPeriod(period: string): string {
  const [yStr, mStr] = period.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** First instant (UTC) AFTER a YYYY-MM IST month has fully ended. Pure. */
export function periodEndExclusive(period: string): Date {
  const [yStr, mStr] = period.split('-');
  // Construct the 1st of the next month in IST terms, then subtract the IST
  // offset to land in UTC. E.g. period 2026-03 → 2026-04-01T00:00 IST
  // = 2026-03-31T18:30 UTC — the first instant after March (IST) is over.
  const y = Number(yStr);
  const m = Number(mStr);
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) - IST_OFFSET_MS);
}

/** The terms T6 runs under, read from ReferralSettings at call time. */
export interface AccrualSettings {
  commission_pct: number;
  duration_months: number;
}

/**
 * Decide one conversion's accrual for this run. Pure and exported so every
 * branch is testable without a database, and so the arithmetic — the part
 * money lives in — is readable in one screen.
 *
 * The walk consumes unpaid months internally; the returned action is the
 * outcome of the whole walk:
 *  - EARN    → credit one installment for `period` (`skipped_months` were
 *              walked past to reach it)
 *  - DONE    → duration_months installments already earned; never scan again
 *  - FUTURE  → the walk reached a month that has not fully ended yet; the
 *              same months are re-walked by a later run
 *  - CEILING → too many consecutive unpaid months; the conversion is parked
 *              (its earned months stand) until its store pays again
 */
export type AccrualDecision =
  | { action: 'EARN'; period: string; monthly_amount: number; skipped_months: number }
  | { action: 'DONE' }
  | { action: 'FUTURE'; period: string; skipped_months: number }
  | { action: 'CEILING'; skipped_months: number };

/** The facts about one conversion the decision needs. */
export interface AccrualCandidate {
  id: string;
  referrer_id: string;
  referred_id: string;
  status: 'QUALIFIED' | 'PAID';
  /** T5's snapshot (paise). The base — never re-read from the subscription. */
  commission_base_amount: number;
  /** Months already EARNED (T6's own counter; 0 on a fresh QUALIFIED row). */
  accrued_months: number;
  /** The last month that EARNED (YYYY-MM), or null before the first earn. */
  accrued_through_period: string | null;
  /** The frozen per-installment amount, or null before the first earn. */
  commission_monthly_paise: number | null;
}

export interface AccrualFacts {
  /** IST YYYY-MM of the referred store's FIRST successful payment. */
  first_payment_period: string | null;
  /** IST YYYY-MMs (the store's own payment months) that had ≥1 success. */
  paid_periods: Set<string>;
  /** "Now" — the run's clock, injectable for tests. */
  now: Date;
}

export function decideAccrual(input: {
  candidate: AccrualCandidate;
  facts: AccrualFacts;
  settings: AccrualSettings;
}): AccrualDecision {
  const { candidate, facts, settings } = input;

  // Terminal: the program has paid everything it owes. Checked first so a
  // completed row leaves the scan regardless of anything else.
  if (candidate.accrued_months >= settings.duration_months) {
    return { action: 'DONE' };
  }

  // Unreachable through T5's gate (QUALIFIED requires ≥1 successful payment),
  // so reaching this line means corrupted data — fail loudly and let the
  // per-row isolation contain it rather than silently treating it as DONE.
  if (facts.first_payment_period === null) {
    throw new Error(
      `[referral-accrue] conversion ${candidate.id} is ${candidate.status} with no successful payment for its store — data integrity violation`,
    );
  }

  // The walk starts at the month after the last earned one — or at the
  // store's first payment month before any earn — and moves forward one
  // calendar month at a time.
  let period =
    candidate.accrued_through_period === null
      ? facts.first_payment_period
      : nextPeriod(candidate.accrued_through_period);
  let consecutiveSkips = 0;

  for (;;) {
    // A month can only earn once it has fully ended: you cannot know a
    // store's payment picture inside a month that is still running.
    if (periodEndExclusive(period) > facts.now) {
      return { action: 'FUTURE', period, skipped_months: consecutiveSkips };
    }

    if (facts.paid_periods.has(period)) {
      // The monthly amount freezes at the FIRST earn and is then never
      // recomputed — decision 4. On later months the frozen value wins even
      // if commission_pct has since changed.
      const monthly =
        candidate.commission_monthly_paise ??
        Math.round((candidate.commission_base_amount * settings.commission_pct) / 100);
      return { action: 'EARN', period, monthly_amount: monthly, skipped_months: consecutiveSkips };
    }

    // No payment this month: the installment number does not advance — the
    // SAME installment stays available for the next paying month (decision 3).
    consecutiveSkips += 1;
    if (consecutiveSkips >= MAX_CONSECUTIVE_SKIPPED_MONTHS) {
      return { action: 'CEILING', skipped_months: consecutiveSkips };
    }
    period = nextPeriod(period);
  }
}

/**
 * Load the payment facts for a batch of referred retailers in constant
 * round-trips: one grouped query for first-payment months, one for paid
 * months. Deliberately two queries rather than one fetch-everything: the paid
 * month set can be large across a batch, and grouping in Postgres is cheaper
 * than shipping every row to Node and grouping there.
 */
async function loadPaymentFacts(
  referredIds: string[],
): Promise<Map<string, { first: string | null; paid: Set<string> }>> {
  const result = new Map<string, { first: string | null; paid: Set<string> }>();
  if (referredIds.length === 0) return result;

  const rows = await prisma.subscriptionPayment.findMany({
    where: { retailer_id: { in: referredIds }, status: 'success' },
    select: { retailer_id: true, paid_at: true, created_at: true },
  });

  for (const r of rows) {
    // paid_at is the canonical charge instant; created_at is the fallback for
    // legacy rows written before paid_at was populated (both are set on the
    // success path today — the fallback is belt-and-braces, not a second
    // source of truth).
    const at = r.paid_at ?? r.created_at;
    const period = periodKey(at);
    const entry = result.get(r.retailer_id) ?? { first: null, paid: new Set<string>() };
    if (entry.first === null || period < entry.first) entry.first = period;
    entry.paid.add(period);
    result.set(r.retailer_id, entry);
  }

  return result;
}

export interface ReferralAccrueSummary {
  /** QUALIFIED/PAID rows examined this run. */
  scanned: number;
  /** Installments credited (a conversion may earn at most one per run). */
  earned: number;
  /** Paise credited this run — the number the owner actually cares about. */
  earned_paise: number;
  /**
   * Unpaid months walked past this run. Nothing is ever written for them —
   * they earn nothing now but may still earn later if the store resumes
   * paying; they are an observation, not an outcome.
   */
  skipped_months: number;
  /** Conversions that reached duration_months and left the scan forever. */
  completed: number;
  /** Conversions whose candidate month has not fully ended yet. */
  future: number;
  /** Conversions parked by the consecutive-skip ceiling. */
  ceiling: number;
  /** Another run credited the month first — expected under overlap. */
  raced: number;
  /** Rows whose transaction threw; isolated per row like T5. */
  errors: number;
  /** True when the page ceiling stopped the run early. */
  truncated: boolean;
}

/**
 * Accrue one installment per eligible conversion for this run. Returns a
 * summary rather than a bare count, so the caller's log line distinguishes
 * "nothing was due" from "nothing could earn" — the two situations that look
 * identical in a number and need opposite responses.
 */
export async function handleReferralAccrue(
  opts: { now?: Date; batchSize?: number } = {},
): Promise<ReferralAccrueSummary> {
  const now = opts.now ?? new Date();
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  const summary: ReferralAccrueSummary = {
    scanned: 0,
    earned: 0,
    earned_paise: 0,
    skipped_months: 0,
    completed: 0,
    future: 0,
    ceiling: 0,
    raced: 0,
    errors: 0,
    truncated: false,
  };

  const settingsRow = await prisma.referralSettings.findUnique({ where: { id: 'singleton' } });
  // The singleton is seeded by migration 109, so a missing row is an
  // environment fault, not a runtime condition — fail loudly rather than
  // inventing fallback terms in code (the spec's "nothing hardcoded" rule
  // cuts both ways: no code constants, and no silent defaults either).
  if (!settingsRow) {
    throw new Error(
      '[referral-accrue] referral_settings singleton missing — was migration 109 applied?',
    );
  }
  const settings: AccrualSettings = {
    commission_pct: settingsRow.commission_pct,
    duration_months: settingsRow.duration_months,
  };

  let cursor: string | undefined;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const candidates = await prisma.referralConversion.findMany({
      where: {
        // PAID rows keep accruing — see the header. PENDING and CLAWED_BACK
        // are never selected: the former has earned nothing by definition,
        // the latter is dead forever.
        status: { in: ['QUALIFIED', 'PAID'] },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: {
        id: true,
        referrer_id: true,
        referred_id: true,
        status: true,
        commission_base_amount: true,
        accrued_months: true,
        accrued_through_period: true,
        commission_monthly_paise: true,
      },
    });

    if (candidates.length === 0) break;
    cursor = candidates[candidates.length - 1]?.id;
    summary.scanned += candidates.length;

    const paymentFacts = await loadPaymentFacts(candidates.map((c) => c.referred_id));

    for (const candidate of candidates) {
      const facts = paymentFacts.get(candidate.referred_id) ?? {
        first: null,
        paid: new Set<string>(),
      };

      // The WHERE clause already narrowed status to QUALIFIED|PAID, but
      // Prisma's select still carries the full enum — narrow it explicitly so
      // decideAccrual's signature states the precondition the scan enforces.
      if (candidate.status !== 'QUALIFIED' && candidate.status !== 'PAID') {
        summary.raced += 1;
        continue;
      }
      const accruedCandidate: AccrualCandidate = { ...candidate, status: candidate.status };

      // The decision is isolated from the write so a data-integrity throw in
      // one conversion's arithmetic does not abandon the rest of the night.
      let decision: AccrualDecision;
      try {
        decision = decideAccrual({
          candidate: accruedCandidate,
          facts: { first_payment_period: facts.first, paid_periods: facts.paid, now },
          settings,
        });
      } catch (error) {
        summary.errors += 1;
        console.error(`[referral-accrue] decision failed for conversion ${candidate.id}:`, error);
        continue;
      }

      switch (decision.action) {
        case 'DONE':
          summary.completed += 1;
          continue;
        case 'FUTURE':
          summary.future += 1;
          summary.skipped_months += decision.skipped_months;
          continue;
        case 'CEILING':
          summary.ceiling += 1;
          summary.skipped_months += decision.skipped_months;
          continue;
        case 'EARN':
          summary.skipped_months += decision.skipped_months;
          break;
      }

      try {
        const credited = await applyAccrual({
          candidate: accruedCandidate,
          decision,
          settings,
        });
        if (!credited) {
          summary.raced += 1;
          continue;
        }
        summary.earned += 1;
        summary.earned_paise += decision.monthly_amount;
      } catch (error) {
        // Isolated per row: one broken conversion must not abandon the
        // night's remaining work. Counted AND logged, because a silent error
        // here is a referrer who quietly stops earning.
        summary.errors += 1;
        console.error(
          `[referral-accrue] accrual failed for conversion ${candidate.id} (month ${decision.period}):`,
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
 * The compare-and-swap, with its audit row in the same transaction — the
 * same two properties that make T5 safe:
 *  - the OLD state is in the WHERE (status, accrued_months, and — critically —
 *    `accrued_through_period`), so Postgres re-evaluates it under the row lock
 *    and of two concurrent runs exactly one gets count 1;
 *  - the audit row shares the transaction, so the credit never lands without
 *    a trace, and a failed audit rolls the credit back for tomorrow's run.
 *
 * Returns false when the row moved underneath us (raced or already advanced).
 */
async function applyAccrual(input: {
  candidate: AccrualCandidate;
  decision: Extract<AccrualDecision, { action: 'EARN' }>;
  settings: AccrualSettings;
}): Promise<boolean> {
  const { candidate, decision, settings } = input;
  const monthly = decision.monthly_amount;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.referralConversion.updateMany({
      where: {
        id: candidate.id,
        status: { in: ['QUALIFIED', 'PAID'] },
        accrued_months: candidate.accrued_months,
        // The cursor is part of the compare-and-swap: if another run already
        // advanced it (credited this or a later month), count comes back 0.
        accrued_through_period: candidate.accrued_through_period,
      },
      data: {
        accrued_months: candidate.accrued_months + 1,
        accrued_through_period: decision.period,
        commission_accrued: { increment: monthly },
        // Frozen at first earn: when this is the first installment, write the
        // amount; on later months it is already set and must not change.
        ...(candidate.commission_monthly_paise === null
          ? { commission_monthly_paise: monthly }
          : {}),
      },
    });

    if (updated.count === 0) return false;

    await tx.auditLog.create({
      data: {
        actor_type: 'system',
        actor_id: null,
        action: 'REFERRAL_COMMISSION_ACCRUED',
        resource_type: 'ReferralConversion',
        resource_id: candidate.id,
        metadata: {
          referrer_id: candidate.referrer_id,
          referred_id: candidate.referred_id,
          period: decision.period,
          monthly_amount: monthly,
          accrued_months: candidate.accrued_months + 1,
          duration_months_total: settings.duration_months,
          first_accrual: candidate.commission_monthly_paise === null,
        },
        ip_address: null,
      },
    });

    return true;
  });
}
