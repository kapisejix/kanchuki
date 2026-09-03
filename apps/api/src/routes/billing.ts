import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { billingAddonRoutes } from './billing/billing-addons.js';
import { billingPlansRoutes } from './billing/billing-plans.js';
import { billingSubscriptionRoutes } from './billing/billing-subscription.js';
import { billingWebhookRoutes } from './billing/billing-webhook.js';

// Billing routes — split into domain modules under routes/billing/ (2026-09-03).
// The raw-body capture hook must stay HERE (parent context): every child
// module inherits it, and the webhook module's HMAC check depends on it.
export const billingRoutes: FastifyPluginAsync = async (server) => {
  // Razorpay signs the raw body — capture it BEFORE the JSON parser runs.
  // Fastify v5: removeContentTypeParser inside an encapsulated plugin doesn't
  // reliably remove inherited parsers. Use preParsing hook instead.
  server.addHook('preParsing', async (request: FastifyRequest) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request.raw) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    request.rawBody = Buffer.concat(chunks).toString();
    // Return a new stream so the default JSON parser still works
    const { Readable } = await import('node:stream');
    return Readable.from(request.rawBody);
  });

  await server.register(billingPlansRoutes);
  await server.register(billingSubscriptionRoutes);
  await server.register(billingAddonRoutes);
  await server.register(billingWebhookRoutes);
};
