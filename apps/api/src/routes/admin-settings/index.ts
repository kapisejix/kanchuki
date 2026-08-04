// Barrel — re-exports the auto-split admin-settings domain modules.
export { adminRateLimitsRoutes, getCachedRateLimits, DEFAULT_RATE_LIMITS } from './rate-limits.js';
export { adminCatalogPromoRoutes, getCatalogUploadPromo } from './catalog-promo.js';
export type { CatalogUploadPromo } from './catalog-promo.js';
export { adminThemeRoutes, getTheme } from './theme.js';
export { adminAiConfigRoutes, DEFAULT_AI_CONFIG } from './ai-config.js';
export { adminOperationsRoutes } from './operations.js';
export { adminDeploymentsRoutes } from './deployments.js';
export { adminTicketReportingRoutes } from './ticket-reporting.js';
export { adminBackupsStatusRoutes } from './backups.js';
export { adminNotificationsRoutes } from './notifications.js';
