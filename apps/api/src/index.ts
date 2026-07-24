import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createClient } from '@supabase/supabase-js';
import Fastify from 'fastify';

import { startWorkers } from './jobs/index.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandler } from './plugins/error-handler.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { billingRoutes } from './routes/billing.js';
import { catalogImportRoutes } from './routes/catalog-import.js';
import { categoryRoutes } from './routes/categories.js';
import { collectionRoutes } from './routes/collections.js';
import { consentRoutes } from './routes/consent.js';
import { customerRoutes } from './routes/customers.js';
import { productRoutes } from './routes/products.js';
import { publicRoutes } from './routes/public.js';
import { retailerRoutes } from './routes/retailers.js';
import { searchRoutes } from './routes/search.js';
import { sizeChartRoutes } from './routes/size-chart.js';
import { staffRoutes } from './routes/staff.js';
import { teamRoutes } from './routes/team.js';
import { tryOnRoutes } from './routes/tryon.js';

const server = Fastify({
  logger: process.env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : true,
});

// ─── Global Supabase Client (for auth verification) ──────────────

export const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_KEY ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ─── Register Plugins ─────────────────────────────────────────────

await server.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'https:', 'data:'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
});

await server.register(cors, {
  origin:
    process.env.NODE_ENV === 'production' ? [process.env.WEB_URL ?? '', /\.kanchuki\.app$/] : true,
  credentials: true,
});

await server.register(rateLimit, {
  global: true,
  max: 200,
  timeWindow: '1 minute',
  redis: undefined, // will add Redis after connecting
  keyGenerator: (request) => (request.headers['x-retailer-id'] as string | undefined) ?? request.ip,
});

// ─── Auth Plugin ──────────────────────────────────────────────────

await server.register(authPlugin);

// ─── Error Handler ────────────────────────────────────────────────

server.setErrorHandler(errorHandler);

// ─── Routes ──────────────────────────────────────────────────────

await server.register(authRoutes, { prefix: '/v1/auth' });
await server.register(publicRoutes, { prefix: '/v1/public' });
await server.register(retailerRoutes, { prefix: '/v1/retailers' });
await server.register(productRoutes, { prefix: '/v1/products' });
await server.register(categoryRoutes, { prefix: '/v1/categories' });
await server.register(customerRoutes, { prefix: '/v1/customers' });
await server.register(collectionRoutes, { prefix: '/v1/collections' });
await server.register(searchRoutes, { prefix: '/v1/search' });
await server.register(billingRoutes, { prefix: '/v1/billing' });
await server.register(adminRoutes, { prefix: '/v1/admin' });
await server.register(tryOnRoutes, { prefix: '/v1/try-on' });
await server.register(sizeChartRoutes, { prefix: '/v1/size-charts' });
await server.register(consentRoutes, { prefix: '/v1/consent' });
await server.register(catalogImportRoutes, { prefix: '/v1' });
await server.register(staffRoutes, { prefix: '/v1/staff' });
await server.register(teamRoutes, { prefix: '/v1/team' });

// ─── Health Check ─────────────────────────────────────────────────

server.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

// ─── Start ────────────────────────────────────────────────────────

async function start(): Promise<void> {
  const port = Number.parseInt(process.env.PORT ?? '3001');
  try {
    // Start BullMQ workers (non-blocking — if Redis is down, workers fail
    // gracefully and jobs via addTaggingJob/etc. will be caught and logged).
    startWorkers().catch((err) => {
      server.log.warn({ err }, 'BullMQ workers failed to start — background jobs disabled');
    });
    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`API running on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

await start();
