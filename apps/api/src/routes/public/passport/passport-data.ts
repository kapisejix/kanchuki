// passport-data.ts — DPDP export + erase (split from apps/api/src/routes/public/passport.ts — body byte-identical)
import { randomBytes } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import {
  COOKIE_DOMAIN,
  COOKIE_NAME,
  COOKIE_SECURE,
  CURRENT_NOTICE_VERSION,
  getPassportSession,
} from './passport-helpers.js';
export const passportDataRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /passport/export ──────────────────────────────────────
  // DPDP right to data portability — returns all data as JSON.
  // Rate-limited to 1 request per day.
  server.get('/export', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'Passport session required' } });
    }

    const accountId = session.customer_account_id;

    // Rate limit: 1 export per day
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentExport = await prisma.consentEvent.findFirst({
      where: {
        customer_account_id: accountId,
        kind: 'DATA_EXPORTED',
        created_at: { gte: oneDayAgo },
      },
    });

    if (recentExport) {
      return reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: 'You can only export your data once per day' },
      });
    }

    // Fetch all data
    const account = await prisma.customerAccount.findUnique({
      where: { id: accountId },
      select: {
        phone: true,
        name: true,
        gender: true,
        city: true,
        state: true,
        usual_size: true,
        pref_colors: true,
        pref_styles: true,
        pref_fabrics: true,
        budget_min: true,
        budget_max: true,
        profiling_enabled: true,
        created_at: true,
      },
    });

    const storeVisits = await prisma.customerStoreVisit.findMany({
      where: { customer_account_id: accountId },
      select: {
        retailer_id: true,
        first_visited_at: true,
        last_visited_at: true,
        visit_count: true,
        whatsapp_consent: true,
      },
    });

    const interactions: {
      retailer_id: string;
      product_id: string | null;
      type: string;
      created_at: Date;
    }[] = [];

    const wishlist = await prisma.customerWishlistItem.findMany({
      where: { customer_account_id: accountId },
      select: {
        product_id: true,
        retailer_id: true,
        created_at: true,
      },
    });

    const recentlyViewed = await prisma.customerRecentlyViewed.findMany({
      where: { customer_account_id: accountId },
      select: {
        product_id: true,
        retailer_id: true,
        viewed_at: true,
      },
      orderBy: { viewed_at: 'desc' },
      take: 100,
    });

    // Record the export event
    await prisma.consentEvent.create({
      data: {
        customer_account_id: accountId,
        kind: 'DATA_EXPORTED',
        notice_version: CURRENT_NOTICE_VERSION,
      },
    });

    return reply.status(200).send({
      account,
      store_visits: storeVisits,
      interactions,
      wishlist,
      recently_viewed: recentlyViewed,
    });
  });
  // ─── POST /passport/delete ─────────────────────────────────────
  // DPDP right to erasure — soft-deletes the account, revokes sessions,
  // and records the deletion event. Anonymizes PII.
  server.post('/delete', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'Passport session required' } });
    }

    const accountId = session.customer_account_id;

    // Record the deletion event before deleting
    await prisma.consentEvent.create({
      data: {
        customer_account_id: accountId,
        kind: 'PASSPORT_DELETED',
        notice_version: CURRENT_NOTICE_VERSION,
      },
    });

    // Soft-delete the account (anonymize PII)
    const deletedPhone = `deleted_${Date.now()}_${randomBytes(4).toString('hex')}`;
    await prisma.customerAccount.update({
      where: { id: accountId },
      data: {
        deleted_at: new Date(),
        phone: deletedPhone,
        phone_hash: deletedPhone,
        name: null,
        gender: null,
        city: null,
        state: null,
        pref_colors: [],
        pref_styles: [],
        pref_fabrics: [],
        budget_min: null,
        budget_max: null,
        notes: null,
      },
    });

    // Revoke all sessions for this account
    await prisma.passportSession.updateMany({
      where: { customer_account_id: accountId, revoked_at: null },
      data: { revoked_at: new Date() },
    });

    // Clear the cookie
    const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', 'Path=/'];
    if (COOKIE_SECURE) parts.push('Secure');
    if (process.env.NODE_ENV === 'production') {
      parts.push(`Domain=${COOKIE_DOMAIN}`);
    }
    reply.header('Set-Cookie', parts.join('; '));

    return reply.status(200).send({ ok: true });
  });
};
