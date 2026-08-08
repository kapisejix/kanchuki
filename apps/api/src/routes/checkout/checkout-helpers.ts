// Shared checkout helpers/schemas extracted from checkout.ts
// (see scripts/split-checkout-routes.mjs). Route modules import from here.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { decryptSecret, encryptSecret, maskSecret, prisma } from '@kanchuki/db';
import { isValidIndianPhone } from '@kanchuki/shared';
import { z } from 'zod';
export async function razorpayAsRetailer<T>(
  retailerPayment: { razorpay_key_id: string; razorpay_key_secret_encrypted: string },
  path: string,
  init?: RequestInit,
): Promise<T> {
  const keySecret = decryptSecret(retailerPayment.razorpay_key_secret_encrypted);
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${retailerPayment.razorpay_key_id}:${keySecret}`).toString('base64')}`,
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

/** Verify Razorpay webhook signature against a retailer's stored webhook secret. */
export async function verifyRetailerWebhookSignature(
  rawBody: string,
  signature: string,
  encryptedSecret: string | null,
): Promise<boolean> {
  if (!encryptedSecret || !signature) return false;
  const secret = decryptSecret(encryptedSecret);
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Compute GST on clothing: 5% for ≤₹1000, 12% for >₹1000 (apparel HSN rates) */
export function computeGst(subtotalPaise: number): number {
  if (subtotalPaise <= 100_000) {
    // 5% GST (5% of subtotal)
    return Math.round(subtotalPaise * 0.05);
  }
  // 12% GST
  return Math.round(subtotalPaise * 0.12);
}

/** Generate a simple GST invoice number (e.g., INV-20260724-XXXXXX) */
export function generateGstInvoiceNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  // B-011: use crypto.randomBytes for an unguessable, collision-resistant suffix
  const suffix = randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `INV-${date}-${suffix}`;
}

// ─── Schemas ─────────────────────────────────────────────────────

export const ConnectPaymentAccountSchema = z.object({
  razorpay_key_id: z.string().min(1).max(100),
  razorpay_key_secret: z.string().min(1).max(200),
  razorpay_webhook_secret: z.string().min(1).max(200).optional(),
  otp: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, 'OTP must be 6 digits')
    .optional(), // step-up re-auth on update
});

export const CreateOrderSchema = z.object({
  collection_id: z.string().optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().min(1),
        quantity: z.number().int().min(1).max(1).default(1), // always 1 for MVP
      }),
    )
    .min(1)
    .max(50),
  customer_name: z.string().min(1).max(200),
  customer_phone: z
    .string()
    .min(10)
    .max(15)
    .refine((v) => isValidIndianPhone(v), 'Enter a valid 10-digit Indian mobile number'),
  shipping_address: z.object({
    line1: z.string().min(1).max(500),
    line2: z.string().max(500).optional(),
    city: z.string().min(1).max(100),
    state: z.string().min(1).max(100),
    pincode: z.string().min(1).max(10),
  }),
});

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(['FULFILLED', 'CANCELLED']),
});

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

// ─── Routes ──────────────────────────────────────────────────────
