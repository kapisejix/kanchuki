// ─── Retailer Invoices ─────────────────────────────────────────────
// GET /me/invoices        — list invoices with GST breakdown
// GET /me/invoices/:id/pdf — presigned download URL for invoice PDF
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';

export const retailersInvoicesRoutes: FastifyPluginAsync = async (server) => {
  // ── List invoices for the authenticated retailer ────────────────
  server.get('/me/invoices', {
    schema: {
      description: 'List subscription invoices with GST breakdown',
      tags: ['retailers', 'invoices'],
      response: { 200: { type: 'array' } },
    },
  }, async (_request, reply) => {
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
        invoice_pdf_url: true,
        paid_at: true,
        status: true,
        place_of_supply: true,
      },
    });

    return reply.send(payments);
  });

  // ── Get presigned PDF URL for a specific invoice ────────────────
  server.get('/me/invoices/:id/pdf', {
    schema: {
      description: 'Get presigned download URL for an invoice PDF',
      tags: ['retailers', 'invoices'],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    // @ts-expectifice — auth decorator
    const retailerId = (request as any).retailerId as string;
    const { id } = request.params as { id: string };

    const payment = await prisma.subscriptionPayment.findFirst({
      where: { id, retailer_id: retailerId },
      select: { invoice_pdf_url: true },
    });

    if (!payment?.invoice_pdf_url) {
      return reply.code(404).send({ error: 'Invoice not found or PDF not yet generated' });
    }

    return reply.send({ url: payment.invoice_pdf_url });
  });
};
