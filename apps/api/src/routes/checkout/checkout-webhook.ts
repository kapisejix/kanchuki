import { decryptSecret, encryptSecret, maskSecret, prisma } from '@kanchuki/db';
// Auto-split from checkout.ts (scripts/split-checkout-routes.mjs) — route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';
import type { FastifyRequest } from 'fastify';
import { verifyRetailerWebhookSignature } from './checkout-helpers.js';

export const checkoutWebhookRoutes: FastifyPluginAsync = async (server) => {
  // Razorpay signs the raw body — keep it. Register raw body parser for the
  // webhook endpoint (same pattern as billing.ts).
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req: FastifyRequest, body, done) => {
      (req as FastifyRequest & { rawBody?: string }).rawBody = body as string;
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════
  //  WEBHOOK (public, signature-verified)
  // ═══════════════════════════════════════════════════════════════

  // ── POST /public/webhooks/razorpay ──────────────────────────────
  // Razorpay payment webhook — the ONLY durable source of truth for
  // payment confirmation (SECURITY §11.6).
  server.post('/public/webhooks/razorpay', async (request, reply) => {
    // Use the raw body saved by the content type parser above
    const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody;
    const signature = request.headers['x-razorpay-signature'] as string | undefined;

    if (!signature || !rawBody) {
      return reply.status(401).send({
        error: { code: 'MISSING_SIGNATURE', status: 401 },
      });
    }

    const body = request.body as {
      event: string;
      created_at?: number;
      payload: {
        payment?: {
          entity: {
            id: string;
            order_id?: string;
            amount: number;
            status: string;
          };
        };
      };
    };
    const payload = body;

    // SECURITY §11.3: Look up the order by razorpay_order_id to find the
    // correct retailer's webhook secret — never trust a retailer_id from
    // the request path/body before signature verification.
    const orderId = payload.payload?.payment?.entity?.order_id;
    if (!orderId) {
      return reply.status(400).send({
        error: { code: 'MISSING_ORDER_ID', status: 400 },
      });
    }

    const hookOrder = await prisma.order.findUnique({
      where: { razorpay_order_id: orderId },
      select: { id: true, retailer_id: true, status: true },
    });
    if (!hookOrder) {
      request.log.warn({ razorpay_order_id: orderId }, 'Webhook for unknown order');
      return reply.status(400).send({
        error: { code: 'UNKNOWN_ORDER', status: 400 },
      });
    }

    // Load the retailer's webhook secret and verify signature
    const hookPaymentAcct = await prisma.retailerPaymentAccount.findUnique({
      where: { retailer_id: hookOrder.retailer_id },
      select: { razorpay_webhook_secret_encrypted: true },
    });

    const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    const signatureValid = await verifyRetailerWebhookSignature(
      bodyStr,
      signature,
      hookPaymentAcct?.razorpay_webhook_secret_encrypted ?? null,
    );
    if (!signatureValid) {
      return reply.status(401).send({
        error: { code: 'INVALID_SIGNATURE', status: 401 },
      });
    }

    // Replay protection (SECURITY §11.6)
    const WEBHOOK_MAX_AGE_SECONDS = 300;
    if (
      typeof payload.created_at === 'number' &&
      Math.abs(Date.now() / 1000 - payload.created_at) > WEBHOOK_MAX_AGE_SECONDS
    ) {
      return reply.status(401).send({
        error: { code: 'STALE_EVENT', status: 401 },
      });
    }

    // Handle the event
    const event = payload.event;
    const payment = payload.payload?.payment?.entity;

    if (event === 'payment.captured' || event === 'payment.authorized') {
      if (!payment) return reply.send({ received: true });

      // Idempotent transition: only PENDING_PAYMENT → PAID (SECURITY §11.6 replay protection)
      if (hookOrder.status === 'PENDING_PAYMENT') {
        await prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { razorpay_order_id: orderId },
            data: {
              status: 'PAID',
              razorpay_payment_id: payment.id,
              paid_at: new Date(),
            },
          });

          // Mark all products in the order as SOLD
          const txOrderItems = await tx.orderItem.findMany({
            where: { order_id: hookOrder.id },
            select: { product_id: true },
          });

          if (txOrderItems.length > 0) {
            await tx.product.updateMany({
              where: {
                id: { in: txOrderItems.map((i) => i.product_id) },
              },
              data: { status: 'SOLD' },
            });
          }
        });

        request.log.info(
          {
            order_id: hookOrder.id,
            razorpay_order_id: orderId,
            payment_id: payment.id,
          },
          'Payment confirmed — order paid, products marked sold',
        );
      } else {
        request.log.info(
          { order_id: hookOrder.id, status: hookOrder.status },
          'Webhook received for already-processed order — idempotent skip',
        );
      }
    }

    // Handle payment failure — release products back to AVAILABLE
    if (event === 'payment.failed') {
      if (hookOrder.status === 'PENDING_PAYMENT') {
        await prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { razorpay_order_id: orderId },
            data: { status: 'CANCELLED', cancelled_at: new Date() },
          });

          // Release products back
          const txOrderItems = await tx.orderItem.findMany({
            where: { order_id: hookOrder.id },
            select: { product_id: true },
          });

          if (txOrderItems.length > 0) {
            await tx.product.updateMany({
              where: {
                id: { in: txOrderItems.map((i) => i.product_id) },
                // Only release products that are currently RESERVED by us
                status: 'RESERVED',
              },
              data: { status: 'AVAILABLE' },
            });
          }
        });

        request.log.info(
          { order_id: hookOrder.id, razorpay_order_id: orderId },
          'Payment failed — order cancelled, products released',
        );
      }
    }

    return reply.send({ received: true });
  });
};
