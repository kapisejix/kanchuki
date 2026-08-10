import { request } from './client';

// Play Store compliance (2026-08-10): the in-app subscription/add-on purchase
// UI was removed from the Android build (app/billing.tsx is now informational
// only) because Google Play requires Play Billing for digital goods sold
// in-app. This client is retained unused for the future billing flow, which
// will live on the Kanchuki website — the server-side /v1/billing rails stay
// intact. Delete this file only when that web billing is built and shipped.
export const billingApi = {
  getPlans: () =>
    request<{
      data: {
        plan: string;
        pricing: { monthly: number; annual: number };
        limits: {
          max_products: number | null;
          max_customers: number | null;
          try_on_credits: number;
        };
      }[];
    }>('/v1/billing/plans', { getCacheTtlMs: 300_000 }), // plans rarely change

  getSubscription: () =>
    request<{
      data: {
        plan: string;
        plan_status: string;
        trial_ends_at: string | null;
        plan_expires_at: string | null;
        subscription: unknown;
      };
    }>('/v1/billing/subscription', { getCacheTtlMs: 30_000 }),

  subscribe: (plan: string, billingPeriod: 'monthly' | 'annual') =>
    request<{ data: { razorpay_subscription_id: string; checkout_url: string } }>(
      '/v1/billing/subscription',
      {
        method: 'POST',
        body: JSON.stringify({ plan, billing_period: billingPeriod }),
      },
    ),

  cancel: () =>
    request<{ data: { plan_status: string; cancelled_at: string } }>('/v1/billing/cancel', {
      method: 'POST',
    }),

  /** F-010: Get addon pricing packs for all resource types */
  getAddonPricing: () =>
    request<{
      data: Record<
        string,
        { label: string; unit_label: string; pack_size: number; price_paise: number }[]
      >;
    }>('/v1/billing/addon-pricing', { getCacheTtlMs: 300_000 }),

  /** F-010: Create a Razorpay Payment Link for an addon purchase */
  addonCheckout: (resourceType: string, packIndex: number) =>
    request<{
      data: {
        checkout_url: string;
        resource_type: string;
        quantity: number;
        label: string;
        amount_paise: number;
      };
    }>('/v1/billing/addon-checkout', {
      method: 'POST',
      body: JSON.stringify({ resource_type: resourceType, pack_index: packIndex }),
    }),
};
