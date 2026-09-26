// Products routes aggregator — shared helpers/schemas in products/products-helpers.ts,
// domain modules in ./products/. Split via scripts/check-route-size.sh guard.
import type { FastifyPluginAsync } from 'fastify';
import {
  productsAiRoutes,
  productsCrudRoutes,
  productsMediaRoutes,
  productsProCleanupRoutes,
  productsStudioRoutes,
  productsTrashRoutes,
  productsTryOnRoutes,
  productsVariantsRoutes,
} from './products/index.js';

export const productRoutes: FastifyPluginAsync = async (server) => {
  // products-crud — auto-split module
  await server.register(productsCrudRoutes);
  // products-trash — auto-split module
  await server.register(productsTrashRoutes);
  // products-media — auto-split module
  await server.register(productsMediaRoutes);
  // products-pro-cleanup — retailer-facing professional photo pipeline
  await server.register(productsProCleanupRoutes);
  // products-variants — auto-split module
  await server.register(productsVariantsRoutes);
  // products-ai — auto-split module
  await server.register(productsAiRoutes);
  // products-studio — F-032 AI Studio Shoots
  await server.register(productsStudioRoutes);
  // products-tryon — F-039 Phase 2 virtual try-on (dual-identity: retailer
  // Bearer or customer passport cookie; see plugins/auth.ts)
  await server.register(productsTryOnRoutes);
};
