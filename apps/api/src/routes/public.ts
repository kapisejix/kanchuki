// Public routes aggregator — shared helpers in public/public-helpers.ts,
// domain modules in ./public/. Split via scripts/check-route-size.sh guard.
import type { FastifyPluginAsync } from 'fastify';
import {
  publicCatalogPaymentRoutes,
  publicCollectionsRoutes,
  publicMiscRoutes,
  publicProductsRoutes,
  publicRetailersRoutes,
} from './public/index.js';

export const publicRoutes: FastifyPluginAsync = async (server) => {
  // public-misc — auto-split module
  await server.register(publicMiscRoutes);
  // public-collections — auto-split module
  await server.register(publicCollectionsRoutes);
  // public-products — auto-split module
  await server.register(publicProductsRoutes);
  // public-retailers — auto-split module
  await server.register(publicRetailersRoutes);
  // public-catalog-payment — auto-split module
  await server.register(publicCatalogPaymentRoutes);
};
