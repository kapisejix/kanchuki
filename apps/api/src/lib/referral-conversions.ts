// Affiliate referral capture — T4 of
// docs/tasks/referral-program-retailer-affiliate.md.
//
// WHAT THIS DOES
//
// Turns a code a signup typed into a `ReferralConversion` row, and gives the
// referred store its side of the deal. It is the write half of T3's namespace
// split: `classifyReferralCode()` decides WHICH ledger a code belongs to, and
// this file only ever handles the AFFILIATE one. F-018 staff attribution stays
// exactly where it was, in routes/retailers/retailers-profile.ts, resolving
// `TeamMember.referral_code` → `onboarded_by_id`.
//
// WHY IT SHARES A FIELD WITH F-018
//
// Onboarding sends ONE opaque `referral_code` string. Making the affiliate
// program work therefore costs no mobile change at all — which matters right
// now, because the Play Console build is in review. The field already travels;
// this only adds a second, shape-decided destination for it.
//
// FOUR GUARDS, EACH FOR A DIFFERENT WAY THE PROGRAM COULD PAY THE WRONG PERSON
//
//  1. Shape decides the ledger, never lookup order. A staff-shaped code returns
//     NOT_AFFILIATE and is left to F-018 — resolution order would silently pick
//     who gets paid and nothing would ever report a mistake (RC-027's shape).
//  2. Self-referral is refused. The spec asks for "same GSTIN/phone/bank"; there
//     is no bank-account column on `Retailer`, so this checks phone and GSTIN and
//     says so rather than implying a third check exists.
//  3. One attribution, and staff wins (owner decision 2026-09-22). A shop a
//     marketing agent already onboarded (`onboarded_by_id` set) never also
//     becomes an affiliate conversion — one signup pays once.
//  4. `referred_id` is UNIQUE, and that constraint is the idempotency gate, not
//     a `findFirst` check: a concurrent double-submit loses the insert, and the
//     bonus is applied in the same transaction as the row that earned it, so
//     there can be neither a conversion without its bonus nor a bonus twice.
//
// NOTHING HERE IS A TERM. `qualify_days` and the referred-side bonus both come
// from the settings row at call time.

import { type Prisma, prisma } from '@kanchuki/db';
import { classifyReferralCode } from './referral-codes.js';
import { loadReferralSettings } from './referral-settings.js';

/**
 * What happened to a submitted code. Every rejection is a NAMED outcome rather
 * than a boolean, because callers report it and tests pin it — and because
 * "silently ignored" is how the F-018 field lost a whole class of typos.
 */
export type ReferralCaptureStatus =
  /** Staff-shaped or empty — F-018's ledger, not ours. */
  | 'NOT_AFFILIATE'
  /** Affiliate-shaped but malformed (e.g. the hyphen was dropped). Never looked up. */
  | 'INVALID_CODE'
  /** Well-formed but no such code. */
  | 'UNKNOWN_CODE'
  /** The code exists but was disabled by its owner. */
  | 'INACTIVE_CODE'
  /** The referrer is the referred, by phone, GSTIN or identity. */
  | 'SELF_REFERRAL'
  /** Already attributed — to a staff agent, or by an earlier conversion row. */
  | 'ALREADY_ATTRIBUTED'
  /** A `pending` conversion now exists. */
  | 'RECORDED';

/**
 * What the CALLER reports, which is one outcome wider than this file returns.
 *
 * `applyReferralCapture` throws on a database error rather than returning —
 * deliberately, because a capture that failed silently is a shop that was
 * referred and a referrer who is never paid. The profile route converts that
 * throw into `CAPTURE_FAILED`: the save must not fail (the code is one optional
 * field of a general profile write, and 500ing would block a shop from finishing
 * onboarding over a code it can simply remove), but the outcome also must not be
 * swallowed, so it is reported here AND logged. Exported as a type so the next
 * consumer (T5's qualify gate) reads the same contract instead of re-deriving it.
 */
export type ReferralCaptureReport = ReferralCaptureStatus | 'CAPTURE_FAILED';

/** What the referred store received, if anything. */
export type ReferralReward =
  | { kind: 'FREE_MONTH'; months: number; trial_ends_at: string }
  | { kind: 'NONE' }
  /**
   * A bonus type the code cannot honour. Reachable only for a row written
   * outside the admin API (the API refuses FLAT_DISCOUNT — it has no rail), and
   * reported LOUDLY rather than ignored: a config value the code silently drops
   * is the RC-027 failure, and this is the one place it could still happen.
   */
  | { kind: 'UNSUPPORTED'; bonus_type: string };

