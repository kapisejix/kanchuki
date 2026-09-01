// Retailers routes aggregator — domain modules in ./retailers/.
// Split via scripts/check-route-size.sh guard.
import type { FastifyPluginAsync } from "fastify";
import {
  retailersCatalogUploadRoutes,
  retailersProfileRoutes,
  retailersSectionsRoutes,
  retailersSettingsRoutes,
  retailersSocialRoutes,
  retailersStatsRoutes,
  retailersUploadsRoutes,
  retailersWhatsappCatalogRoutes,
  retailersWhatsappRoutes,
  retailersAggregatorRoutes,
  retailersIntegrationsRoutes,
  retailersRatingsRoutes,
  retailersBugReportRoutes,
  retailersInvoicesRoutes,
} from "./retailers/index.js";

export const retailerRoutes: FastifyPluginAsync = async (server) => {
  // retailers-profile — auto-split module
  await server.register(retailersProfileRoutes);
  // retailers-uploads — auto-split module
  await server.register(retailersUploadsRoutes);
  // retailers-whatsapp — auto-split module
  await server.register(retailersWhatsappRoutes);
  // retailers-whatsapp-catalog — Phase II WhatsApp native catalog sync
  await server.register(retailersWhatsappCatalogRoutes);
  // retailers-stats — auto-split module
  await server.register(retailersStatsRoutes);
  // retailers-settings — auto-split module
  await server.register(retailersSettingsRoutes);
  // retailers-sections — auto-split module
  await server.register(retailersSectionsRoutes);
  // retailers-catalog-upload — auto-split module
  await server.register(retailersCatalogUploadRoutes);
  // retailers-social — F-031 social media publishing
  await server.register(retailersSocialRoutes);
  // retailers-aggregators — Phase 7 Aggregator / Marketplace Sync
  await server.register(retailersAggregatorRoutes);
  // retailers-integrations — Platform API credentials (GMB, FB Ads, Google Ads)
  await server.register(retailersIntegrationsRoutes);
  // retailers-ratings — F-021 Product & Store Ratings
  await server.register(retailersRatingsRoutes);
  // retailers-bug-reports — retailer-submitted bug reports from the mobile app
  await server.register(retailersBugReportRoutes);
  // retailers-invoices — GST invoice list + PDF download
  await server.register(retailersInvoicesRoutes);
};
