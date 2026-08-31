// Public routes aggregator — shared helpers in public/public-helpers.ts,
// domain modules in ./public/. Split via scripts/check-route-size.sh guard.
import type { FastifyPluginAsync } from 'fastify';
import {
  publicCatalogPaymentRoutes,
  publicCollectionsRoutes,
  publicMiscRoutes,
  publicNearMeRoutes,
  publicProductsRoutes,
  publicRetailersRoutes,
  publicReviewsRoutes,
  publicStylistRoutes,
  publicDesignRoutes,
  publicStoresRoutes,
  passportRoutes,
  publicSearchRoutes,
  discoverStoresRoutes,
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
  // public-near-me — geo-search for nearby retailers
  await server.register(publicNearMeRoutes);
  // public-stores — store directory
  await server.register(publicStoresRoutes);
  // public-reviews — F-021 customer-facing review submission
  await server.register(publicReviewsRoutes);
  // public-stylist — AI Stylist v1 (LLM outfit recommendations)
  await server.register(publicStylistRoutes);
  // public-designs — Unstitched Design Gallery browsing
  await server.register(publicDesignRoutes);
  // passport — Shopper Passport OTP + session (Tasks 2-3)
  await server.register(passportRoutes, { prefix: '/passport' });
  // public-search — cross-retailer product search (Task 22)
  await server.register(publicSearchRoutes);
  // discover-stores — store discovery with affinity scores (Task 23)
  await server.register(discoverStoresRoutes);
};
