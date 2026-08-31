// Split from public-retailers.ts (scripts/check-route-size.sh) — customer-facing
// marketing surfaces (promotions, lookbooks, seasonal collections) + the QR
// contact-gate lead capture. Route bodies verbatim.
import { createHash } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import { isValidIndianPhone, normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withPublicCache } from '../../lib/public-cache.js';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { getPassportSession } from './passport-helpers.js';

export const publicRetailersMarketingRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /public/retailers/:slug/promotions ────────────────────
  // Customer-facing: list active promotions/discount codes for a retailer.
  // Surfaces as a banner on the collection page.
  server.get('/retailers/:slug/promotions', async (request) => {
    const { slug } = request.params as { slug: string };

    return withPublicCache(request.url, async () => {
      const retailer = await prisma.retailer.findFirst({
        where: { public_slug: slug, deleted_at: null, is_suspended: false },
        select: { id: true },
      });
      if (!retailer) throw notFound('Retailer');

      const now = new Date();
      const promotions = await prisma.promotion.findMany({
        where: {
          retailer_id: retailer.id,
          is_active: true,
          OR: [
            { starts_at: null, ends_at: null },
            { starts_at: null, ends_at: { gte: now } },
            { starts_at: { lte: now }, ends_at: null },
            { starts_at: { lte: now }, ends_at: { gte: now } },
          ],
        },
        select: {
          id: true,
          code: true,
          discount_type: true,
          discount_value: true,
          min_order_paise: true,
          ends_at: true,
        },
        orderBy: { created_at: 'desc' },
        take: 5,
      });

      return {
        data: promotions.map((p) => ({
          id: p.id,
          code: p.code,
          discount_type: p.discount_type,
          discount_value: p.discount_value,
          min_order_paise: p.min_order_paise,
          ends_at: p.ends_at?.toISOString() ?? null,
        })),
      };
    });
  });

  // ─── GET /public/retailers/:slug/lookbooks ─────────────────────
  // Customer-facing: list ready lookbooks for a retailer. Used to surface
  // mix-and-match lookbooks on the categories/collection page.
  server.get('/retailers/:slug/lookbooks', async (request) => {
    const { slug } = request.params as { slug: string };

    return withPublicCache(request.url, async () => {
      const retailer = await prisma.retailer.findFirst({
        where: { public_slug: slug, deleted_at: null, is_suspended: false },
        select: { id: true },
      });
      if (!retailer) throw notFound('Retailer');

      const lookbooks = await prisma.lookbook.findMany({
        where: {
          retailer_id: retailer.id,
          status: 'READY',
        },
        select: {
          id: true,
          name: true,
          description: true,
          format: true,
          cover_url: true,
          output_url: true,
          share_url: true,
          view_count: true,
          share_count: true,
          created_at: true,
        },
        orderBy: { created_at: 'desc' },
        take: 10,
      });

      return {
        data: lookbooks.map((lb) => ({
          id: lb.id,
          name: lb.name,
          description: lb.description,
          format: lb.format,
          cover_url: lb.cover_url,
          output_url: lb.output_url,
          share_url: lb.share_url,
          view_count: lb.view_count,
          share_count: lb.share_count,
          created_at: lb.created_at.toISOString(),
        })),
      };
    });
  });

  // ─── GET /public/retailers/:slug/collections ────────────────────
  // Customer-facing: list active collections for a retailer (seasonal/festival picks,
  // curated sets). Used to surface "Seasonal Picks" on the categories page.
  server.get('/retailers/:slug/collections', async (request) => {
    const { slug } = request.params as { slug: string };

    return withPublicCache(request.url, async () => {
      const retailer = await prisma.retailer.findFirst({
        where: { public_slug: slug, deleted_at: null, is_suspended: false },
        select: { id: true },
      });
      if (!retailer) throw notFound('Retailer');

      const collections = await prisma.collection.findMany({
        where: {
          retailer_id: retailer.id,
          status: 'ACTIVE',
          deleted_at: null,
        },
        select: {
          id: true,
          title: true,
          description: true,
          slug: true,
          view_count: true,
          favorite_count: true,
          products: {
            where: { product: { deleted_at: null } },
            select: {
              product: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                  primary_color: true,
                  price_min: true,
                  price_max: true,
                  photos: {
                    orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }],
                    take: 1,
                    select: { url: true },
                  },
                },
              },
            },
            orderBy: { sort_order: 'asc' },
            take: 6,
          },
          _count: { select: { products: true } },
        },
        orderBy: { updated_at: 'desc' },
        take: 10,
      });

      return {
        data: collections.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          slug: c.slug,
          view_count: c.view_count,
          favorite_count: c.favorite_count,
          product_count: c._count.products,
          preview_products: c.products.map((cp) => ({
            id: cp.product.id,
            name: cp.product.name,
            category: cp.product.category,
            primary_color: cp.product.primary_color,
            price_min: cp.product.price_min,
            price_max: cp.product.price_max,
            photo_url: cp.product.photos[0]?.url ?? null,
          })),
        })),
      };
    });
  });

  // ─── POST /public/retailers/:slug/leads ──────────────────────────
  // QR profile contact gate. Two paths:
  //   1. Legacy: { name, phone, gender, consent } — unverified form entry
  //   2. Passport: { share_contact } — verified identity taken from the
  //      cookie-bound Shopper Passport session (NOT from the request body).
  //      On share_contact: upserts the retailer-scoped Customer from the
  //      CustomerAccount + writes ConsentEvent.
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
    // The client signals a passport submission with `customer_account_id`, but
    // that field is NOT trusted for auth — the identity is taken from the
    // cookie-bound passport session. Otherwise any caller could force a
    // victim's contact + consent into an arbitrary retailer's CRM by guessing
    // an account id.
    if (body.customer_account_id != null || body.share_contact != null) {
      const session = await getPassportSession(request.headers.cookie || '');
      if (!session || session.customer_account.deleted_at) {
        return reply.status(401).send({
          error: { code: 'NO_SESSION', message: 'Passport session required to share contact' },
        });
      }
      const shareContact = body.share_contact === true;
      const customerId = session.customer_account_id;
      const account = session.customer_account;

      // Upsert the CustomerStoreVisit
      const existingVisit = await prisma.customerStoreVisit.findUnique({
        where: { customer_account_id_retailer_id: { customer_account_id: customerId, retailer_id: retailer.id } },
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
        import('../../jobs/passport-welcome.js')
          .then(({ dispatchWelcome }) => dispatchWelcome({
            account_id: customerId,
            retailer_id: retailer.id,
          }))
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
    if (!legacyBody.success) throw validationError(legacyBody.error.issues[0]?.message ?? 'Invalid');

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
