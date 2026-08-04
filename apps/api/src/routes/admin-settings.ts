// Admin settings routes aggregator — shared key-value store helper in
// admin-settings/settings-store.ts, domain modules in ./admin-settings/.
// Split via scripts/check-route-size.sh guard.
import type { FastifyPluginAsync } from 'fastify';
import {
  adminAiConfigRoutes,
  adminBackupsStatusRoutes,
  adminCatalogPromoRoutes,
  adminDeploymentsRoutes,
  adminNotificationsRoutes,
  adminOperationsRoutes,
  adminRateLimitsRoutes,
  adminThemeRoutes,
  adminTicketReportingRoutes,
} from './admin-settings/index.js';

export {
  getCachedRateLimits,
  DEFAULT_RATE_LIMITS,
  DEFAULT_AI_CONFIG,
  getCatalogUploadPromo,
  getTheme,
} from './admin-settings/index.js';
export type { CatalogUploadPromo } from './admin-settings/index.js';

export const adminSettingsRoutes: FastifyPluginAsync = async (server) => {
  // rate-limits — auto-split module
  await server.register(adminRateLimitsRoutes);
  // catalog-promo — auto-split module
  await server.register(adminCatalogPromoRoutes);
  // theme — auto-split module
  await server.register(adminThemeRoutes);
  // ai-config — auto-split module
  await server.register(adminAiConfigRoutes);
  // operations — auto-split module
  await server.register(adminOperationsRoutes);
  // deployments — auto-split module
  await server.register(adminDeploymentsRoutes);
  // ticket-reporting — auto-split module
  await server.register(adminTicketReportingRoutes);
  // backups — auto-split module
  await server.register(adminBackupsStatusRoutes);
  // notifications — auto-split module
  await server.register(adminNotificationsRoutes);
};
