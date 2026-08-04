// Checkout routes aggregator — shared helpers in checkout/checkout-helpers.ts,
// domain modules in ./checkout/. Auto-split via scripts/split-checkout-routes.mjs.
import type { FastifyPluginAsync } from 'fastify';
import {
  checkoutFlowRoutes,
  checkoutOrdersRoutes,
  checkoutPaymentAccountRoutes,
  checkoutWebhookRoutes,
} from './checkout/index.js';

export const checkoutRoutes: FastifyPluginAsync = async (server) => {
  // checkout-payment-account — auto-split module
  await server.register(checkoutPaymentAccountRoutes);
  // checkout-flow — auto-split module
  await server.register(checkoutFlowRoutes);
  // checkout-webhook — auto-split module
  await server.register(checkoutWebhookRoutes);
  // checkout-orders — auto-split module
  await server.register(checkoutOrdersRoutes);
};