export interface ReferralCaptureResult {
  status: ReferralCaptureStatus;
  /** Present only on RECORDED. */
  conversion_id?: string;
  referrer_id?: string;
  qualifies_at?: string;
  reward?: ReferralReward;
}

/**
 * Add N calendar months, clamped to the target month's length.
 *
 * Calendar months, not `days * 30` — "one free month" on the 31st means the last
 * day of the next month, not three days into the one after it. Never extends
 * from a trial that already lapsed: the bonus is worth the same whether it is
 * applied on day 1 or day 20, so the base is whichever is later.
 */
export function addCalendarMonths(from: Date, months: number, now: Date = new Date()): Date {
  const base = from.getTime() > now.getTime() ? from : now;
  const result = new Date(base);
  const day = result.getUTCDate();
  // Move to the 1st first: setting the month on the 31st otherwise overflows
  // into the month after next (Jan 31 + 1 month → Mar 3), silently granting a
  // month and two days.
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDayOfMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDayOfMonth));
  return result;
}

/**
 * The GSTIN comparison. Case- and whitespace-insensitive, and an empty string is
 * treated as absent — `gstin` is nullable on `Retailer` and the profile route
 * stores `''` as NULL, but a legacy row could still carry a blank, and two blanks
 * are not "the same GSTIN".
 */
function sameGstin(a: string | null, b: string | null): boolean {
  const norm = (v: string | null) => (v ?? '').replace(/\s+/g, '').toUpperCase();
  const left = norm(a);
  const right = norm(b);
  return left !== '' && left === right;
}

/**
 * Give the referred store its side of the deal, inside the caller's transaction.
 *
 * FREE_MONTH extends `trial_ends_at` — the same operation an admin performs from
 * the retailer detail screen, so a bonus and a manual extension are the same
 * kind of change to the same column. `plan_status` is deliberately NOT forced to
 * TRIAL (the admin route does that): a store that already paid during onboarding
 * must not be downgraded to a trial by a referral code, and the capture window
 * is exactly the onboarding profile write.
 */
async function applyReferredBonus(
  tx: Prisma.TransactionClient,
  retailerId: string,
  settings: { referred_bonus_type: string; referred_bonus_value: number },
  currentTrialEndsAt: Date | null,
  now: Date,
): Promise<ReferralReward> {
  if (settings.referred_bonus_type === 'NONE') return { kind: 'NONE' };

  if (settings.referred_bonus_type === 'FREE_MONTH') {
    const months = settings.referred_bonus_value;
    if (months < 1) return { kind: 'NONE' };
    // `now` is threaded through from the caller rather than read here. The
    // capture already treats `now` as the instant the referral happened — using
    // wall-clock time for the bonus and the injected one for `qualifies_at`
    // would mean two different referral moments in one transaction, and the
    // reward would be the only part of the operation whose result a caller
    // cannot pin. A null `trial_ends_at` (no trial row yet) counts from that
    // same instant.
    const extended = addCalendarMonths(currentTrialEndsAt ?? now, months, now);
    await tx.retailer.update({
      where: { id: retailerId },
      data: { trial_ends_at: extended },
    });
    return { kind: 'FREE_MONTH', months, trial_ends_at: extended.toISOString() };
  }

  return { kind: 'UNSUPPORTED', bonus_type: settings.referred_bonus_type };
}

/**
 * Record an affiliate referral for `referredRetailerId`, if one is warranted.
 *
 * Never throws for a business condition — every refusal is a status. It CAN
 * throw if the database is unreachable, and that is intentional: a capture that
 * failed silently would be a shop that was referred and no referrer ever paid.
 */
