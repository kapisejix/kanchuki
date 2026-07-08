import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { prisma } from '@kanchuki/db'
import { supabase } from '../index.js'

// Extend FastifyRequest with retailer context
declare module 'fastify' {
  interface FastifyRequest {
    retailerId: string
    retailerAuthUserId: string
  }
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

    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token', status: 401 },
      })
    }

    const token = authHeader.slice(7)
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token', status: 401 },
      })
    }

    // Load retailer from DB
    const retailer = await prisma.retailer.findUnique({
      where: { auth_user_id: user.id, deleted_at: null },
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
    request.retailerAuthUserId = user.id
  })
})
