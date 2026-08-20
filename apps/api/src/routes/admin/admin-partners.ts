// Admin routes for the Partner Network Manager.
// Admins see ALL retailers' partners and referral activity.
// Retailers use /retailers/me/partners/* (retailer-scoped).
//
// SECURITY: guarded by adminAuthPreHandler like every /v1/admin route.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { notFound } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

export const adminPartnerRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/partners ────────────────────────────────────────
  // List ALL partners across all retailers, newest first.
  server.get('/partners', async () => {
    const partners = await prisma.partner.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        retailer: {
          select: { id: true, shop_name: true, phone: true },
        },
        _count: {
          select: { referrals: true, events: true },
        },
      },
    });
    return { data: partners };
  });

  // ─── GET /admin/partners/:id ────────────────────────────────────
  // Get a single partner with retailer info and referral summary.
  server.get('/partners/:id', async (request) => {
    const { id } = request.params as { id: string };
    const partner = await prisma.partner.findUnique({
      where: { id },
      include: {
        retailer: {
          select: { id: true, shop_name: true, phone: true },
        },
        referrals: {
          orderBy: { created_at: 'desc' },
          take: 50,
          include: {
            customer: { select: { id: true, name: true, phone: true } },
          },
        },
        events: {
          orderBy: { starts_at: 'desc' },
          take: 20,
        },
        _count: {
          select: { referrals: true, events: true },
        },
      },
    });
    if (!partner) throw notFound('Partner');
    return { data: partner };
  });

  // ─── GET /admin/partners/stats ──────────────────────────────────
  // Aggregate stats across ALL retailers.
  server.get('/partners/stats', async () => {
    const [totalPartners, activePartners, totalReferrals, pendingReferrals, totalEvents] =
      await Promise.all([
        prisma.partner.count(),
        prisma.partner.count({ where: { is_active: true } }),
        prisma.partnerReferral.count(),
        prisma.partnerReferral.count({ where: { status: 'PENDING' } }),
        prisma.partnerEvent.count(),
      ]);

    const totalCommission = await prisma.partnerReferral.aggregate({
      _sum: { commission_paise: true },
      where: { status: 'PAID' },
    });

    return {
      data: {
        total_partners: totalPartners,
        active_partners: activePartners,
        total_referrals: totalReferrals,
        pending_referrals: pendingReferrals,
        total_events: totalEvents,
        total_commission_paise: totalCommission._sum.commission_paise ?? 0,
      },
    };
  });
};
