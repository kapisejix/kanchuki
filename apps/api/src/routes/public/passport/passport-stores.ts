// passport-stores.ts — store visit list + mute + contact removal (split from apps/api/src/routes/public/passport.ts — body byte-identical)
import { prisma } from '@kanchuki/db';
import { normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { CURRENT_NOTICE_VERSION, getPassportSession } from './passport-helpers.js';
export const passportStoresRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /passport/stores ──────────────────────────────────────
  // List stores the shopper has visited. Number always masked.
  server.get('/stores', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }

    const visits = await prisma.customerStoreVisit.findMany({
      where: { customer_account_id: session.customer_account_id },
      include: {
        retailer: {
          select: { id: true, shop_name: true, city: true, logo_url: true },
        },
      },
      orderBy: { last_visited_at: 'desc' },
    });

    return reply.status(200).send({
      stores: visits.map((v) => ({
        retailer: v.retailer,
        first_visited_at: v.first_visited_at,
        last_visited_at: v.last_visited_at,
        visit_count: v.visit_count,
        is_muted: v.is_muted,
        contact_shared: v.contact_shared,
      })),
    });
  });
  // ─── POST /passport/stores/:retailerId/mute ────────────────────
  // Toggle mute for a store. Muted stores are skipped in WhatsApp sends.
  server.post('/stores/:retailerId/mute', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }

    const { retailerId } = request.params as { retailerId: string };

    const visit = await prisma.customerStoreVisit.findUnique({
      where: {
        customer_account_id_retailer_id: {
          customer_account_id: session.customer_account_id,
          retailer_id: retailerId,
        },
      },
    });
    if (!visit) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Store not found' } });
    }

    const newMuted = !visit.is_muted;
    await prisma.customerStoreVisit.update({
      where: { id: visit.id },
      data: { is_muted: newMuted },
    });

    // Write ConsentEvent
    await prisma.consentEvent.create({
      data: {
        customer_account_id: session.customer_account_id,
        retailer_id: retailerId,
        kind: newMuted ? 'STORE_MUTED' : 'STORE_UNMUTED',
        notice_version: CURRENT_NOTICE_VERSION,
      },
    });

    return reply.status(200).send({ ok: true, is_muted: newMuted });
  });
  // ─── POST /passport/stores/:retailerId/remove ──────────────────
  // Remove contact from a store. Soft-deletes the Customer row,
  // keeps the visit history with contact_shared=false.
  server.post('/stores/:retailerId/remove', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }

    const { retailerId } = request.params as { retailerId: string };

    const visit = await prisma.customerStoreVisit.findUnique({
      where: {
        customer_account_id_retailer_id: {
          customer_account_id: session.customer_account_id,
          retailer_id: retailerId,
        },
      },
    });
    if (!visit) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Store not found' } });
    }

    // Soft-delete the retailer-scoped Customer row for this account
    const account = session.customer_account;
    const normalizedPhone = normalizeIndianPhone(account.phone);
    await prisma.customer.updateMany({
      where: {
        retailer_id: retailerId,
        phone: normalizedPhone,
        deleted_at: null,
      },
      data: { deleted_at: new Date() },
    });

    // Update visit to reflect withdrawal
    await prisma.customerStoreVisit.update({
      where: { id: visit.id },
      data: {
        contact_shared: false,
        whatsapp_consent: false,
        whatsapp_consent_at: null,
      },
    });

    // Write ConsentEvent
    await prisma.consentEvent.create({
      data: {
        customer_account_id: session.customer_account_id,
        retailer_id: retailerId,
        kind: 'STORE_CONSENT_WITHDRAWN',
        notice_version: CURRENT_NOTICE_VERSION,
      },
    });

    return reply.status(200).send({ ok: true });
  });
};
