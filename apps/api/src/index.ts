import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { createClient } from '@supabase/supabase-js'

import { authPlugin } from './plugins/auth.js'
import { errorHandler } from './plugins/error-handler.js'
import { retailerRoutes } from './routes/retailers.js'
import { productRoutes } from './routes/products.js'
import { customerRoutes } from './routes/customers.js'
import { collectionRoutes } from './routes/collections.js'
import { publicRoutes } from './routes/public.js'
import { authRoutes } from './routes/auth.js'
import { searchRoutes } from './routes/search.js'
import { startWorkers } from './jobs/index.js'

const server = Fastify({
  logger:
    process.env['NODE_ENV'] === 'development'
      ? { transport: { target: 'pino-pretty' } }
      : true,
})

// ─── Global Supabase Client (for auth verification) ──────────────

export const supabase = createClient(
  process.env['SUPABASE_URL'] ?? '',
  process.env['SUPABASE_SERVICE_KEY'] ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } },
)

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
})

await server.register(cors, {
  origin:
    process.env['NODE_ENV'] === 'production'
      ? [process.env['WEB_URL'] ?? '', /\.kanchuki\.app$/]
      : true,
  credentials: true,
})

await server.register(rateLimit, {
  global: true,
  max: 200,
  timeWindow: '1 minute',
  redis: undefined, // will add Redis after connecting
  keyGenerator: (request) =>
    (request.headers['x-retailer-id'] as string | undefined) ??
    request.ip,
})

// ─── Auth Plugin ──────────────────────────────────────────────────

await server.register(authPlugin)

// ─── Error Handler ────────────────────────────────────────────────

server.setErrorHandler(errorHandler)

// ─── Routes ──────────────────────────────────────────────────────

await server.register(authRoutes, { prefix: '/v1/auth' })
await server.register(publicRoutes, { prefix: '/v1/public' })
await server.register(retailerRoutes, { prefix: '/v1/retailers' })
await server.register(productRoutes, { prefix: '/v1/products' })
await server.register(customerRoutes, { prefix: '/v1/customers' })
await server.register(collectionRoutes, { prefix: '/v1/collections' })
await server.register(searchRoutes, { prefix: '/v1/search' })

// ─── Health Check ─────────────────────────────────────────────────

server.get('/health', async () => ({ status: 'ok', ts: Date.now() }))

// ─── Start ────────────────────────────────────────────────────────

async function start(): Promise<void> {
  const port = parseInt(process.env['PORT'] ?? '3001')
  try {
    await startWorkers()
    await server.listen({ port, host: '0.0.0.0' })
    server.log.info(`API running on port ${port}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

await start()
