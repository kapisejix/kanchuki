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
import { validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

/** The single settings row — matches @default("singleton") on the model. */
const SINGLETON_ID = 'singleton';

// The vocabulary the consuming tasks actually branch on: T4 applies the
// referred-side bonus, T5 the qualify gate, T6 the commission, T7 the payout
// cron. A value outside these sets must be rejected loudly — never stored and
// then silently ignored, which is exactly the RC-027 failure.
const BONUS_TYPES = ['FREE_MONTH', 'FLAT_DISCOUNT', 'NONE'] as const;
const PAYOUT_CADENCES = ['MONTHLY', 'MANUAL'] as const;

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
});

type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/**
 * Read the singleton row, creating it from the column DEFAULTs if missing.
 * The row is seeded by migration 109, so reaching the create branch means the
 * seed was skipped somewhere. The create passes an EMPTY data object precisely
 * so every value comes from the DB default — restating the terms here would be
 * the hardcoding this whole design exists to prevent.
 */
async function loadOrCreate() {
  const existing = await prisma.referralSettings.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;
  return prisma.referralSettings.create({ data: {} });
}

type SettingsRow = Awaited<ReturnType<typeof loadOrCreate>>;

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
  if (type === 'FLAT_DISCOUNT' && (value < 1 || value > MAX_BONUS_DISCOUNT_PAISE)) {
    return `referred_bonus_value must be 1-${MAX_BONUS_DISCOUNT_PAISE} paise for FLAT_DISCOUNT`;
  }

  const enabled = patch.second_tier_enabled ?? row.second_tier_enabled;
  const pct = patch.second_tier_pct !== undefined ? patch.second_tier_pct : row.second_tier_pct;
  if (enabled && pct == null) {
    return 'second_tier_pct is required when second_tier_enabled is true';
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
