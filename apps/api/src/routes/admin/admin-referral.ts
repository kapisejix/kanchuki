// Retailer referral program settings — T2 of
// docs/tasks/referral-program-retailer-affiliate.md.
//
// Singleton, admin-editable terms for the retailer → retailer affiliate
// program. GET + PUT only: migration 109 seeds the single row, so there is
// nothing to create and nothing to delete (which is also why no route here
// needs the purge client).
//
// NOTHING IN THIS FILE IS A TERM. Commission %, duration, qualify days, bonus,
// payout minimum and cadence all live in the referral_settings row — T1's whole
// point is that they never appear as literals in application code. The zod
// bounds below are guards on what the system can act on, not the values.
//
// Every enum-like column is validated against the exact set the consuming code
// branches on (RC-027), and the cross-field rules mirror the DB CHECKs from
// migration 109, so bad admin input returns a clean 422 naming the field
// instead of a Postgres 23514.
import type { FastifyPluginAsync } from 'fastify';

import { type Prisma, prisma } from '@kanchuki/db';
import { z } from 'zod';
import { type ReferralSettingsRow, loadReferralSettings } from '../../lib/referral-settings.js';
import { validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

// The singleton id lives with the loader in lib/referral-settings.ts.

// The vocabulary the consuming tasks actually branch on: T4 applies the
// referred-side bonus, T5 the qualify gate, T6 the commission, T7 the payout
// cron. A value outside these sets must be rejected loudly — never stored and
// then silently ignored, which is exactly the RC-027 failure.
//
// NARROWED 2026-09-22 when T4 landed. `FLAT_DISCOUNT` was selectable from day
// one but nothing can apply it: a discount has to reduce a charge, and no code
// path in this repo discounts a Razorpay payment or a GST invoice. Leaving it
// settable would have produced exactly the failure this comment describes — an
// admin picks "₹500 off", the store never gets ₹500, and nothing reports it.
// So it is refused with a message naming the reason (below), and it stays in the
// PostgreSQL enum in migration 109 for the day a rail exists. Owner decision
// 2026-09-22: narrow the setting to what the code honours.
// Exported so `admin-referral.test.ts` can prove it against the PostgreSQL enum
// in schema.prisma. A set nothing checks is a set that grows a member nobody
// implements, which is the trap the comment above describes.
export const BONUS_TYPES = ['FREE_MONTH', 'NONE'] as const;
const PAYOUT_CADENCES = ['MONTHLY', 'MANUAL'] as const;

/**
 * Bonus types that exist in the DB enum but that NO code path implements. Kept
 * as data so `referral-program-settings.test.ts` can derive the full enum from
 * schema.prisma and fail if a member is neither implemented nor listed here —
 * an enum that grows a member nobody handles is the RC-027 trap, and the test is
 * what makes adding one impossible to miss.
 */
export const UNIMPLEMENTED_BONUS_TYPES: Record<string, string> = {
  FLAT_DISCOUNT: 'nothing applies a discount to a payment yet',
};

// Unit-dependent bounds for referred_bonus_value, applied per bonus type.
// FREE_MONTH counts months; FLAT_DISCOUNT counts paise.
const MAX_BONUS_MONTHS = 24;
const MAX_BONUS_DISCOUNT_PAISE = 10_000_000;

const settingsPatchSchema = z.object({
  commission_pct: z
    .number()
    .int()
    .min(0, 'Commission must be 0-100%')
    .max(100, 'Commission must be 0-100%')
    .optional(),
  duration_months: z.number().int().min(1).max(120).optional(),
  qualify_days: z.number().int().min(0).max(365).optional(),
  referred_bonus_type: z.enum(BONUS_TYPES).optional(),
  referred_bonus_value: z.number().int().min(0).optional(),
  second_tier_enabled: z.boolean().optional(),
  second_tier_pct: z.number().int().min(0).max(100).nullable().optional(),
  payout_min_amount: z.number().int().min(0).optional(),
  payout_cadence: z.enum(PAYOUT_CADENCES).optional(),
  // T7 tax knobs (migration 114) — the owner flips these after the CA
  // conversation; defaults stay off/zero so nothing changes until then.
  tds_enabled: z.boolean().optional(),
  tds_pct: z.number().int().min(0).max(100).optional(),
  gst_applicable: z.boolean().optional(),
  gst_pct: z.number().int().min(0).max(100).optional(),
});

type SettingsPatch = z.infer<typeof settingsPatchSchema>;

// The singleton row reader now lives in lib/referral-settings.ts, because T4 is
// its second consumer. Two private copies of "read the row, create it from the
// DB DEFAULTs if missing" would drift the moment one of them grew a fallback
// constant — and the fallback would be a commission term by definition.
type SettingsRow = ReferralSettingsRow;
const loadOrCreate = loadReferralSettings;

/**
 * Cross-field rules, evaluated against the MERGED state (stored row + patch)
 * and never the patch alone — a PUT may legitimately send only
 * `referred_bonus_type`, and the pairing still has to hold afterwards. These
 * mirror the DB CHECKs in migration 109; catching them here turns what would be
 * an opaque 23514 into a message that names the setting to fix.
 */
export function crossFieldError(row: SettingsRow, patch: SettingsPatch): string | null {
  const type = patch.referred_bonus_type ?? row.referred_bonus_type;
  const value = patch.referred_bonus_value ?? row.referred_bonus_value;

  if (type === 'NONE' && value !== 0) {
    return 'referred_bonus_value must be 0 when referred_bonus_type is NONE';
  }
  if (type === 'FREE_MONTH' && (value < 1 || value > MAX_BONUS_MONTHS)) {
    return `referred_bonus_value must be 1-${MAX_BONUS_MONTHS} months for FREE_MONTH`;
  }
  // UNREACHABLE from the API since T4 narrowed the accepted set, but kept for a
  // row that already holds FLAT_DISCOUNT (written before the narrowing, or by
  // hand in SQL): patching any OTHER field must still not land an impossible
  // value, and the DB CHECK can only see this pairing. Not dead code — a
  // defence for the one state the route can no longer create.
  if (type === 'FLAT_DISCOUNT' && (value < 1 || value > MAX_BONUS_DISCOUNT_PAISE)) {
    return `referred_bonus_value must be 1-${MAX_BONUS_DISCOUNT_PAISE} paise for FLAT_DISCOUNT`;
  }

  const enabled = patch.second_tier_enabled ?? row.second_tier_enabled;
  const pct = patch.second_tier_pct !== undefined ? patch.second_tier_pct : row.second_tier_pct;
  if (enabled && pct == null) {
    return 'second_tier_pct is required when second_tier_enabled is true';
  }

  // T7 tax pairings — mirror migration 114's CHECKs so the admin gets a
  // message naming the knob instead of an opaque 23514.
  const tdsOn = patch.tds_enabled ?? row.tds_enabled;
  const tdsRate = patch.tds_pct ?? row.tds_pct;
  if (tdsOn && tdsRate <= 0) {
    return 'tds_pct must be greater than 0 when tds_enabled is true';
  }
  const gstOn = patch.gst_applicable ?? row.gst_applicable;
  const gstRate = patch.gst_pct ?? row.gst_pct;
  if (gstOn && gstRate <= 0) {
    return 'gst_pct must be greater than 0 when gst_applicable is true';
  }

  return null;
}

/**
 * Which keys the patch actually changes. This is what lets the admin screen
 * send a diff: resubmitting an unchanged value is a no-op rather than a write
 * and an audit entry (RC-010 — re-sending an unchanged value must never trip
 * validation or churn the row).
 */
export function changedKeys(row: SettingsRow, patch: SettingsPatch): string[] {
  const asRecord = (v: unknown) => v as Record<string, unknown>;
  return Object.keys(patch).filter((key) => {
    const next = asRecord(patch)[key];
    const prev = asRecord(row)[key];
    // null and undefined both mean "no value", for the nullable second-tier pct.
    return !(next === prev || (next == null && prev == null));
  });
}

export const adminReferralRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/referral-settings ───────────────────────────────
  server.get('/referral-settings', async () => {
    const row = await loadOrCreate();
    return { data: row };
  });

  // ─── PUT /admin/referral-settings ───────────────────────────────
  // Partial update: only the keys present in the body are written, so the
  // admin screen can send just the fields the operator touched.
  server.put('/referral-settings', async (request) => {
    // Checked BEFORE zod so the admin gets a message that says WHY, rather than
    // a generic `Invalid enum value` for a value the UI used to offer.
    const submitted = (request.body ?? {}) as Record<string, unknown>;
    const bonusType = submitted.referred_bonus_type;
    if (typeof bonusType === 'string' && UNIMPLEMENTED_BONUS_TYPES[bonusType]) {
      throw validationError(
        `referred_bonus_type '${bonusType}' is not available: ${UNIMPLEMENTED_BONUS_TYPES[bonusType]}. Use FREE_MONTH or NONE.`,
      );
    }

    const patch = settingsPatchSchema.parse(request.body ?? {});
    const current = await loadOrCreate();

    const problem = crossFieldError(current, patch);
    if (problem) throw validationError(problem);

    const changed = changedKeys(current, patch);
    if (changed.length === 0) {
      // Nothing changed — return the row as-is so the screen can say so
      // truthfully instead of reporting a save that did not happen.
      return { data: current, changed: [] };
    }

    const data = Object.fromEntries(changed.map((k) => [k, (patch as Record<string, unknown>)[k]]));
    const row = await prisma.referralSettings.update({ where: { id: current.id }, data });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'ReferralSettings',
        resource_id: row.id,
        metadata: {
          changed,
          // Dynamic key sets never satisfy Prisma's InputJsonValue structurally
          // — same cast the other admin routes use (admin-post-templates.ts).
          before: Object.fromEntries(
            changed.map((k) => [k, (current as Record<string, unknown>)[k]]),
          ) as Prisma.InputJsonValue,
          after: Object.fromEntries(
            changed.map((k) => [k, (row as Record<string, unknown>)[k]]),
          ) as Prisma.InputJsonValue,
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ changed }, 'Referral settings updated');
    return { data: row, changed };
  });
};
