// Auto-split from public.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSecret, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

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
        select: { id: true, ticket_type: true, razorpay_order_id: true, paid_at: true },
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

      const secret = (await getSecret('RAZORPAY_KEY_SECRET')) ?? '';
      const expected = createHmac('sha256', secret)
        .update(`${razorpay_payment_link_id}|${razorpay_payment_id}`)
        .digest('hex');
      const expectedBuf = Buffer.from(expected);
      const providedBuf = Buffer.from(razorpay_signature);
      const verified =
        expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);

      if (!verified) {
        request.log.warn({ ticket_id: ticket.id }, 'Catalog upload payment signature mismatch');
        return failPage('Payment verification failed.');
      }

      await prisma.supportTicket.update({
        where: { id: ticket.id },
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