export async function applyReferralCapture(input: {
  referredRetailerId: string;
  code: string | null | undefined;
  now?: Date;
}): Promise<ReferralCaptureResult> {
  const now = input.now ?? new Date();
  if (!input.code) return { status: 'NOT_AFFILIATE' };

  const classified = classifyReferralCode(input.code);
  // STAFF → F-018 owns it. INVALID → report a malformed affiliate code rather
  // than falling through to the staff table, which is the wrong-ledger lookup
  // T3's classifier exists to prevent.
  if (classified.kind === 'STAFF') return { status: 'NOT_AFFILIATE' };
  if (classified.kind === 'INVALID') return { status: 'INVALID_CODE' };

  const [referred, codeRow] = await Promise.all([
    prisma.retailer.findUnique({
      where: { id: input.referredRetailerId },
      select: {
        id: true,
        phone: true,
        gstin: true,
        onboarded_by_id: true,
        trial_ends_at: true,
      },
    }),
    prisma.referralCode.findUnique({
      where: { code: classified.code },
      select: {
        retailer_id: true,
        is_active: true,
        retailer: { select: { id: true, phone: true, gstin: true, deleted_at: true } },
      },
    }),
  ]);

  if (!referred) return { status: 'UNKNOWN_CODE' };
  if (!codeRow) return { status: 'UNKNOWN_CODE' };
  if (!codeRow.is_active) return { status: 'INACTIVE_CODE' };
  // A closed or soft-deleted shop must not keep earning on new signups — its own
  // rows are on the purge path (migration 109's RESTRICT FKs), and credit that
  // lands there can never be paid out.
  if (codeRow.retailer.deleted_at) return { status: 'UNKNOWN_CODE' };
  // One attribution, and staff wins: a shop a marketing agent already onboarded
  // does not also become an affiliate conversion.
  if (referred.onboarded_by_id) return { status: 'ALREADY_ATTRIBUTED' };

  const referrer = codeRow.retailer;
  const selfReferral =
    referrer.id === input.referredRetailerId ||
    referrer.phone === referred.phone ||
    sameGstin(referrer.gstin, referred.gstin);
  if (selfReferral) {
    // Refused SILENTLY to the client — a referral code is one field of a general
    // profile save, and throwing would block a shop from saving its own name
    // because of a bad code it can simply remove. But this is an abuse signal,
    // unlike a typo, so it leaves a trace: `UNKNOWN_CODE`/`INVALID_CODE` do not.
    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: referred.id,
        action: 'REFERRAL_SELF_REFERRAL_BLOCKED',
        resource_type: 'Retailer',
        resource_id: referred.id,
        metadata: { referrer_id: referrer.id, code: classified.code },
      },
    });
    return { status: 'SELF_REFERRAL' };
  }

  const settings = await loadReferralSettings();
  const qualifiesAt = new Date(now.getTime() + settings.qualify_days * 24 * 60 * 60 * 1000);

  try {
    return await prisma.$transaction(async (tx) => {
      const conversion = await tx.referralConversion.create({
        data: {
          referrer_id: referrer.id,
          referred_id: referred.id,
          status: 'PENDING',
          qualifies_at: qualifiesAt,
        },
        select: { id: true },
      });

      // Same transaction as the row that earned it: a conversion with no reward,
      // or a reward applied twice, are both unreachable from here.
      const reward = await applyReferredBonus(
        tx,
        referred.id,
        settings,
        referred.trial_ends_at,
        now,
      );

      await tx.auditLog.create({
        data: {
          actor_type: 'retailer',
          actor_id: referred.id,
          action: 'REFERRAL_CAPTURED',
          resource_type: 'ReferralConversion',
          resource_id: conversion.id,
          metadata: {
            referrer_id: referrer.id,
            qualifies_at: qualifiesAt.toISOString(),
            reward: reward.kind,
            ...(reward.kind === 'FREE_MONTH' ? { months: reward.months } : {}),
            ...(reward.kind === 'UNSUPPORTED' ? { unsupported_bonus_type: reward.bonus_type } : {}),
          },
          ip_address: null,
        },
      });

      return {
        status: 'RECORDED' as const,
        conversion_id: conversion.id,
        referrer_id: referrer.id,
        qualifies_at: qualifiesAt.toISOString(),
        reward,
      };
    });
  } catch (error) {
    // P2002 on `referred_id` means a conversion already exists — a retry, or a
    // concurrent double-submit that lost the race. That is the idempotent
    // success case, not an error, and crucially it must NOT re-apply the bonus:
    // this is why the reward lives inside the transaction that lost.
    if (isUniqueViolation(error)) return { status: 'ALREADY_ATTRIBUTED' };
    throw error;
  }
}

/** Prisma's unique-constraint error, without importing the client internals. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
