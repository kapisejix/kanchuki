import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import { featureUnavailable, notFound, validationError } from '../../plugins/error-handler.js';
import { generateReferralCode } from './growth-helpers.js';

const SettingsSchema = z.object({
  referral_enabled: z.boolean(),
  referral_reward_paise: z.number().int().min(0).max(1_000_000),
});

export const growthReferralRoutes: FastifyPluginAsync = async (server) => {
  const guard = async (retailerId: string) => {
    if (!(await hasFeature(retailerId, 'GROWTH_ENGINE'))) throw featureUnavailable('Growth tools');
  };

  // ─── GET /growth/referrals/settings ─────────────────────────────
  server.get('/referrals/settings', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: { referral_enabled: true, referral_reward_paise: true },
    });
    return { data: retailer };
  });

  // ─── PUT /growth/referrals/settings ─────────────────────────────
  server.put('/referrals/settings', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const body = SettingsSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const updated = await prisma.retailer.update({
      where: { id: retailerId },
      data: body.data,
      select: { referral_enabled: true, referral_reward_paise: true },
    });
    return reply.send({ data: updated });
  });

  // ─── POST /growth/referrals/codes ───────────────────────────────
  // Create (or fetch) a referral code for a customer. One code per customer.
  server.post('/referrals/codes', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const body = z.object({ customer_id: z.string().min(1) }).safeParse(request.body);
    if (!body.success) throw validationError('customer_id is required');

    const customer = await prisma.customer.findFirst({
      where: { id: body.data.customer_id, retailer_id: retailerId, deleted_at: null },
    });
    if (!customer) throw notFound('Customer');

    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: { referral_enabled: true, referral_reward_paise: true },
    });
    if (!retailer.referral_enabled) throw validationError('Referrals are not enabled — turn them on in Referrals settings first');

    let referral = await prisma.referral.findFirst({
      where: { retailer_id: retailerId, customer_id: customer.id },
    });
    if (!referral) {
      // Uniqueness is retried a few times; collision odds are negligible.
      referral = await prisma.referral.create({
        data: {
          retailer_id: retailerId,
          customer_id: customer.id,
          code: generateReferralCode(),
          reward_paise: retailer.referral_reward_paise,
        },
      });
    }
    return reply.status(201).send({ data: referral });
  });

  // ─── GET /growth/referrals ──────────────────────────────────────
  // All referral codes with customer info + credit ledger.
  server.get('/referrals', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const referrals = await prisma.referral.findMany({
      where: { retailer_id: retailerId },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    const customers = await prisma.customer.findMany({
      where: { id: { in: referrals.map((r) => r.customer_id) }, deleted_at: null },
      select: { id: true, name: true, phone: true },
    });
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const credits = await prisma.referralCredit.findMany({
      where: { referral_id: { in: referrals.map((r) => r.id) } },
      orderBy: { created_at: 'desc' },
    });

    return {
      data: referrals.map((r) => ({
        ...r,
        customer: customerById.get(r.customer_id) ?? null,
        credits: credits.filter((c) => c.referral_id === r.id),
      })),
    };
  });

  // ─── POST /growth/referrals/:id/credit ──────────────────────────
  // Mark a referral as converted (friend made their first purchase) and
  // create the reward credits for both parties. Credits start PENDING —
  // the retailer applies the ₹X discount when the friend's order happens.
  server.post('/referrals/:id/credit', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };
    const body = z.object({ friend_customer_id: z.string().min(1) }).safeParse(request.body);
    if (!body.success) throw validationError('friend_customer_id is required — pick who converted');

    const referral = await prisma.referral.findFirst({ where: { id, retailer_id: retailerId } });
    if (!referral) throw notFound('Referral');

    if (referral.reward_paise <= 0) throw validationError('Set a reward amount in Referrals settings first');
    const existing = await prisma.referralCredit.findFirst({ where: { referral_id: id } });
    if (existing) throw validationError('This referral was already credited');

    if (body.data.friend_customer_id === referral.customer_id) {
      throw validationError('The friend must be a different customer than the referrer');
    }
    const friend = await prisma.customer.findFirst({
      where: { id: body.data.friend_customer_id, retailer_id: retailerId, deleted_at: null },
    });
    if (!friend) throw notFound('Customer');

    // Credits BOTH parties on the friend's first purchase — referrer and friend.
    const credits = await prisma.$transaction(async (tx) => {
      await tx.referral.update({ where: { id }, data: { signups: { increment: 1 } } });
      const created = await tx.referralCredit.createMany({
        data: [
          {
            retailer_id: retailerId,
            referral_id: id,
            customer_id: referral.customer_id,
            amount_paise: referral.reward_paise,
            status: 'PENDING',
          },
          {
            retailer_id: retailerId,
            referral_id: id,
            customer_id: friend.id,
            amount_paise: referral.reward_paise,
            status: 'PENDING',
          },
        ],
      });
      return { count: created.count };
    });
    return reply.send({
      data: {
        ...credits,
        message: `Reward credited to both — apply the ₹${(referral.reward_paise / 100).toFixed(0)} discount to each on their next order`,
      },
    });
  });
};
