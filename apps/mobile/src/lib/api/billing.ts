import { request } from './client';

// Read-only on purpose (Play Payments policy): no subscribe, cancel or add-on checkout.
export const billingApi = {
  getPlans: () =>
    request<{
      data: {
        plan: string;
        pricing: { monthly: number };
        limits: {
          max_products: number | null;
          max_customers: number | null;
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
};
