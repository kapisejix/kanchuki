import type {
  Booking,
  Customer,
  Product,
  Promotion,
  SupplierTransaction,
} from '@kanchuki/db';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

// ─── Audience spec (stored on Campaign.audience_json) ─────────────
// A declarative Customer filter. Routes translate it into a Prisma where
// (buildAudienceWhere) or a pure predicate (matchesAudience) — the latter
// keeps the "who is in this audience" logic unit-testable without a DB.

const LEAD_SOURCES = ['MANUAL', 'QR_SCAN', 'STORE_SCAN', 'REFERRAL', 'CAMPAIGN'] as const;

export const AudienceSpecSchema = z.object({
  /** Send to every consented customer (ignores other filters). */
  all: z.boolean().optional(),
  /** Explicit customer id list (customer multi-select in the UI). */
  customer_ids: z.array(z.string()).optional(),
  /** Preference-tag filters — customers who listed any of these. */
  colors: z.array(z.string()).optional(),
  styles: z.array(z.string()).optional(),
  fabrics: z.array(z.string()).optional(),
  /** Behavioural filters. */
  min_total_spent_paise: z.number().int().min(0).optional(),
  max_budget_paise: z.number().int().min(0).optional(),
  /** Reactivation: no interaction in the last N days. Resolved by the route
   *  (needs a sub-query) into customer_ids before filtering. */
  inactive_days: z.number().int().min(1).max(3650).optional(),
  never_purchased: z.boolean().optional(),
  /** Lead-origin filter (roadmap B) — e.g. only QR-captured leads. */
  sources: z.array(z.enum(LEAD_SOURCES)).optional(),
});

export type AudienceSpec = z.infer<typeof AudienceSpecSchema>;

type CustomerLike = Pick<
  Customer,
  | 'id'
  | 'pref_colors'
  | 'pref_styles'
  | 'pref_fabrics'
  | 'total_spent'
  | 'budget_max'
  | 'source'
  | 'consent_given'
  | 'total_purchases'
>;

/**
 * Pure predicate: does this customer match the audience spec?
 * Never throws; unknown/missing fields simply don't match.
 */
export function matchesAudience(customer: CustomerLike, spec: AudienceSpec): boolean {
  if (spec.all) return customer.consent_given;
  if (spec.customer_ids?.length && !spec.customer_ids.includes(customer.id)) return false;

  if (spec.colors?.length && !spec.colors.some((c) => customer.pref_colors.includes(c))) return false;
  if (spec.styles?.length && !spec.styles.some((s) => customer.pref_styles.includes(s))) return false;
  if (spec.fabrics?.length && !spec.fabrics.some((f) => customer.pref_fabrics.includes(f))) return false;

  if (spec.min_total_spent_paise != null && (customer.total_spent ?? 0) < spec.min_total_spent_paise) {
    return false;
  }
  if (spec.max_budget_paise != null && customer.budget_max != null && customer.budget_max > spec.max_budget_paise) {
    return false;
  }
  if (spec.sources?.length && !spec.sources.includes(customer.source)) return false;
  if (spec.never_purchased && (customer.total_purchases ?? 0) > 0) return false;

  return true;
}

/** Prisma where-clause for the audience spec (used by campaign send). */
export function buildAudienceWhere(spec: AudienceSpec, retailerId: string): Record<string, unknown> {
  const where: Record<string, unknown> = { retailer_id: retailerId, deleted_at: null };
  if (spec.all) where['consent_given'] = true;
  if (spec.customer_ids?.length) where['id'] = { in: spec.customer_ids };
  if (spec.colors?.length) where['pref_colors'] = { hasSome: spec.colors };
  if (spec.styles?.length) where['pref_styles'] = { hasSome: spec.styles };
  if (spec.fabrics?.length) where['pref_fabrics'] = { hasSome: spec.fabrics };
  if (spec.min_total_spent_paise != null) where['total_spent'] = { gte: spec.min_total_spent_paise };
  if (spec.max_budget_paise != null) where['budget_max'] = { lte: spec.max_budget_paise };
  if (spec.sources?.length) where['source'] = { in: spec.sources };
  return where;
}

// ─── Message templates ────────────────────────────────────────────
// Supported placeholders: {{name}}, {{shop}}, {{link}}, {{offer}}, {{festival}}.

