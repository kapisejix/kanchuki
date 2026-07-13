import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '@kanchuki/db'

// ─── Types ────────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    retailerId: string
    retailerAuthUserId: string
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/** Decode JWT header to check algorithm without full verification. */
function decodeJwtHeader(token: string): { alg?: string; kid?: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const header = JSON.parse(base64UrlDecode(parts[0]!).toString('utf8'))
    return { alg: header.alg, kid: header.kid }
  } catch {
    return null
  }
}

/** Extract payload claims (sub, exp) without signature verification. */
function decodeJwtPayload(token: string): { sub?: string; exp?: number } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(base64UrlDecode(parts[1]!).toString('utf8'))
  } catch {
    return null
  }
}

/**
 * Verify a Supabase-issued HS256 JWT locally using the shared secret.
 * This works when SUPABASE_JWT_SECRET is set and the token uses
 * HMAC-SHA256 signing (legacy Supabase projects).
 */
function verifyHs256Jwt(token: string): { sub: string } | null {
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
 * Verify a Supabase-issued ES256 JWT using the JWKS endpoint.
 * New Supabase projects use ES256 (ECDSA) by default, which requires
 * the public key from Supabase's JWKS endpoint rather than a shared secret.
 */
async function verifyEs256Jwt(token: string): Promise<{ sub: string } | null> {
  try {
    const { createRemoteJWKSet, jwtVerify, errors } = await import('jose')

    const supabaseUrl = process.env['SUPABASE_URL']
    if (!supabaseUrl) return null

    const JWKS = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    )

    const { payload } = await jwtVerify(token, JWKS, {
      algorithms: ['ES256'],
    })

    if (!payload.sub || (payload.exp && payload.exp * 1000 < Date.now())) {
      return null
    }

    return { sub: payload.sub as string }
  } catch {
    return null
  }
}

/**
 * Verify a Supabase JWT by trying multiple strategies in order:
 * 1. Local HS256 (legacy, uses shared secret)
 * 2. Remote JWKS ES256 (default for new Supabase projects)
 */
async function verifySupabaseJwt(token: string): Promise<{ sub: string } | null> {
  // Strategy 1: Try local HS256 verification (fast, no network)
  const hs256Claims = verifyHs256Jwt(token)
  if (hs256Claims) return hs256Claims

  // Strategy 2: Check the algorithm in the JWT header
  const header = decodeJwtHeader(token)
  if (!header) return null

  // For ES256, use JWKS-based verification
  if (header.alg === 'ES256') {
    return await verifyEs256Jwt(token)
  }

  // For unknown algorithms, try payload-only checks (sub + exp)
  // in development mode only. Never bypass signature verification
  // in production — this would accept forged tokens.
  if (process.env['NODE_ENV'] === 'development') {
    const payload = decodeJwtPayload(token)
    if (payload?.sub && payload.exp && payload.exp * 1000 > Date.now()) {
      return { sub: payload.sub }
    }
  }

  return null
}

// ─── Plugin ───────────────────────────────────────────────────────

/**
 * Verifies Supabase JWT and attaches retailer context to request.
 * Supports both HS256 (legacy) and ES256 (new) Supabase tokens.
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
    const claims = await verifySupabaseJwt(token)

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
