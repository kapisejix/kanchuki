import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { decryptSecret, encryptSecret, maskSecret, prisma } from '@kanchuki/db';
// Auto-split from checkout.ts (scripts/split-checkout-routes.mjs) — route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import {
  featureUnavailable,
  forbidden,
  notFound,
  validationError,
} from '../../plugins/error-handler.js';
import {
  CreateOrderSchema,
  type RazorpayOrder,
  computeGst,
  generateGstInvoiceNumber,
  razorpayAsRetailer,
} from './checkout-helpers.js';

export const checkoutFlowRoutes: FastifyPluginAsync = async (server) => {
  // ═══════════════════════════════════════════════════════════════
  //  ORDER CREATION (public, anonymous — customer checkout)
  // ═══════════════════════════════════════════════════════════════

  // ── POST /public/checkout/create-order ──────────────────────────
  // Create an order + Razorpay order. Server computes amounts atomically.
  // SECURITY: Per-IP rate limited to prevent product-reservation brute force.
  server.post(
    '/public/checkout/create-order',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          keyGenerator: (req) => req.ip,
        },
      },
    },
    async (request) => {
      const body = CreateOrderSchema.safeParse(request.body);
      if (!body.success) {
        throw validationError(body.error.issues[0]?.message ?? 'Invalid order');
      }

      const { items, collection_id, customer_name, customer_phone, shipping_address } = body.data;
      const firstItem = items[0];
      if (!firstItem) throw validationError('No items in order');

      // 1. Find the retailer via the first product
      const firstProduct = await prisma.product.findUnique({
        where: { id: firstItem.product_id },
        select: { retailer_id: true, name: true, price_min: true, status: true },
      });
      if (!firstProduct) throw notFound('Product');
      const retailerId = firstProduct.retailer_id;

      // 2. Validate all products belong to the same retailer and are AVAILABLE
      const productIds = items.map((i) => i.product_id);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, retailer_id: retailerId },
        select: { id: true, name: true, price_min: true, status: true },
      });

      if (products.length !== items.length) {
        throw validationError('One or more products not found');
      }

      const unavailable = products.filter((p) => p.status !== 'AVAILABLE');
      if (unavailable.length > 0) {
        throw validationError(
          `Product(s) no longer available: ${unavailable.map((p) => p.name ?? p.id).join(', ')}`,
        );
      }

      // 3. F-013: Check CHECKOUT_CART feature is enabled for the retailer
      if (!(await hasFeature(retailerId, 'CHECKOUT_CART'))) {
        throw validationError('This retailer does not accept online payments yet');
      }

      // 4. Check retailer has an active payment account (L2 tier gate)
      const paymentAccount = await prisma.retailerPaymentAccount.findUnique({
        where: { retailer_id: retailerId, is_active: true },
        select: {
          id: true,
          payment_mode: true,
          razorpay_key_id: true,
          razorpay_key_secret_encrypted: true,
        },
      });
      if (!paymentAccount) {
        throw validationError('This retailer does not accept online payments yet');
      }

      // 4. Server-side amount computation (SECURITY §11.6 — never trust client)
      let subtotal = 0;
      const orderItemsData: Array<{
        product_id: string;
        product_name_snapshot: string | null;
        price_snapshot: number;
        quantity: number;
      }> = [];
      for (const item of items) {
        const product = products.find((p) => p.id === item.product_id);
        const price = product?.price_min ?? 0;
        subtotal += price;
        orderItemsData.push({
          product_id: item.product_id,
          product_name_snapshot: product?.name ?? null,
          price_snapshot: price,
          quantity: item.quantity,
        });
      }

      const gstAmount = computeGst(subtotal);
      const totalAmount = subtotal + gstAmount;

      // 5. Atomic product reservation + order creation (SECURITY §11.7)
      // Use a transaction to atomically reserve all products
      const result = await prisma.$transaction(async (tx) => {
        // Try to reserve all products atomically
        for (const item of items) {
          const updated = await tx.product.updateMany({
            where: {
              id: item.product_id,
              retailer_id: retailerId,
              status: 'AVAILABLE',
            },
            data: { status: 'RESERVED' },
          });
          if (updated.count === 0) {
            // Prisma auto-rolls back the entire transaction on throw —
            // no manual rollback needed.
            throw validationError(
              `Product is no longer available: ${products.find((p) => p.id === item.product_id)?.name ?? item.product_id}`,
            );
          }
        }

        // Generate GST invoice number
        const gstInvoiceNumber = generateGstInvoiceNumber();

        // Create the order
        const order = await tx.order.create({
          data: {
            retailer_id: retailerId,
            collection_id: collection_id ?? null,
            customer_name,
            customer_phone,
            shipping_address: shipping_address as object,
            status: 'PENDING_PAYMENT',
            subtotal_amount: subtotal,
            gst_amount: gstAmount,
            total_amount: totalAmount,
            payment_mode: 'DIRECT',
            gst_invoice_number: gstInvoiceNumber,
            items: {
              create: orderItemsData,
            },
          },
          select: {
            id: true,
            total_amount: true,
            gst_amount: true,
            subtotal_amount: true,
            gst_invoice_number: true,
            status: true,
          },
        });

        return { order, gstInvoiceNumber };
      });

      // 6. Create Razorpay order using the retailer's credentials
      const razorpayKeyId = paymentAccount.razorpay_key_id ?? '';
      const razorpayKeySecretEncrypted = paymentAccount.razorpay_key_secret_encrypted ?? '';
      const razorpayOrder = await razorpayAsRetailer<RazorpayOrder>(
        {
          razorpay_key_id: razorpayKeyId,
          razorpay_key_secret_encrypted: razorpayKeySecretEncrypted,
        },
        '/orders',
        {
          method: 'POST',
          body: JSON.stringify({
            amount: totalAmount,
            currency: 'INR',
            receipt: result.order.id,
            notes: {
              retailer_id: retailerId,
              order_id: result.order.id,
            },
          }),
        },
      );

      // 7. Save the Razorpay order ID on our order record
      await prisma.order.update({
        where: { id: result.order.id },
        data: { razorpay_order_id: razorpayOrder.id },
      });

      request.log.info(
        { order_id: result.order.id, razorpay_order_id: razorpayOrder.id },
        'Order created',
      );

      return {
        data: {
          order_id: result.order.id,
          razorpay_order_id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          key_id: paymentAccount.razorpay_key_id ?? '',
          customer_name,
          customer_phone,
          shipping_address,
          gst_invoice_number: result.gstInvoiceNumber,
          subtotal_amount: subtotal,
          gst_amount: gstAmount,
          total_amount: totalAmount,
          items: orderItemsData.map((i) => ({
            product_id: i.product_id,
            name: i.product_name_snapshot,
            price: i.price_snapshot,
            quantity: i.quantity,
          })),
        },
      };
    },
  );

  // ── POST /public/checkout/verify-payment ────────────────────────
  // Verify Razorpay payment signature client-side (called from browser after
  // successful payment). Never flips Order.status alone — the webhook is the
  // durable source of truth — but provides immediate UI feedback.
  server.post(
    '/public/checkout/verify-payment',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (req) => req.ip,
        },
      },
    },
    async (request) => {
      const body = z
        .object({
          razorpay_order_id: z.string().min(1),
          razorpay_payment_id: z.string().min(1),
          razorpay_signature: z.string().min(1),
        })
        .parse(request.body);

      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

      // Look up the order to find which retailer's credentials to use
      const ord = await prisma.order.findUnique({
        where: { razorpay_order_id },
        select: { id: true, retailer_id: true, status: true },
      });
      if (!ord) throw notFound('Order');

      // Get the retailer's payment account to retrieve the key secret for verification
      const payAcct = await prisma.retailerPaymentAccount.findUnique({
        where: { retailer_id: ord.retailer_id, is_active: true },
        select: { razorpay_key_secret_encrypted: true },
      });
      if (!payAcct || !payAcct.razorpay_key_secret_encrypted) {
        throw validationError('Retailer payment account not found');
      }

      const keySecret = decryptSecret(payAcct.razorpay_key_secret_encrypted);

      // HMAC-SHA256(order_id + "|" + payment_id, key_secret)
      const expected = createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      const expectedBuf = Buffer.from(expected);
      const actualBuf = Buffer.from(razorpay_signature);
      const signatureValid =
        expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
      if (!signatureValid) {
        throw validationError('Payment verification failed');
      }

      // SECURITY §11.6: Client callback alone must never flip Order.status to PAID.
      // We store the payment_id but the webhook is the source of truth.
      // Update order with payment_id for reference (status stays PENDING_PAYMENT until webhook)
      await prisma.order.update({
        where: { razorpay_order_id },
        data: { razorpay_payment_id },
      });

      return {
        data: {
          verified: true,
          razorpay_order_id,
          razorpay_payment_id,
          order_id: ord.id,
        },
      };
    },
  );

  // ── GET /public/orders/:id ──────────────────────────────────────
  // Check order status (customer-facing, no auth — uses order ID + phone)
  // SECURITY §11.10: Phone number is required as a second factor to prevent
  // IDOR — anyone with the order ID (leaked via browser history/screenshot)
  // cannot see order details without also knowing the customer's phone.
  server.get(
    '/public/orders/:id',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: (req) => req.ip,
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const query = z
        .object({
          phone: z.string().min(10).max(15),
        })
        .safeParse(request.query);

      if (!query.success) {
        throw validationError('Phone number is required to look up an order');
      }

      const order = await prisma.order.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          total_amount: true,
          gst_amount: true,
          subtotal_amount: true,
          gst_invoice_number: true,
          customer_name: true,
          customer_phone: true,
          paid_at: true,
          created_at: true,
          items: {
            select: {
              product_name_snapshot: true,
              price_snapshot: true,
              quantity: true,
              product_id: true,
            },
          },
          collection_id: true,
        },
      });
      if (!order) throw notFound('Order');

      // SECURITY §11.10: Verify phone number — use timing-safe comparison
      // to prevent response-time oracle attacks (always the same code path).
      const phoneBuffer = Buffer.from(query.data.phone);
      const expectedPhoneBuffer = Buffer.from(order.customer_phone);
      if (
        phoneBuffer.length !== expectedPhoneBuffer.length ||
        !timingSafeEqual(phoneBuffer, expectedPhoneBuffer)
      ) {
        throw notFound('Order');
      }

      // Strip phone from response — don't echo it back
      const { customer_phone: _, ...safeOrder } = order;

      return { data: safeOrder };
    },
  );
};