export type TemplateVars = Record<string, string | number | null | undefined>;

export function fillTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key];
    return value == null ? match : String(value);
  });
}

export function buildWhatsAppDeepLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const intl = digits.startsWith('91') ? digits : `91${digits}`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

// ─── Referral codes (roadmap C) ───────────────────────────────────

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1 ambiguity

export function generateReferralCode(prefix = 'KAN'): string {
  const rand = randomBytes(5);
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += CODE_ALPHABET[rand[i]! % CODE_ALPHABET.length];
  return `${prefix}-${suffix}`;
}

// ─── Promotions (roadmap F) ───────────────────────────────────────

export type PromotionLike = Pick<
  Promotion,
  'discount_type' | 'discount_value' | 'min_order_paise' | 'product_ids' | 'starts_at' | 'ends_at' | 'is_active' | 'times_used'
>;

/** Is this promo usable right now for the given order (subtotal + product ids)? */
export function isPromotionEligible(
  promo: PromotionLike,
  subtotalPaise: number,
  productIds: string[],
  now = new Date(),
): boolean {
  if (!promo.is_active) return false;
  if (promo.starts_at && promo.starts_at > now) return false;
  if (promo.ends_at && promo.ends_at < now) return false;
  if (promo.min_order_paise != null && subtotalPaise < promo.min_order_paise) return false;
  if (promo.product_ids.length > 0 && !promo.product_ids.some((id) => productIds.includes(id))) return false;
  return true;
}

/** Discount paise for a subtotal, capped at the subtotal. */
export function applyPromotionDiscount(promo: PromotionLike, subtotalPaise: number): number {
  if (promo.discount_type === 'FIXED') return Math.min(promo.discount_value, subtotalPaise);
  const percent = Math.max(0, Math.min(100, promo.discount_value));
  return Math.min(Math.round((subtotalPaise * percent) / 100), subtotalPaise);
}

// ─── Inventory intelligence (roadmap J) ───────────────────────────
// No stock quantities exist in the schema, so alerts are signal-based:
// dead stock (no views/enquiries in N days), high velocity (recent sales),
// top performer (monthly sales), plus low-stock hints when a product has
// zero interaction at all since upload.

export interface InventoryAlert {
  kind: 'DEAD_STOCK' | 'HIGH_VELOCITY' | 'TOP_PERFORMER' | 'UNLISTED'
  product_id: string
  product_name: string | null
  sku: string | null
  days_since_interaction: number | null
  views_30d: number
  enquiries_30d: number
  sales_30d: number
  message: string
}

type ProductLike = Pick<Product, 'id' | 'name' | 'sku' | 'created_at'>;
interface InteractionCounts {
  views_30d: number
  enquiries_30d: number
  last_interaction_at: Date | null
}
interface SaleCount {
  sales_30d: number
  last_sale_at: Date | null
}

/**
 * Build inventory alerts for a retailer's products.
 * `interaction` and `sales` are keyed by product id.
 */
