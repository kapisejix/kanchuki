import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '@kanchuki/db'

// Extend FastifyRequest with retailer context
declare module 'fastify' {
  interface FastifyRequest {
    retailerId: string
    retailerAuthUserId: string
  }
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

// Verifies a Supabase-issued HS256 JWT locally (signature + expiry) instead
// of calling supabase.auth.getUser(), which round-trips to Supabase's Auth
// API on every single request. Under bulk operations (many sequential
// authenticated calls) that per-request network hop was the actual source
// of client-side request timeouts, not the endpoints themselves.
function verifySupabaseJwt(token: string): { sub: string } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string]

  const secret = process.env['SUPABASE_JWT_SECRET']
  if (!secret) return null

  const expectedSig = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest()
  const actualSig = base64UrlDecode(sigB64)
  if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
    return null
  }

  let payload: { sub?: string; exp?: number }
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'))
  } catch {
    return null
  }
  if (!payload.sub || !payload.exp || payload.exp * 1000 < Date.now()) return null

  return { sub: payload.sub }
}

/**
 * Verifies Supabase JWT and attaches retailer context to request.
 * Call `request.requireAuth()` on protected routes.
 */
export const authPlugin: FastifyPluginAsync = fp(async (server) => {
  server.decorateRequest('retailerId', '')
  server.decorateRequest('retailerAuthUserId', '')

  server.addHook('preHandler', async (request: FastifyRequest, reply) => {
    // Skip auth for public routes
    if (request.routeOptions.url?.startsWith('/v1/public')) return
    if (request.routeOptions.url === '/health') return
    // Razorpay webhook authenticates via HMAC signature, not JWT
    if (request.routeOptions.url === '/v1/billing/webhook') return
    // Admin routes authenticate via x-admin-key header (checked in admin.ts)
    if (request.routeOptions.url?.startsWith('/v1/admin')) return
    // Auth routes are how a client obtains a Bearer token in the first place
    if (request.routeOptions.url?.startsWith('/v1/auth')) return
    // Remote try-on endpoints (customer-facing, no auth)
    if (request.routeOptions.url === '/v1/try-on/remote') return
    if (request.routeOptions.url?.startsWith('/v1/try-on/remote/')) return

    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token', status: 401 },
      })
    }

    const token = authHeader.slice(7)
    const claims = verifySupabaseJwt(token)

    if (!claims) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token', status: 401 },
      })
    }

    // Load retailer from DB
    const retailer = await prisma.retailer.findUnique({
      where: { auth_user_id: claims.sub, deleted_at: null },
      select: { id: true, auth_user_id: true, plan_status: true },
    })

    if (!retailer) {
      return reply.status(403).send({
        error: {
          code: 'RETAILER_NOT_FOUND',
          message: 'Retailer account not found. Please complete registration.',
          status: 403,
        },
      })
    }

    request.retailerId = retailer.id
    request.retailerAuthUserId = claims.sub
  })
})
