import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createHash } from 'crypto'
import { prisma } from '@kanchuki/db'
import { buildEnquiryMessage } from '@kanchuki/shared'
import { notFound, validationError } from '../plugins/error-handler.js'

export const publicRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /public/stats ─────────────────────────────────────────
  // Landing page stats — real counts from the platform, no auth needed.
  server.get('/stats', async () => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [productCount, collectionCount, retailerCount, monthEnquiries] = await Promise.all([
      prisma.product.count({ where: { deleted_at: null } }),
      prisma.collection.count({ where: { deleted_at: null } }),
      prisma.retailer.count({ where: { deleted_at: null } }),
      prisma.collectionEnquiry.count({ where: { created_at: { gte: monthStart } } }),
    ])

    return {
      data: {
        total_products: productCount,
        total_collections: collectionCount,
        total_retailers: retailerCount,
        enquiries_this_month: monthEnquiries,
      },
    }
  })

  // ─── GET /public/collections/:slug ─────────────────────────────
  // Customer-facing: no auth required. Returns shop info + products.
  server.get('/collections/:slug', async (request) => {
    const { slug } = request.params as { slug: string }

    const collection = await prisma.collection.findFirst({
      where: { slug, status: 'ACTIVE', deleted_at: null },
      include: {
        retailer: {
          select: { shop_name: true, city: true, phone: true },
        },
        products: {
          orderBy: { sort_order: 'asc' },
          include: {
            product: {
              include: {
                photos: { orderBy: { sort_order: 'asc' } },
                variants: true,
              },
            },
          },
        },
      },
    })

    if (!collection) throw notFound('Collection')

    // Check expiry
    if (collection.expires_at && collection.expires_at < new Date()) {
      // Mark expired in background (don't await)
      void prisma.collection.update({
        where: { id: collection.id },
        data: { status: 'EXPIRED' },
      }).catch(() => undefined)

      throw notFound('Collection')
    }

    // Build public shape (no internal IDs that shouldn't be shared)
    // Show ALL non-deleted products — SOLD/RESERVED get visual badges on the frontend.
    // Only fully hide truly deleted items.
    const publicProducts = collection.products
      .filter((cp) => cp.product !== null && !cp.product.deleted_at)
      .map((cp) => {
        const p = cp.product!
        const availableVariants = p.variants.filter((v) => v.status === 'AVAILABLE')
        return {
          id: p.id,
          name: p.name,
          price_min: p.price_min,
          price_max: p.price_max,
          status: p.status,
          category: p.category,
          primary_color: p.primary_color,
          secondary_colors: p.secondary_colors,
          fabric_estimate: p.fabric_estimate,
          occasions: p.occasions,
          search_tags: p.search_tags,
          primary_photo_url: p.photos.find((ph) => ph.is_primary)?.url ?? p.photos[0]?.url ?? '',
          photos: p.photos.map((ph) => ph.url),
          variants: availableVariants.map((v) => ({
            color: v.color,
            photo_url: v.photo_url,
            status: v.status as string,
          })),
        }
      })

    return {
      data: {
        retailer: collection.retailer,
        title: collection.title,
        description: collection.description,
        expires_at: collection.expires_at?.toISOString() ?? null,
        products: publicProducts,
      },
    }
  })

  // ─── POST /public/collections/:slug/view ───────────────────────
  server.post('/collections/:slug/view', async (request, reply) => {
    const { slug } = request.params as { slug: string }

    const body = z
      .object({ viewer_token: z.string().max(128).optional() })
      .safeParse(request.body)
    if (!body.success) throw validationError('Invalid body')

    const collection = await prisma.collection.findFirst({
      where: { slug, status: 'ACTIVE', deleted_at: null },
      select: { id: true, retailer_id: true },
    })
    if (!collection) return reply.status(204).send()

    const viewerToken = body.data.viewer_token ?? null
    const ipHash = createHash('sha256')
      .update(request.ip + (request.headers['user-agent'] ?? ''))
      .digest('hex')
      .slice(0, 32)

    // Check if this viewer already logged a view in the last hour (dedup)
    const recentView = viewerToken
      ? await prisma.collectionView.findFirst({
          where: {
            collection_id: collection.id,
            viewer_token: viewerToken,
            created_at: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
        })
      : null

    if (!recentView) {
      await prisma.collectionView.create({
        data: {
          collection_id: collection.id,
          retailer_id: collection.retailer_id,
          viewer_token: viewerToken,
          ip_hash: ipHash,
          user_agent: (request.headers['user-agent'] ?? '').slice(0, 255),
        },
      })

      // Increment cached view count
      await prisma.collection.update({
        where: { id: collection.id },
        data: {
          view_count: { increment: 1 },
          unique_viewer_count: viewerToken ? { increment: 1 } : undefined,
        },
      })
    }

    return reply.status(204).send()
  })

  // ─── POST /public/collections/:slug/enquire ────────────────────
  server.post('/collections/:slug/enquire', async (request, reply) => {
    const { slug } = request.params as { slug: string }

    const body = z
      .object({
        product_id: z.string().optional(),
        product_ids: z.array(z.string()).max(20).optional(),
        customer_name: z.string().max(200).optional(),
        customer_phone: z.string().max(20).optional(),
        message: z.string().max(2000).optional(),
      })
      .safeParse(request.body)
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid')

    const collection = await prisma.collection.findFirst({
      where: { slug, status: 'ACTIVE', deleted_at: null },
      select: { id: true, retailer_id: true, title: true, retailer: { select: { shop_name: true, phone: true } } },
    })
    if (!collection) throw notFound('Collection')

    const { product_id, product_ids, customer_name, customer_phone, message } = body.data

    // Record enquiry for analytics
    await prisma.collectionEnquiry.create({
      data: {
        collection_id: collection.id,
        retailer_id: collection.retailer_id,
        product_id: product_id ?? null,
        customer_name: customer_name ?? null,
        customer_phone: customer_phone ?? null,
        message: message ?? null,
      },
    })

    await prisma.collection.update({
      where: { id: collection.id },
      data: { enquiry_count: { increment: 1 } },
    })

    // Build WhatsApp redirect URL
    const interestedProducts = product_ids ?? (product_id ? [product_id] : [])
    const whatsappMessage =
      message ??
      buildEnquiryMessage({
        shopName: collection.retailer.shop_name,
        collectionTitle: collection.title,
        products: interestedProducts.map((id) => ({ name: id, price_min: null })),
      })

    const phone = collection.retailer.phone.replace(/\D/g, '')
    const fullPhone = phone.startsWith('91') ? phone : `91${phone}`
    const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(whatsappMessage)}`

    return reply.status(200).send({ data: { whatsapp_url: waUrl } })
  })

  // ─── POST /public/collections/:slug/favorite ───────────────────
  server.post('/collections/:slug/favorite', async (request, reply) => {
    const { slug } = request.params as { slug: string }

    const body = z
      .object({ product_id: z.string() })
      .safeParse(request.body)
    if (!body.success) throw validationError('Invalid body')

    const collection = await prisma.collection.findFirst({
      where: { slug, status: 'ACTIVE', deleted_at: null },
      select: { id: true },
    })
    if (!collection) return reply.status(204).send()

    // Increment favorite count (no user tracking — stored in localStorage on client)
    await prisma.collection.update({
      where: { id: collection.id },
      data: { favorite_count: { increment: 1 } },
    })

    return reply.status(204).send()
  })
}
