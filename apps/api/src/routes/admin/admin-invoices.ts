import { getDownloadPresignedUrl } from '@kanchuki/ai';
// ─── Admin Invoices ────────────────────────────────────────────────
// GET /admin/invoices                         — list all invoices (subscriptions + add-on packs)
// GET /admin/invoices/:retailer_id            — list invoices for a retailer
// GET /admin/invoices/:retailer_id/:id/pdf    — presigned download URL
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import {
  ADDON_INVOICE_SELECT,
  addonInvoiceRow,
  addonWhere,
  byDateDesc,
} from '../../lib/addon-gst-report.js';

export const adminInvoicesRoutes: FastifyPluginAsync = async (server) => {
  // ── List all invoices (admin) ───────────────────────────────────
  server.get(
    '/invoices',
    {
      schema: {
        description: 'List all subscription and add-on pack invoices across retailers',
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
    },
    async (request, reply) => {
      const {
        retailer_id,
        limit = 50,
        offset = 0,
      } = request.query as {
        retailer_id?: string;
        limit?: number;
        offset?: number;
      };

      const where = retailer_id ? { retailer_id } : {};
      const aWhere = addonWhere({ retailerId: retailer_id, invoiced: true });
      // Two tables, one page: take offset+limit from each, merge, then slice.
      const take = offset + limit;

      const [payments, addons, subTotal, addonTotal] = await Promise.all([
        prisma.subscriptionPayment.findMany({
          where,
          orderBy: { paid_at: 'desc' },
          take,
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
        prisma.quotaAddonPurchase.findMany({
          where: aWhere,
          orderBy: { completed_at: 'desc' },
          take,
          select: ADDON_INVOICE_SELECT,
        }),
        prisma.subscriptionPayment.count({ where }),
        prisma.quotaAddonPurchase.count({ where: aWhere }),
      ]);

      const merged = [
        ...payments.map((p) => ({ ...p, kind: 'subscription' as const })),
        ...addons.map(addonInvoiceRow),
      ]
        .sort(byDateDesc((r) => r.paid_at))
        .slice(offset, offset + limit);

      return reply.send({ payments: merged, total: subTotal + addonTotal, limit, offset });
    },
  );

  // ── List invoices for a specific retailer ───────────────────────
  server.get(
    '/invoices/:retailer_id',
    {
      schema: {
        description: 'List invoices for a specific retailer',
        tags: ['admin', 'invoices'],
        params: {
          type: 'object',
          properties: { retailer_id: { type: 'string' } },
          required: ['retailer_id'],
        },
      },
    },
    async (request, reply) => {
      const { retailer_id } = request.params as { retailer_id: string };

      const [payments, addons] = await Promise.all([
        prisma.subscriptionPayment.findMany({
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
        }),
        prisma.quotaAddonPurchase.findMany({
          where: addonWhere({ retailerId: retailer_id, invoiced: true }),
          orderBy: { completed_at: 'desc' },
          select: ADDON_INVOICE_SELECT,
        }),
      ]);

      return reply.send(
        [
          ...payments.map((p) => ({ ...p, kind: 'subscription' as const })),
          ...addons.map(addonInvoiceRow),
        ].sort(byDateDesc((r) => r.paid_at)),
      );
    },
  );

  // ── Get presigned PDF URL ───────────────────────────────────────
  server.get(
    '/invoices/:retailer_id/:id/pdf',
    {
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
    },
    async (request, reply) => {
      const { retailer_id, id } = request.params as { retailer_id: string; id: string };

      const payment = await prisma.subscriptionPayment.findFirst({
        where: { id },
        select: { invoice_r2_key: true },
      });
      // Not a subscription invoice: an add-on pack of the retailer in the URL.
      const key = payment
        ? payment.invoice_r2_key
        : (
            await prisma.quotaAddonPurchase.findFirst({
              where: { id, retailer_id },
              select: { invoice_r2_key: true },
            })
          )?.invoice_r2_key;

      if (!key) {
        return reply.code(404).send({ error: 'Invoice not found or PDF not yet generated' });
      }

      const url = await getDownloadPresignedUrl(key, 300);
      return reply.send({ url });
    },
  );
};
