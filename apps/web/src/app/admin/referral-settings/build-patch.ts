// Kept out of page.tsx: Next.js rejects any page export other than default +
// its route config, and the admin referral-settings test imports this directly.

export type BonusType = 'FREE_MONTH' | 'FLAT_DISCOUNT' | 'NONE';
export type Cadence = 'MONTHLY' | 'MANUAL';

export type Settings = {
  commission_pct: number;
  duration_months: number;
  qualify_days: number;
  referred_bonus_type: BonusType;
  referred_bonus_value: number;
  second_tier_enabled: boolean;
  second_tier_pct: number | null;
  payout_min_amount: number;
  payout_cadence: Cadence;
};

/**
 * The patch to send: only keys whose value actually moved. `typeChanged`
 * forces the bonus value into the patch even when the numeral is identical —
 * 1 month and 1 paise are the same number but a very different payout, so
 * switching the type without resending the value would silently reinterpret
 * the stored figure in the new unit.
 */
export function buildPatch(
  stored: Settings,
  next: Settings,
  typeChanged: boolean,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof Settings)[]) {
    if (next[key] !== stored[key]) patch[key] = next[key];
  }
  if (typeChanged) patch.referred_bonus_value = next.referred_bonus_value;
  return patch;
}
