import type { FastifyPluginAsync } from 'fastify';
import { growthCampaignAnalyticsRoutes } from './growth-campaigns/growth-campaigns-analytics.js';
import { growthCampaignCrudRoutes } from './growth-campaigns/growth-campaigns-crud.js';
import { growthCampaignReactivationRoutes } from './growth-campaigns/growth-campaigns-reactivation.js';
import { growthCampaignSendRoutes } from './growth-campaigns/growth-campaigns-send.js';

// Growth campaign routes — split into domain modules under
// routes/growth/growth-campaigns/ (2026-09-03). resolveAudienceCustomerIds
// is re-exported for growth-ai-campaign.ts, which imports it from this path.
export const growthCampaignRoutes: FastifyPluginAsync = async (server) => {
  await server.register(growthCampaignCrudRoutes);
  await server.register(growthCampaignSendRoutes);
  await server.register(growthCampaignAnalyticsRoutes);
  await server.register(growthCampaignReactivationRoutes);
};

export { resolveAudienceCustomerIds } from './growth-campaigns/growth-campaigns-helpers.js';