export function computeInventoryAlerts(
  products: ProductLike[],
  interactions: Map<string, InteractionCounts>,
  sales: Map<string, SaleCount>,
  now = new Date(),
): InventoryAlert[] {
  const alerts: InventoryAlert[] = [];
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;

  for (const product of products) {
    const ix = interactions.get(product.id);
    const sale = sales.get(product.id);
    const views = ix?.views_30d ?? 0;
    const enquiries = ix?.enquiries_30d ?? 0;
    const sales30 = sale?.sales_30d ?? 0;
    const daysSinceInteraction = ix?.last_interaction_at
      ? Math.floor((now.getTime() - ix.last_interaction_at.getTime()) / (24 * 60 * 60 * 1000))
      : null;

    const name = product.name ?? product.sku ?? product.id;

    // Dead stock: no interaction for 90+ days (or never interacted and older
    // than 90 days).
    if ((daysSinceInteraction != null && daysSinceInteraction >= 90) || (daysSinceInteraction == null && ix != null && now.getTime() - product.created_at.getTime() > ninetyDays)) {
      alerts.push({
        kind: 'DEAD_STOCK',
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        days_since_interaction: daysSinceInteraction,
        views_30d: views,
        enquiries_30d: enquiries,
        sales_30d: sales30,
        message: `"${name}" hasn't had a view or enquiry in ${daysSinceInteraction ?? '90+'} days — consider a bundle discount or clearing it.`,
      });
      continue;
    }

    // High velocity: sold >= 3 units in the last 30 days (each OrderItem = 1 unit).
    if (sales30 >= 3) {
      alerts.push({
        kind: 'HIGH_VELOCITY',
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        days_since_interaction: daysSinceInteraction,
        views_30d: views,
        enquiries_30d: enquiries,
        sales_30d: sales30,
        message: `"${name}" sold ${sales30} units in the last 30 days — this design is moving fast, consider stocking up.`,
      });
      continue;
    }

    // Top performer: highest sales overall handled by the route; here we flag
    // anything with >= 1 sale but not already high velocity as a winner.
    if (sales30 >= 1) {
      alerts.push({
        kind: 'TOP_PERFORMER',
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        days_since_interaction: daysSinceInteraction,
        views_30d: views,
        enquiries_30d: enquiries,
        sales_30d: sales30,
        message: `"${name}" is this month's seller — make sure it's easy to find and restocked.`,
      });
      continue;
    }

    // Unlisted signal: uploaded but never interacted with at all.
    if (ix == null && now.getTime() - product.created_at.getTime() > thirtyDays) {
      alerts.push({
        kind: 'UNLISTED',
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        days_since_interaction: null,
        views_30d: 0,
        enquiries_30d: 0,
        sales_30d: 0,
        message: `"${name}" has never been viewed since upload — share it in a collection or promote it.`,
      });
    }
  }
  return alerts;
}

// ─── Showroom bookings (roadmap L) ────────────────────────────────

/** Overlapping slot check: any existing booking that intersects [start, end]. */
export function hasBookingConflict(
  existing: Pick<Booking, 'starts_at' | 'ends_at' | 'status'>[],
  start: Date,
  end: Date,
): boolean {
  return existing.some(
    (b) =>
      b.status !== 'CANCELLED' &&
      start < b.ends_at &&
      end > b.starts_at,
  );
}

// ─── Supplier ledger (roadmap K) ──────────────────────────────────

/** Pending amount: unpaid ORDERS minus PAYMENTs. */
export function computeSupplierPending(txs: Pick<SupplierTransaction, 'kind' | 'amount_paise'>[]): number {
  const orders = txs.filter((t) => t.kind === 'ORDER').reduce((s, t) => s + t.amount_paise, 0);
  const paid = txs.filter((t) => t.kind === 'PAYMENT').reduce((s, t) => s + t.amount_paise, 0);
  return Math.max(0, orders - paid);
}

// ─── Referral credits (roadmap C) ─────────────────────────────────

export function parseReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}

// ─── A/B testing (roadmap S) ──────────────────────────────────────

/** Two-proportion z-test on open rates between two variants. Pure + testable.
 *  Returns the p-value and a winner only when both samples are large enough
 *  (>= MIN_SAMPLE) to be meaningful — small samples report reliable: false.
 */
export const AB_MIN_SAMPLE_PER_VARIANT = 30;

export interface AbVariantResult {
  label: string;
  sent: number;
  opened: number;
  open_rate: number; // 0..1
}

export interface AbSignificance {
  p_value: number | null;
  winner: string | null;
  reliable: boolean;
}

function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26 — accurate to ~7.5e-8, plenty for p-values.
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  let p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  p = 1 - p;
  return z > 0 ? p : 1 - p;
}

/** Compare two variants' open rates (roadmap S significance). */
export function abTestSignificance(a: AbVariantResult, b: AbVariantResult): AbSignificance {
  const total = a.sent + b.sent;
  if (total === 0) return { p_value: null, winner: null, reliable: false };

  const pPool = (a.opened + b.opened) / total;
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / a.sent + 1 / b.sent));
  if (!Number.isFinite(se) || se === 0) return { p_value: null, winner: null, reliable: false };

  const z = (a.open_rate - b.open_rate) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z))); // two-tailed

  const reliable = a.sent >= AB_MIN_SAMPLE_PER_VARIANT && b.sent >= AB_MIN_SAMPLE_PER_VARIANT;
  const winner =
    reliable && a.open_rate !== b.open_rate ? (a.open_rate > b.open_rate ? a.label : b.label) : null;

  return { p_value: Number(pValue.toFixed(4)), winner, reliable };
}

