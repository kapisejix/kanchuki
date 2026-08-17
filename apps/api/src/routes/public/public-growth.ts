import { createHash } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import { isValidIndianPhone, normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { hasBookingConflict, parseReferralCode } from '../growth/growth-helpers.js';

export const publicGrowthRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /public/referrals/:code ────────────────────────────────
  // Referral landing data (customer web app /r/[code]). No auth. Increments
  // the click counter — idempotent-ish, approximate by design.
  server.get('/referrals/:code', async (request) => {
    const { code } = request.params as { code: string };
    const referral = await prisma.referral.findUnique({
      where: { code: parseReferralCode(code) },
    });
    if (!referral) throw notFound('Referral');

    const retailer = await prisma.retailer.findFirst({
      where: { id: referral.retailer_id, deleted_at: null, is_suspended: false, referral_enabled: true },
      select: { shop_name: true, city: true, public_slug: true, referral_reward_paise: true },
    });
    if (!retailer) throw notFound('Referral');

    await prisma.referral.update({ where: { id: referral.id }, data: { clicks: { increment: 1 } } });

    return {
      data: {
        code: referral.code,
        shop_name: retailer.shop_name,
        city: retailer.city,
        reward_paise: retailer.referral_reward_paise,
        storefront_slug: retailer.public_slug,
      },
    };
  });

  // ─── POST /public/referrals/:code/signup ────────────────────────
  // Friend lands on the referral page and leaves their details → captured
  // as a REFERRAL-source customer lead (same consent gate as the QR flow).
  server.post('/referrals/:code/signup', async (request, reply) => {
    const { code } = request.params as { code: string };
    const referral = await prisma.referral.findUnique({
      where: { code: parseReferralCode(code) },
    });
    if (!referral) throw notFound('Referral');

    const retailer = await prisma.retailer.findFirst({
      where: { id: referral.retailer_id, deleted_at: null, is_suspended: false, referral_enabled: true },
      select: { id: true },
    });
    if (!retailer) throw notFound('Referral');

    const body = z
      .object({
        name: z.string().min(1).max(200),
        phone: z
          .string()
          .min(10)
          .max(15)
          .refine((v) => isValidIndianPhone(v), 'Enter a valid 10-digit Indian mobile number'),
        consent: z.literal(true, { message: 'Consent is required' }),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const phone = normalizeIndianPhone(body.data.phone);
    const phone_hash = createHash('sha256').update(phone).digest('hex');

    await prisma.$transaction(async (tx) => {
      await tx.customer.upsert({
        where: { retailer_id_phone: { retailer_id: referral.retailer_id, phone } },
        create: {
          retailer_id: referral.retailer_id,
          name: body.data.name,
          phone,
          phone_hash,
          consent_given: true,
          consent_at: new Date(),
          source: 'REFERRAL',
        },
        update: {
          name: body.data.name,
          consent_given: true,
          consent_at: new Date(),
          source: 'REFERRAL',
        },
      });
      await tx.referral.update({ where: { id: referral.id }, data: { signups: { increment: 1 } } });
    });

    return reply.status(201).send({ data: { ok: true } });
  });

  // ─── POST /public/retailers/:slug/bookings ──────────────────────
  // Customer self-service showroom / try-on slot booking (roadmap L).
  // No consent gate — booking is a service request, not marketing contact.
  server.post('/retailers/:slug/bookings', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const retailer = await prisma.retailer.findFirst({
      where: { public_slug: slug, deleted_at: null, is_suspended: false },
      select: { id: true },
    });
    if (!retailer) throw notFound('Retailer');

    const body = z
      .object({
        name: z.string().min(1).max(120),
        phone: z.string().min(10).max(20),
        starts_at: z.string().datetime(),
        ends_at: z.string().datetime(),
        note: z.string().max(500).optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const start = new Date(body.data.starts_at);
    const end = new Date(body.data.ends_at);
    if (end <= start) throw validationError('End time must be after start time');
    if (start.getTime() < Date.now() - 5 * 60 * 1000) throw validationError('Booking time is in the past');

    const existing = await prisma.booking.findMany({
      where: { retailer_id: retailer.id, starts_at: { lt: end }, ends_at: { gt: start } },
      select: { starts_at: true, ends_at: true, status: true },
    });
    if (hasBookingConflict(existing, start, end)) {
      throw validationError('That slot is already booked — pick another time');
    }

    const booking = await prisma.booking.create({
      data: {
        retailer_id: retailer.id,
        name: body.data.name,
        phone: body.data.phone,
        starts_at: start,
        ends_at: end,
        note: body.data.note ?? null,
      },
    });
    return reply.status(201).send({ data: { id: booking.id, status: booking.status, starts_at: booking.starts_at, ends_at: booking.ends_at } });
  });
};
