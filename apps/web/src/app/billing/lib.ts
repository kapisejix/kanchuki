// Pure helpers for the retailer billing page — kept free of DOM/API so they
// stay unit-testable. Prices come from the shared package as paise amounts
// and are always shown in full (₹999/mo, never ₹0.9K).
import { formatPrice } from '@kanchuki/shared';

export type PlanKey = 'STARTER' | 'GROWTH' | 'PRO';
export type BillingPeriod = 'monthly';

export const PLAN_ORDER: PlanKey[] = ['STARTER', 'GROWTH', 'PRO'];

export function planLabel(plan: string): string {
  if (!plan) return 'Starter';
  return plan.charAt(0) + plan.slice(1).toLowerCase();
}

/** ₹4,999/mo — full amount, never abbreviated. */
export function planPriceLabel(paise: number): string {
  const full = formatPrice(paise).replace('/-', '');
  return `${full}/mo`;
}

export function planStatusLabel(status?: string | null): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'TRIAL':
      return 'Free trial';
    case 'CANCELLED':
      return 'Cancelled';
    case 'PAST_DUE':
      return 'Payment due';
    default:
      return status ?? 'Unknown';
  }
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}



/** Addon packs grouped by resource, rendered in this display order. */
export const ADDON_GROUP_ORDER = [
  'PRODUCT_UPLOAD',
  'AI_TAGGING_CALL',
  'TRY_ON',
  'IMAGE_CROP',
  'BG_REMOVAL',
] as const;

export const ADDON_GROUP_LABEL: Record<string, string> = {
  PRODUCT_UPLOAD: 'Extra products',
  AI_TAGGING_CALL: 'AI tagging',
  TRY_ON: 'Try-on credits',
  IMAGE_CROP: 'Photo editing',
  BG_REMOVAL: 'Background removal',
};
