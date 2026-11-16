import { getDownloadPresignedUrl } from '@kanchuki/ai';
// ─── Retailer Invoices ─────────────────────────────────────────────
// GET /me/invoices        — list invoices with GST breakdown (subscriptions + add-on packs)
// GET /me/invoices/:id/pdf — presigned download URL for invoice PDF
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import {
  ADDON_INVOICE_SELECT,
  addonInvoiceRow,
  addonWhere,
  byDateDesc,
} from '../../lib/addon-gst-report.js';
import { forbidden } from '../../plugins/error-handler.js';

export const retailersInvoicesRoutes: FastifyPluginAsync = async (server) => {
  // ── List invoices for the authenticated retailer ────────────────
  // Subscription invoices and add-on pack invoices, newest first.
  server.get('/me/invoices', async (request, reply) => {
    // Same guard shape as post-templates.ts — the auth hook guarantees this in
    // practice, but the request type declares retailerId as optional.
    if (!request.retailerId) throw forbidden('Sign in to view invoices');
    const retailerId = request.retailerId;

    const [payments, addons] = await Promise.all([
      prisma.subscriptionPayment.findMany({
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
      }),
      // Only invoiced packs: a COMPLETED purchase from before invoicing has no invoice to list.
      prisma.quotaAddonPurchase.findMany({
        where: addonWhere({ retailerId, invoiced: true }),
        orderBy: { completed_at: 'desc' },
        select: ADDON_INVOICE_SELECT,
      }),
    ]);

    const rows = [
      ...payments.map((p) => ({ ...p, kind: 'subscription' as const })),
      ...addons.map(addonInvoiceRow),
    ].sort(byDateDesc((r) => r.paid_at));

    // { data: ... } — matches the web client's apiCall() unwrap convention.
    return reply.send({ data: rows });
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
      if (!request.retailerId) throw forbidden('Sign in to view invoices');
      const retailerId = request.retailerId;
      const { id } = request.params as { id: string };

      const payment = await prisma.subscriptionPayment.findFirst({
        where: { id, retailer_id: retailerId },
        select: { invoice_r2_key: true },
      });
      // Not a subscription invoice: try an add-on pack of the same retailer. A row that
      // exists but has no PDF yet stays a 404 (no fallthrough once the id is matched).
      const key = payment
        ? payment.invoice_r2_key
        : (
            await prisma.quotaAddonPurchase.findFirst({
              where: { id, retailer_id: retailerId },
              select: { invoice_r2_key: true },
            })
          )?.invoice_r2_key;

      if (!key) {
        return reply.code(404).send({ error: 'Invoice not found or PDF not yet generated' });
      }

      // Short-lived presigned URL — the object is private and the key is a
      // random UUID, so the link is the only way in and it expires in 5 min.
      const url = await getDownloadPresignedUrl(key, 300);
      return reply.send({ data: { url } });
    },
  );
};
