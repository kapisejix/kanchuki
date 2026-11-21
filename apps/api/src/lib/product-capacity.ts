// RC-177 / RC-178 (2026-11-18): one answer to "how many products may this shop hold".
//
// Counts LIVE products (deleted_at null). It used to be a PRODUCT_UPLOAD LIFETIME
// counter that never went down on delete or sale, so a shop that had ever created
// 500 products was blocked for good (RC-178), and catalog-import kept its own copy
// of the rule against the static PLAN_LIMITS. The cap is the smallest of:
//   - retailer.max_products,
//   - the PRODUCT_UPLOAD limit (plan row or per-retailer override; its period is ignored),
//   - FREE_TIER_MAX_PRODUCTS once the trial or paid term has lapsed (RC-177).
import { prisma } from '@kanchuki/db';
import { FREE_TIER_MAX_PRODUCTS, UNLIMITED } from '@kanchuki/shared';
import { isLapsed } from '../jobs/plan-lapse.js';
import { AppError, planLimitExceeded } from '../plugins/error-handler.js';
import { effectiveLimit } from './quota.js';

export interface ProductCapacity {
  live: number;
  /** -1 = unlimited */
  cap: number;
  freeTier: boolean;
}

export async function getProductCapacity(retailerId: string): Promise<ProductCapacity> {
  const [retailer, upload, live] = await Promise.all([
    prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: { max_products: true, plan_status: true, trial_ends_at: true, plan_expires_at: true },
    }),
    effectiveLimit(retailerId, 'PRODUCT_UPLOAD'),
    prisma.product.count({ where: { retailer_id: retailerId, deleted_at: null } }),
  ]);
  if (isLapsed(retailer)) return { live, cap: FREE_TIER_MAX_PRODUCTS, freeTier: true };
  let cap = retailer.max_products;
  if (upload && upload.limit !== -1) cap = Math.min(cap, upload.limit);
  return { live, cap: cap >= UNLIMITED ? -1 : cap, freeTier: false };
}

// ponytail: count-then-create, so two concurrent creates can each pass with one
// slot left. A product slot costs nothing; add a per-retailer lock if that matters.
export async function assertProductCapacity(retailerId: string, adding = 1): Promise<void> {
  const { live, cap, freeTier } = await getProductCapacity(retailerId);
  if (cap === -1 || live + adding <= cap) return;
  if (freeTier) {
    throw new AppError(
      'FREE_TIER_LIMIT',
      `Your free trial has ended. The free plan holds up to ${FREE_TIER_MAX_PRODUCTS} products — choose a plan to add more.`,
      402,
    );
  }
  throw planLimitExceeded('products');
}
