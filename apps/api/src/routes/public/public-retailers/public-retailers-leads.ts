// public-retailers-leads.ts — QR contact gate (passport + legacy paths) (split from apps/api/src/routes/public/public-retailers.ts — body byte-identical)
import { createHash } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import { isValidIndianPhone, normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../../plugins/error-handler.js';
export const publicRetailersLeadsRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /public/retailers/:slug/leads ──────────────────────────
  // QR profile contact gate. Two paths:
  //   1. Legacy: { name, phone, gender, consent } — unverified form entry
  //   2. Passport: { customer_account_id, share_contact } — verified identity
  //      from the Shopper Passport. On share_contact: upserts the retailer-
  //      scoped Customer from the CustomerAccount + writes ConsentEvent.
  server.post('/retailers/:slug/leads', async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const retailer = await prisma.retailer.findFirst({
      where: { public_slug: slug, deleted_at: null },
      select: { id: true, is_suspended: true },
    });
    if (!retailer) throw notFound('Retailer');

    // F-015: Block lead capture for suspended retailers
    if (retailer.is_suspended) {
      throw notFound('Retailer');
    }

    const body = request.body as Record<string, unknown>;

    // ── Passport path: verified identity ──
    if (body.customer_account_id && typeof body.customer_account_id === 'string') {
      const shareContact = body.share_contact === true;
      const customerId = body.customer_account_id;

      // Verify the account exists
      const account = await prisma.customerAccount.findUnique({
        where: { id: customerId, deleted_at: null },
      });
      if (!account) {
        throw validationError('Invalid passport session');
      }

      // Upsert the CustomerStoreVisit
      const existingVisit = await prisma.customerStoreVisit.findUnique({
        where: {
          customer_account_id_retailer_id: {
            customer_account_id: customerId,
            retailer_id: retailer.id,
          },
        },
      });

      if (existingVisit) {
        await prisma.customerStoreVisit.update({
          where: { id: existingVisit.id },
          data: {
            last_visited_at: new Date(),
            visit_count: existingVisit.visit_count + 1,
          },
        });
      } else {
        await prisma.customerStoreVisit.create({
          data: {
            customer_account_id: customerId,
            retailer_id: retailer.id,
            source: 'QR_SCAN',
          },
        });
      }

      if (shareContact) {
        // Write the retailer-scoped Customer from the passport identity
        const normalizedPhone = normalizeIndianPhone(account.phone);
        const phone_hash = createHash('sha256').update(normalizedPhone).digest('hex');

        const customer = await prisma.customer.upsert({
          where: { retailer_id_phone: { retailer_id: retailer.id, phone: normalizedPhone } },
          create: {
            retailer_id: retailer.id,
            name: account.name || 'Customer',
            phone: normalizedPhone,
            phone_hash,
            gender: account.gender,
            consent_given: true,
            consent_at: new Date(),
            source: 'QR_SCAN',
            customer_account_id: customerId,
          },
          update: {
            name: account.name || undefined,
            gender: account.gender || undefined,
            consent_given: true,
            consent_at: new Date(),
            customer_account_id: customerId,
          },
          select: { id: true, name: true },
        });

        // Update CustomerStoreVisit with consent flags
        await prisma.customerStoreVisit.updateMany({
          where: { customer_account_id: customerId, retailer_id: retailer.id },
          data: {
            contact_shared: true,
            whatsapp_consent: true,
            whatsapp_consent_at: new Date(),
          },
        });

        // Write ConsentEvent
        await prisma.consentEvent.create({
          data: {
            customer_account_id: customerId,
            retailer_id: retailer.id,
            kind: 'STORE_CONSENT_GRANTED',
            notice_version: '1.0',
            user_agent: request.headers['user-agent'] || null,
          },
        });

        // Fire-and-forget: welcome + catalog link via WhatsApp
        // (Cloud-API retailers only; others see the lead in CRM)
        import('../../../jobs/passport-welcome.js')
          .then(({ dispatchWelcome }) =>
            dispatchWelcome({
              account_id: customerId,
              retailer_id: retailer.id,
            }),
          )
          .catch(() => {}); // non-critical — swallow

        return reply.status(201).send({ data: customer });
      }

      // share_contact=false — visit logged, no PII shared
      return reply.status(201).send({ data: { id: null, name: null } });
    }

    // ── Legacy path: unverified form entry ──
    const legacyBody = z
      .object({
        name: z.string().min(1).max(200),
        phone: z
          .string()
          .min(10)
          .max(15)
          .refine((v) => isValidIndianPhone(v), 'Enter a valid 10-digit Indian mobile number'),
        gender: z.enum(['MALE', 'FEMALE']),
        consent: z.literal(true, { message: 'Consent is required' }),
      })
      .safeParse(request.body);
    if (!legacyBody.success)
      throw validationError(legacyBody.error.issues[0]?.message ?? 'Invalid');

    const normalizedPhone = normalizeIndianPhone(legacyBody.data.phone);
    const phone_hash = createHash('sha256').update(normalizedPhone).digest('hex');

    const customer = await prisma.customer.upsert({
      where: { retailer_id_phone: { retailer_id: retailer.id, phone: normalizedPhone } },
      create: {
        retailer_id: retailer.id,
        name: legacyBody.data.name,
        phone: normalizedPhone,
        phone_hash,
        gender: legacyBody.data.gender,
        consent_given: true,
        consent_at: new Date(),
        source: 'QR_SCAN',
      },
      update: {
        name: legacyBody.data.name,
        gender: legacyBody.data.gender,
        consent_given: true,
        consent_at: new Date(),
        source: 'QR_SCAN',
      },
      select: { id: true, name: true },
    });

    return reply.status(201).send({ data: customer });
  });
};
