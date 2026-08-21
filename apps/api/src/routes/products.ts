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
  productsVariantsRoutes,
  productsFestivalBackgroundRoutes,
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
  // products-festival-background — F-032 Phase B Automated Festival Background Library
  await server.register(productsFestivalBackgroundRoutes);
};
