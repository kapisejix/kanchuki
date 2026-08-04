// Auto-split from retailers.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { getSecret, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../../plugins/error-handler.js';
import { getCatalogUploadPromo } from '../admin-settings.js';
import { routeTicket } from '../team.js';

// F-019: platform's own Razorpay account (retailer pays Kanchuki), not the
// F-302 retailer-connected-account rail. ponytail: raw fetch, mirrors billing.ts.
async function razorpayPlatform<T>(path: string, init?: RequestInit): Promise<T> {
  const keyId = (await getSecret('RAZORPAY_KEY_ID')) ?? '';
  const keySecret = (await getSecret('RAZORPAY_KEY_SECRET')) ?? '';
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Razorpay ${res.status}: ${errBody}`);
  }
  return res.json() as Promise<T>;
}

const CATALOG_TICKET_SELECT = {
  id: true,
  status: true,
  ticket_type: true,
  item_count_requested: true,
  quoted_price_inr: true,
  proposed_slots: true,
  confirmed_slot: true,
  razorpay_order_id: true,
  paid_at: true,
  created_at: true,
  resolved_at: true,
} as const;

/** Fetch a CATALOG_UPLOAD ticket, scoped to the calling retailer (IDOR guard). */
async function findOwnCatalogTicket(ticketId: string, retailerId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { ...CATALOG_TICKET_SELECT, retailer_id: true },
  });
  if (!ticket || ticket.retailer_id !== retailerId || ticket.ticket_type !== 'CATALOG_UPLOAD') {
    throw notFound('Catalog upload request');
  }
  return ticket;
}

export const retailersCatalogUploadRoutes: FastifyPluginAsync = async (server) => {
  // ── POST /me/catalog-upload-request ─────────────────────────────
  // Retailer requests the paid on-site catalog upload service — skippable at
  // onboarding, or anytime from the dashboard. Admin quotes a price next.
  server.post('/me/catalog-upload-request', async (request, reply) => {
    const body = z
      .object({
        item_count_estimate: z.number().int().min(1).max(100000),
        note: z.string().max(2000).optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid request');

    const ticket = await prisma.supportTicket.create({
      data: {
        retailer_id: request.retailerId,
        requires_visit: true,
        ticket_type: 'CATALOG_UPLOAD',
        item_count_requested: body.data.item_count_estimate,
        note: body.data.note,
      },
      select: CATALOG_TICKET_SELECT,
    });

    // Surface the current limited-time free-item offer (2026-08-04) so the
    // mobile dashboard can show "first N items free" against this request.
    const promo = await getCatalogUploadPromo();

    return reply.status(201).send({ data: { ...ticket, promo } });
  });

  // ── GET /me/catalog-upload-request ──────────────────────────────
  server.get('/me/catalog-upload-request', async (request) => {
    const tickets = await prisma.supportTicket.findMany({
      where: { retailer_id: request.retailerId, ticket_type: 'CATALOG_UPLOAD' },
      select: CATALOG_TICKET_SELECT,
      orderBy: { created_at: 'desc' },
    });
    return { data: tickets };
  });

  // ── POST /me/catalog-upload-request/:id/pay ─────────────────────
  // Creates a Razorpay Payment Link for the admin-quoted price (same pattern
  // as F-010's addon-checkout) — the mobile app has no Standard Checkout SDK,
  // just opens checkout_url in the browser. Amount is computed server-side
  // from the stored quote — never trust a client-supplied amount. Verification
  // happens via the public redirect callback below, not a client POST, since
  // there's no in-app checkout widget to hand a signature back to us.
  server.post<{ Params: { id: string } }>('/me/catalog-upload-request/:id/pay', async (request) => {
    const ticket = await findOwnCatalogTicket(request.params.id, request.retailerId);
    if (ticket.quoted_price_inr == null) {
      throw validationError('This request has not been quoted yet');
    }
    if (ticket.paid_at) {
      throw validationError('This request has already been paid');
    }

    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { phone: true, shop_name: true },
    });

    const publicHost = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `${request.protocol}://${request.host}`;
    const callbackUrl = `${publicHost.replace(/\/+$/, '')}/v1/public/catalog-upload-tickets/${ticket.id}/payment-callback`;

    const paymentLink = await razorpayPlatform<{ id: string; short_url: string }>(
      '/payment_links',
      {
        method: 'POST',
        body: JSON.stringify({
          amount: ticket.quoted_price_inr * 100, // paise
          currency: 'INR',
          accept_partial: false,
          description: `Kanchuki catalog upload service (${ticket.item_count_requested ?? '?'} items)`,
          customer: { name: retailer?.shop_name, contact: retailer?.phone },
          notify: { sms: false, email: false },
          callback_url: callbackUrl,
          callback_method: 'get',
          notes: { ticket_id: ticket.id, retailer_id: request.retailerId, type: 'catalog_upload' },
        }),
      },
    );

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { razorpay_order_id: paymentLink.id },
    });

    return { data: { checkout_url: paymentLink.short_url } };
  });

  // ── POST /me/catalog-upload-request/:id/confirm-slot ────────────
  // Retailer picks one of admin's proposed visit slots. Payment must have
  // already succeeded — no visit is ever scheduled against an unpaid request.
  server.post<{ Params: { id: string } }>(
    '/me/catalog-upload-request/:id/confirm-slot',
    async (request) => {
      const body = z.object({ slot: z.string().datetime() }).safeParse(request.body);
      if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid slot');

      const ticket = await findOwnCatalogTicket(request.params.id, request.retailerId);
      if (!ticket.paid_at) throw forbidden('Payment is required before selecting a visit slot');

      const proposedSlots = Array.isArray(ticket.proposed_slots)
        ? (ticket.proposed_slots as string[])
        : [];
      if (!proposedSlots.includes(body.data.slot)) {
        throw validationError('Selected slot is not one of the proposed options');
      }

      const retailer = await prisma.retailer.findUnique({
        where: { id: request.retailerId },
        select: { territory_id: true },
      });

      const assignedTo = await routeTicket(
        ticket.id,
        true,
        retailer?.territory_id ?? null,
        null,
        request.log,
      );

      const updated = await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          confirmed_slot: new Date(body.data.slot),
          ...(assignedTo ? { assigned_to_id: assignedTo, status: 'ASSIGNED' } : {}),
        },
        select: CATALOG_TICKET_SELECT,
      });

      return { data: updated };
    },
  );
};
