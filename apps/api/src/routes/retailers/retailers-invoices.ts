// ─── Retailer Invoices ─────────────────────────────────────────────
// GET /me/invoices        — list invoices with GST breakdown
// GET /me/invoices/:id/pdf — presigned download URL for invoice PDF
import { prisma } from '@kanchuki/db';
import { getDownloadPresignedUrl } from '@kanchuki/ai';
import type { FastifyPluginAsync } from 'fastify';

export const retailersInvoicesRoutes: FastifyPluginAsync = async (server) => {
  // ── List invoices for the authenticated retailer ────────────────
  // List subscription invoices with GST breakdown.
  server.get('/me/invoices', async (_request, reply) => {
    // @ts-expectifice — auth decorator
    const retailerId = (_request as any).retailerId as string;

    const payments = await prisma.subscriptionPayment.findMany({
      where: { retailer_id: retailerId },
      orderBy: { paid_at: 'desc' },
      select: {
        id: true,
        amount_inr: true,
        amount_excluding_gst: true,
        gst_amount: true,
        gst_rate: true,
        cgst_amount: true,
        sgst_amount: true,
        igst_amount: true,
        gst_invoice_number: true,
        invoice_generated_at: true,
        paid_at: true,
        status: true,
        place_of_supply: true,
      },
    });

    // { data: ... } — matches the web client's apiCall() unwrap convention.
    return reply.send({ data: payments });
  });

  // ── Get presigned PDF URL for a specific invoice ────────────────
  server.get(
    '/me/invoices/:id/pdf',
    {
      schema: {
        description: 'Get presigned download URL for an invoice PDF',
        tags: ['retailers', 'invoices'],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      // @ts-expectifice — auth decorator
      const retailerId = (request as any).retailerId as string;
      const { id } = request.params as { id: string };

      const payment = await prisma.subscriptionPayment.findFirst({
        where: { id, retailer_id: retailerId },
        select: { invoice_r2_key: true },
      });

      if (!payment?.invoice_r2_key) {
        return reply.code(404).send({ error: 'Invoice not found or PDF not yet generated' });
      }

      // Short-lived presigned URL — the object is private and the key is a
      // random UUID, so the link is the only way in and it expires in 5 min.
      const url = await getDownloadPresignedUrl(payment.invoice_r2_key, 300);
      return reply.send({ data: { url } });
    },
  );
};
