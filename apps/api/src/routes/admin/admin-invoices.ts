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
import { archiveKind, includeArchive } from '../../lib/gst-invoice-archive.js';

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

      const withArchive = includeArchive({ retailerId: retailer_id });
      const [payments, addons, subTotal, addonTotal, archived, archivedTotal] = await Promise.all([
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
        withArchive
          ? prisma.gstInvoiceArchive.findMany({ orderBy: { invoice_date: 'desc' }, take })
          : [],
        withArchive ? prisma.gstInvoiceArchive.count() : 0,
      ]);

      const merged = [
        ...payments.map((p) => ({ ...p, kind: 'subscription' as const })),
        ...addons.map(addonInvoiceRow),
        // retailer_id 'archived' keeps the /invoices/:retailer_id/:id/pdf link working.
        ...archived.map((p) => ({
          id: p.source_id,
          retailer_id: 'archived',
          amount_inr: p.amount_inr,
          amount_excluding_gst: p.amount_excluding_gst,
          gst_amount: p.gst_amount,
          gst_rate: p.gst_rate,
          cgst_amount: p.cgst_amount,
          sgst_amount: p.sgst_amount,
          igst_amount: p.igst_amount,
          gst_invoice_number: p.invoice_number,
          paid_at: p.invoice_date,
          status: p.source_status === 'COMPLETED' ? 'success' : p.source_status,
          place_of_supply: p.place_of_supply,
          buyer_name: p.buyer_name,
          buyer_gstin: p.buyer_gstin,
          kind: archiveKind(p.source_table),
          archived: true,
        })),
      ]
        .sort(byDateDesc((r) => r.paid_at))
        .slice(offset, offset + limit);

      return reply.send({
        payments: merged,
        total: subTotal + addonTotal + archivedTotal,
        limit,
        offset,
      });
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
      const addon = payment
        ? null
        : await prisma.quotaAddonPurchase.findFirst({
            where: { id, retailer_id },
            select: { invoice_r2_key: true },
          });
      // Neither: the retailer was deleted and the invoice lives in the archive.
      const archived =
        payment || addon
          ? null
          : await prisma.gstInvoiceArchive.findFirst({
              where: { source_id: id },
              select: { invoice_r2_key: true },
            });
      const key = payment?.invoice_r2_key ?? addon?.invoice_r2_key ?? archived?.invoice_r2_key;

      if (!key) {
        return reply.code(404).send({ error: 'Invoice not found or PDF not yet generated' });
      }

      const url = await getDownloadPresignedUrl(key, 300);
      return reply.send({ url });
    },
  );
};
