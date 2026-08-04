import { decryptSecret, encryptSecret, maskSecret, prisma } from '@kanchuki/db';
// Auto-split from checkout.ts (scripts/split-checkout-routes.mjs) — route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';
import { hasFeature } from '../../lib/features.js';
import {
  featureUnavailable,
  forbidden,
  notFound,
  validationError,
} from '../../plugins/error-handler.js';
import { UpdateOrderStatusSchema } from './checkout-helpers.js';

export const checkoutOrdersRoutes: FastifyPluginAsync = async (server) => {
  // ═══════════════════════════════════════════════════════════════
  //  RETAILER ORDER MANAGEMENT (authenticated)
  // ═══════════════════════════════════════════════════════════════

  // ── GET /retailers/orders ───────────────────────────────────────
  server.get('/retailers/orders', async (request) => {
    const orders = await prisma.order.findMany({
      where: { retailer_id: request.retailerId },
      select: {
        id: true,
        customer_name: true,
        customer_phone: true,
        status: true,
        total_amount: true,
        subtotal_amount: true,
        gst_amount: true,
        gst_invoice_number: true,
        razorpay_payment_id: true,
        paid_at: true,
        created_at: true,
        updated_at: true,
        cancelled_at: true,
        items: {
          select: {
            id: true,
            product_name_snapshot: true,
            price_snapshot: true,
            quantity: true,
            product_id: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    return { data: orders };
  });

  // ── GET /retailers/orders/:id ────────────────────────────────────
  // Full order detail including shipping_address, payment mode, and
  // Razorpay identifiers — for the order detail screen.
  server.get('/retailers/orders/:id', async (request) => {
    const { id } = request.params as { id: string };

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        retailer_id: true,
        customer_name: true,
        customer_phone: true,
        shipping_address: true,
        status: true,
        total_amount: true,
        subtotal_amount: true,
        gst_amount: true,
        payment_mode: true,
        gst_invoice_number: true,
        razorpay_order_id: true,
        razorpay_payment_id: true,
        collection_id: true,
        paid_at: true,
        created_at: true,
        updated_at: true,
        cancelled_at: true,
        items: {
          select: {
            id: true,
            product_name_snapshot: true,
            price_snapshot: true,
            quantity: true,
            product_id: true,
          },
        },
      },
    });

    if (!order) throw notFound('Order');
    if (order.retailer_id !== request.retailerId) {
      throw forbidden('Not your order');
    }

    // Strip internal fields from response
    const { retailer_id: _, ...safeOrder } = order;
    return { data: safeOrder };
  });

  // ── PATCH /retailers/orders/:id/status ──────────────────────────
  // Update order fulfillment status (mark as fulfilled or cancelled).
  // Only PAID orders can be fulfilled. Only PENDING_PAYMENT/PAID can be cancelled.
  server.patch('/retailers/orders/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const body = UpdateOrderStatusSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid status');

    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true, retailer_id: true },
    });
    if (!order) throw notFound('Order');
    if (order.retailer_id !== request.retailerId) throw forbidden('Not your order');

    const { status } = body.data;

    if (status === 'FULFILLED' && order.status !== 'PAID') {
      throw validationError('Only paid orders can be marked as fulfilled');
    }
    if (status === 'CANCELLED' && order.status === 'FULFILLED') {
      throw validationError('Already fulfilled orders cannot be cancelled');
    }
    if (status === 'CANCELLED' && order.status === 'CANCELLED') {
      throw validationError('Order is already cancelled');
    }

    const cancelledAt = status === 'CANCELLED' ? new Date() : undefined;

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          status,
          ...(cancelledAt ? { cancelled_at: cancelledAt } : {}),
        },
      });

      // If cancelling, release products back to AVAILABLE
      if (status === 'CANCELLED' && order.status !== 'PAID') {
        const orderItems = await tx.orderItem.findMany({
          where: { order_id: id },
          select: { product_id: true },
        });
        if (orderItems.length > 0) {
          await tx.product.updateMany({
            where: { id: { in: orderItems.map((i) => i.product_id) } },
            data: { status: 'AVAILABLE' },
          });
        }
      }
    });

    request.log.info({ order_id: id, status }, 'Order status updated');

    return { data: { id, status } };
  });

  // ── GET /public/checkout/retailer-status/:slug ──────────────────
  // Public endpoint: check if a retailer has online checkout enabled.
  // Used by the customer PWA to show/hide "Buy Now" buttons.
  // F-013: Returns false if CHECKOUT_CART is not enabled for this retailer.
  server.get('/public/checkout/retailer-status/:slug', async (request) => {
    const { slug } = request.params as { slug: string };

    // First try to find by public_slug (QR storefront), then by collection slug
    const retailer = await prisma.retailer.findFirst({
      where: {
        OR: [
          { public_slug: slug },
          ...(slug.includes('-')
            ? [
                {
                  collections: {
                    some: { slug },
                  },
                },
              ]
            : []),
        ],
        deleted_at: null,
      },
      select: { id: true },
    });

    if (!retailer) {
      // Try direct product lookup via collection
      const collection = await prisma.collection.findUnique({
        where: { slug },
        select: { retailer_id: true },
      });
      if (!collection) {
        return { data: { checkout_enabled: false } };
      }
    }

    const retailerId =
      retailer?.id ??
      (
        await prisma.collection.findUnique({
          where: { slug },
          select: { retailer_id: true },
        })
      )?.retailer_id;

    if (!retailerId) {
      return { data: { checkout_enabled: false } };
    }

    // F-013: Check plan feature first
    const checkoutEnabled = await hasFeature(retailerId, 'CHECKOUT_CART');
    if (!checkoutEnabled) {
      return { data: { checkout_enabled: false } };
    }

    const paymentAccount = await prisma.retailerPaymentAccount.findUnique({
      where: { retailer_id: retailerId, is_active: true },
      select: { id: true },
    });

    return {
      data: {
        checkout_enabled: !!paymentAccount,
      },
    };
  });
};
