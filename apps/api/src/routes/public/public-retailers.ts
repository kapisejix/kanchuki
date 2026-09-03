// Auto-split from public.ts (scripts/check-route-size.sh) — split again into
// domain modules under routes/public/public-retailers/ (2026-09-03):
// sitemap / catalog / storefront / leads. Route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';
import { publicRetailersCatalogRoutes } from './public-retailers/public-retailers-catalog.js';
import { publicRetailersLeadsRoutes } from './public-retailers/public-retailers-leads.js';
import { publicRetailersSitemapRoutes } from './public-retailers/public-retailers-sitemap.js';
import { publicRetailersStorefrontRoutes } from './public-retailers/public-retailers-storefront.js';

export const publicRetailersRoutes: FastifyPluginAsync = async (server) => {
  await server.register(publicRetailersSitemapRoutes);
  await server.register(publicRetailersCatalogRoutes);
  await server.register(publicRetailersStorefrontRoutes);
  await server.register(publicRetailersLeadsRoutes);
};
