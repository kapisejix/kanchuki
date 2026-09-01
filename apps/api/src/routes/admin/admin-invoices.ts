// ─── Admin Invoices ────────────────────────────────────────────────
// GET /admin/invoices                         — list all invoices
// GET /admin/invoices/:retailer_id            — list invoices for a retailer
// GET /admin/invoices/:retailer_id/:id/pdf    — presigned download URL
import { prisma } from '@kanchuki/db';
import { getDownloadPresignedUrl } from '@kanchuki/ai';
import type { FastifyPluginAsync } from 'fastify';

export const adminInvoicesRoutes: FastifyPluginAsync = async (server) => {
  // ── List all invoices (admin) ───────────────────────────────────
  server.get('/invoices', {
    schema: {
      description: 'List all subscription invoices across retailers',
      tags: ['admin', 'invoices'],
      querystring: {
        type: 'object',
        properties: {
          retailer_id: { type: 'string' },
          limit: { type: 'number', default: 50 },
          offset: { type: 'number', default: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const { retailer_id, limit = 50, offset = 0 } = request.query as {
      retailer_id?: string;
      limit?: number;
      offset?: number;
    };

    const where = retailer_id ? { retailer_id } : {};

    const [payments, total] = await Promise.all([
      prisma.subscriptionPayment.findMany({
        where,
        orderBy: { paid_at: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          retailer_id: true,
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
      }),
      prisma.subscriptionPayment.count({ where }),
    ]);

    return reply.send({ payments, total, limit, offset });
  });

  // ── List invoices for a specific retailer ───────────────────────
  server.get('/invoices/:retailer_id', {
    schema: {
      description: 'List invoices for a specific retailer',
      tags: ['admin', 'invoices'],
      params: {
        type: 'object',
        properties: { retailer_id: { type: 'string' } },
        required: ['retailer_id'],
      },
    },
  }, async (request, reply) => {
    const { retailer_id } = request.params as { retailer_id: string };

    const payments = await prisma.subscriptionPayment.findMany({
      where: { retailer_id },
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

    return reply.send(payments);
  });

  // ── Get presigned PDF URL ───────────────────────────────────────
  server.get('/invoices/:retailer_id/:id/pdf', {
    schema: {
      description: 'Get presigned download URL for an invoice PDF',
      tags: ['admin', 'invoices'],
      params: {
        type: 'object',
        properties: {
          retailer_id: { type: 'string' },
          id: { type: 'string' },
        },
        required: ['retailer_id', 'id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { retailer_id: string; id: string };

    const payment = await prisma.subscriptionPayment.findFirst({
      where: { id },
      select: { invoice_r2_key: true },
    });

    if (!payment?.invoice_r2_key) {
      return reply.code(404).send({ error: 'Invoice not found or PDF not yet generated' });
    }

    const url = await getDownloadPresignedUrl(payment.invoice_r2_key, 300);
    return reply.send({ url });
  });
};
