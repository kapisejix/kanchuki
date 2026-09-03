import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSecret, prisma } from '@kanchuki/db';
import { PLAN_LIMITS, PLAN_PRICING } from '@kanchuki/shared';

// Shared helpers for the billing route modules (split from billing.ts).
// Everything here was module-level in the original file; bodies moved
// byte-for-byte by scripts/_tmp-split-route-modules.cjs.

export type Plan = 'STARTER' | 'GROWTH' | 'PRO';

// Razorpay plan ids — monthly only (annual removed 2026-09-01).
// Resolved via getSecret so they can be set on Admin → Integrations
// (integration_setting table); getSecret falls back to process.env[key]
// when no DB row exists.
export function razorpayPlanId(plan: Plan): Promise<string | undefined> {
  return getSecret(`RAZORPAY_PLAN_${plan}_MONTHLY`);
}

// ponytail: raw fetch instead of razorpay SDK — we need 2 endpoints, SDK adds a dep
export async function razorpay<T>(path: string, init?: RequestInit): Promise<T> {
  const keyId = (await getSecret('RAZORPAY_KEY_ID')) ?? '';
  const keySecret = (await getSecret('RAZORPAY_KEY_SECRET')) ?? '';
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Razorpay ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/** Constant-time compare for hex-encoded HMAC signatures — avoids a timing side-channel. */
export function hexEquals(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function verifyWebhookSignature(rawBody: string, signature: string): Promise<boolean> {
  const secret = (await getSecret('RAZORPAY_WEBHOOK_SECRET')) ?? '';
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return hexEquals(expected, signature);
}

export function periodEnd(start: Date): Date {
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return end;
}

// State name → 2-digit code mapping for GST intra/inter-state detection.
// Only the states we actually encounter from retailer.address fields.
const STATE_CODE_MAP: Record<string, string> = {
  'Andhra Pradesh': '37',
  'Arunachal Pradesh': '12',
  Assam: '18',
  Bihar: '10',
  Chhattisgarh: '22',
  Goa: '30',
  Gujarat: '24',
  Haryana: '06',
  'Himachal Pradesh': '02',
  Jharkhand: '20',
  Karnataka: '29',
  Kerala: '32',
  'Madhya Pradesh': '23',
  Maharashtra: '27',
  Manipur: '14',
  Meghalaya: '17',
  Mizoram: '15',
  Nagaland: '13',
  Odisha: '21',
  Punjab: '03',
  Rajasthan: '08',
  Sikkim: '11',
  'Tamil Nadu': '33',
  Telangana: '36',
  Tripura: '16',
  'Uttar Pradesh': '09',
  Uttarakhand: '05',
  'West Bengal': '19',
  Delhi: '07',
  'Jammu & Kashmir': '01',
  Ladakh: '38',
};

/** Resolve a state name to its 2-digit GST code, or null if unknown. */
export function resolveStateCode(state: string | null | undefined): string | null {
  if (!state) return null;
  // Exact match
  const code = STATE_CODE_MAP[state];
  if (code) return code;
  // Case-insensitive fallback
  const lower = state.toLowerCase();
  for (const [name, c] of Object.entries(STATE_CODE_MAP)) {
    if (name.toLowerCase() === lower) return c;
  }
  return null;
}

// Admin-editable via PUT /admin/plan-pricing (plan_pricing table). Missing
// row (nothing edited yet) falls back to the shared-package default so
// pricing never breaks before an admin touches the new table.
export async function getPlanPricing(plan: Plan): Promise<{ monthly: number }> {
  const row = await prisma.planPricing.findUnique({ where: { plan } });
  if (row) return { monthly: row.monthly_paise };
  return PLAN_PRICING[plan];
}

export function jsonLimits(plan: Plan) {
  const limits = PLAN_LIMITS[plan];
  // Infinity is not valid JSON — serialize unlimited as null
  const orNull = (n: number) => (Number.isFinite(n) ? n : null);
  return {
    ...limits,
    max_products: orNull(limits.max_products),
    max_customers: orNull(limits.max_customers),
    max_collection_links_per_month: orNull(limits.max_collection_links_per_month),
  };
}

export interface RazorpaySubscription {
  id: string;
  status: string;
  short_url: string;
  current_start?: number;
  current_end?: number;
  notes?: Record<string, string>;
}

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}
