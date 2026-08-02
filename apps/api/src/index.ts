import { createHmac } from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createClient } from '@supabase/supabase-js';
import Fastify from 'fastify';

import { getRedis, startWorkers } from './jobs/index.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandler } from './plugins/error-handler.js';
import { adminSettingsRoutes } from './routes/admin-settings.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { billingRoutes } from './routes/billing.js';
import { catalogImportRoutes } from './routes/catalog-import.js';
import { categoryRoutes } from './routes/categories.js';
import { checkoutRoutes } from './routes/checkout.js';
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

// Fail fast at boot instead of 500ing the first request that touches
// encrypted secrets (F-012) — previously masterKey() only threw inside
// request handlers when this was missing.
if (!process.env.ENCRYPTION_MASTER_KEY) {
  console.error(
    '[startup] ENCRYPTION_MASTER_KEY not set — required to decrypt IntegrationSetting rows (F-012). Exiting.',
  );
  process.exit(1);
}

// Collection share links / WhatsApp messages / QR codes are built from
// WEB_URL (routes/collections.ts). A missing or stale value silently ships
// broken /c/{slug} links that 404 in the customer's browser — warn loudly at
// boot so a bad Railway env var is caught at deploy time, not by a retailer's
// first WhatsApp share. Must point at the customer web app (e.g. kanchuki.app),
// NOT the API's own railway.app preview URL.
if (!process.env.WEB_URL) {
  console.warn(
    '[startup] WEB_URL is NOT set — collection share links will be relative (/c/{slug}) and will not open from WhatsApp. Set WEB_URL to the customer web app URL (e.g. https://kanchuki.app) in the API Railway env.',
  );
} else if (process.env.WEB_URL.includes('.up.railway.app')) {
  console.warn(
    `[startup] WEB_URL points at a Railway preview URL (${process.env.WEB_URL}) — preview subdomains change on service recreation and are not the permanent customer URL. Set WEB_URL to the custom domain (e.g. https://kanchuki.app) or collection links will break.`,
  );
}

const server = Fastify({
  logger: process.env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : true,
  // Trust Railway's internal proxy so request.ip returns the real client IP
  // in audit logs instead of the proxy's internal address (10.x.x.x).
  trustProxy: process.env.NODE_ENV === 'production',
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
  // API is called cross-origin by design (web app on a different domain,
  // CORS below authorizes it) — helmet's default same-origin CORP silently
  // blocks the browser from reading every response even when CORS allows it.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

await server.register(cors, {
  origin:
    process.env.NODE_ENV === 'production'
      ? [process.env.WEB_URL ?? '', /(^|\.)kanchuki\.app$/]
      : true,
  credentials: true,
});

// ─── Cookie Plugin (for admin CSRF protection) ────────────────────
// COOKIE_SECRET must be a fixed value in production: the Date.now()-based
// fallback below regenerates on every process start, silently invalidating
// every admin CSRF cookie (and logged-in session) on each restart/deploy.
if (!process.env.COOKIE_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error(
    'COOKIE_SECRET must be set in production (admin CSRF cookies would rotate on every restart otherwise)',
  );
}
await server.register(cookie, {
  secret:
    process.env.COOKIE_SECRET ??
    createHmac('sha256', 'kanchuki-cookie').update(Date.now().toString()).digest('hex'),
});

// ─── Rate Limiting (global + per-route) ───────────────────────────
// Backend: BullMQ's Redis connection (startWorkers called at startup,
// so getRedis() returns the same ioredis instance used by job queues).
await server.register(rateLimit, {
  global: true,
  max: 200,
  timeWindow: '1 minute',
  redis: getRedis(),
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
await server.register(adminSettingsRoutes, { prefix: '/v1/admin' });
await server.register(tryOnRoutes, { prefix: '/v1/try-on' });
await server.register(sizeChartRoutes, { prefix: '/v1/size-charts' });
await server.register(consentRoutes, { prefix: '/v1/consent' });
await server.register(catalogImportRoutes, { prefix: '/v1' });
await server.register(staffRoutes, { prefix: '/v1/staff' });
await server.register(teamRoutes, { prefix: '/v1/team' });
await server.register(checkoutRoutes, { prefix: '/v1' });

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
