// The referral_settings singleton row — one reader for every consumer.
//
// Extracted from admin-referral.ts (T2) when T4 became the second consumer. Two
// private copies of "read the row, creating it from the column DEFAULTs if it is
// missing" is exactly the shape this feature keeps guarding against: they would
// stay in step right up until one of them grew a fallback constant or a cache,
// and then commission terms would differ by which route you asked. The row is
// seeded by migration 109, so the create branch means the seed was skipped.
//
// Nothing here may carry a fallback TERM. The create passes an EMPTY data object
// precisely so every value comes from the DB default — restating "30%" or
// "12 months" at this layer is the hardcoding T1's design exists to prevent, and
// it is the kind of copy that survives silently because the happy path never
// reads it.

import { prisma } from '@kanchuki/db';

/** The single settings row — matches @default("singleton") on the model. */
export const REFERRAL_SETTINGS_ID = 'singleton';

/**
 * Read the singleton row, creating it from the column DEFAULTs if missing, so
 * callers never need a fallback constant.
 */
export async function loadReferralSettings() {
  const existing = await prisma.referralSettings.findUnique({
    where: { id: REFERRAL_SETTINGS_ID },
  });
  if (existing) return existing;
  return prisma.referralSettings.create({ data: {} });
}

export type ReferralSettingsRow = Awaited<ReturnType<typeof loadReferralSettings>>;
