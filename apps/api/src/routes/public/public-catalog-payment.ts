// Auto-split from public.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { razorpay, verifyPaymentLinkSignature } from '../billing/billing-helpers.js';

export const publicCatalogPaymentRoutes: FastifyPluginAsync = async (server) => {
  // ── GET /public/catalog-upload-tickets/:id/payment-callback ─────
  // F-019: Razorpay Payment Link redirect after a retailer pays for the
  // on-site catalog upload service. No JWT — Razorpay's browser redirect
  // can't carry a Bearer token, so this route lives under /v1/public (the
  // one auth-exempt prefix) and verifies via HMAC signature instead, same
  // as billing.ts's addon-callback.
  server.get<{ Params: { id: string } }>(
    '/catalog-upload-tickets/:id/payment-callback',
    async (request, reply) => {
      const query = z
        .object({
          razorpay_payment_id: z.string().optional(),
          razorpay_payment_link_id: z.string().optional(),
          razorpay_payment_link_reference_id: z.string().optional(),
          razorpay_payment_link_status: z.string().optional(),
          razorpay_signature: z.string().optional(),
        })
        .safeParse(request.query);

      const params = query.success ? query.data : {};
      const { razorpay_payment_id, razorpay_payment_link_id, razorpay_signature } = params;

      const failPage = (message: string) =>
        reply
          .status(400)
          .type('text/html')
          .send(`<html><body><p>${message}</p><p>Return to the Kanchuki app.</p></body></html>`);

      if (!razorpay_payment_id || !razorpay_payment_link_id || !razorpay_signature) {
        return failPage('Missing payment parameters.');
      }

      const ticket = await prisma.supportTicket.findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
          ticket_type: true,
          razorpay_order_id: true,
          paid_at: true,
          quoted_price_inr: true,
        },
      });
      if (
        !ticket ||
        ticket.ticket_type !== 'CATALOG_UPLOAD' ||
        ticket.razorpay_order_id !== razorpay_payment_link_id
      ) {
        return failPage('Payment could not be matched to a request.');
      }
      if (ticket.paid_at) {
        return reply
          .type('text/html')
          .send('<html><body><p>Already paid. Return to the Kanchuki app.</p></body></html>');
      }

      // Signature (empty key secret = fail) — documented 4-part form when the
      // callback carries link status, legacy 2-part form otherwise.
      const linkStatus = params.razorpay_payment_link_status;
      const verified =
        (linkStatus === undefined || linkStatus === 'paid') &&
        ((linkStatus !== undefined &&
          (await verifyPaymentLinkSignature({
            linkId: razorpay_payment_link_id,
            paymentId: razorpay_payment_id,
            signature: razorpay_signature,
            referenceId: params.razorpay_payment_link_reference_id,
            status: linkStatus,
          }))) ||
          (await verifyPaymentLinkSignature({
            linkId: razorpay_payment_link_id,
            paymentId: razorpay_payment_id,
            signature: razorpay_signature,
          })));

      if (!verified) {
        request.log.warn({ ticket_id: ticket.id }, 'Catalog upload payment signature mismatch');
        return failPage('Payment verification failed.');
      }

      // A signature proves the redirect came from Razorpay, not that the money
      // is right: confirm with Razorpay the payment is captured, in INR, and for
      // exactly the admin-quoted price before marking the ticket paid.
      try {
        const payment = await razorpay<{ amount: number; currency: string; status: string }>(
          `/payments/${razorpay_payment_id}`,
        );
        if (
          payment.status !== 'captured' ||
          payment.currency !== 'INR' ||
          ticket.quoted_price_inr == null ||
          payment.amount !== ticket.quoted_price_inr * 100
        ) {
          request.log.error(
            { ticket_id: ticket.id, status: payment.status, amount: payment.amount },
            'Catalog upload payment status/amount mismatch — not marking paid',
          );
          return failPage('Payment could not be confirmed.');
        }
      } catch (err) {
        request.log.error({ err, ticket_id: ticket.id }, 'Catalog upload payment lookup failed');
        return failPage('Payment could not be confirmed.');
      }

      // Conditional flip: a replayed callback marks paid once.
      await prisma.supportTicket.updateMany({
        where: { id: ticket.id, paid_at: null },
        data: { paid_at: new Date() },
      });

      request.log.info({ ticket_id: ticket.id }, 'Catalog upload payment verified');

      return reply
        .type('text/html')
        .send(
          '<html><body><p>Payment received — return to the Kanchuki app to pick your visit slot.</p></body></html>',
        );
    },
  );
};
