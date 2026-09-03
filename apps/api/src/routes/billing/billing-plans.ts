import { PLAN_PRICING } from '@kanchuki/shared';
// billing-plans.ts — public plan/pricing catalog (split from apps/api/src/routes/billing.ts — body byte-identical)
import type { FastifyPluginAsync } from 'fastify';
import { type Plan, getPlanPricing, jsonLimits } from './billing-helpers.js';
export const billingPlansRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /billing/plans ─────────────────────────────────────────
  server.get('/plans', async () => ({
    data: await Promise.all(
      (Object.keys(PLAN_PRICING) as Plan[]).map(async (plan) => ({
        plan,
        pricing: await getPlanPricing(plan),
        limits: jsonLimits(plan),
      })),
    ),
  }));
};
