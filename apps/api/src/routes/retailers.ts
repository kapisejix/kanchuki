// Retailers routes aggregator — domain modules in ./retailers/.
// Split via scripts/check-route-size.sh guard.
import type { FastifyPluginAsync } from 'fastify';
import {
  retailersCatalogUploadRoutes,
  retailersProfileRoutes,
  retailersSectionsRoutes,
  retailersSettingsRoutes,
  retailersSocialRoutes,
  retailersStatsRoutes,
  retailersUploadsRoutes,
  retailersWhatsappRoutes,
} from './retailers/index.js';

export const retailerRoutes: FastifyPluginAsync = async (server) => {
  // retailers-profile — auto-split module
  await server.register(retailersProfileRoutes);
  // retailers-uploads — auto-split module
  await server.register(retailersUploadsRoutes);
  // retailers-whatsapp — auto-split module
  await server.register(retailersWhatsappRoutes);
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
};
