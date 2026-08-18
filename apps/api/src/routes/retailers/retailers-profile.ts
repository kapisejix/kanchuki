// Auto-split from retailers.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import { generateCollectionSlug } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';

const UpdateRetailerSchema = z.object({
  shop_name: z.string().min(1).max(200).optional(),
  owner_name: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  address_line1: z.string().max(200).optional(),
  address_line2: z.string().max(200).optional(),
  pincode: z.string().max(10).optional(),
  logo_url: z.string().max(500).nullable().optional(),
  logo_r2_key: z.string().max(500).nullable().optional(),
  banner_url: z.string().max(500).nullable().optional(),
  banner_r2_key: z.string().max(500).nullable().optional(),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format')
    .optional(),
  categories: z.array(z.string().max(50)).max(10).optional(),
  // F-009: separate WhatsApp business number (falls back to phone if unset)
  whatsapp_number: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number')
    .optional(),
  // F-018: optional, skippable — a salesperson's referral code entered at self-serve signup
  referral_code: z.string().max(20).optional(),
  // Roadmap M — preferred locale for the retailer app UI (ISO 639-1 + region, e.g. 'en-IN', 'hi-IN')
  preferred_locale: z.string().max(10).optional(),
});

export const retailersProfileRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /retailers/me ──────────────────────────────────────────
  server.get('/me', async (request) => {
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId, deleted_at: null },
    });
    if (!retailer) throw notFound('Retailer');

    const [productCount, customerCount] = await Promise.all([
      prisma.product.count({
        where: { retailer_id: request.retailerId, deleted_at: null },
      }),
      prisma.customer.count({
        where: { retailer_id: request.retailerId, deleted_at: null },
      }),
    ]);

    // Secret access token never rides along on the generic profile fetch —
    // see GET /me/whatsapp-api for the "is it configured" check.
    const { whatsapp_api_access_token: _token, ...safeRetailer } = retailer;

    return {
      data: {
        ...safeRetailer,
        whatsapp_api_configured: !!retailer.whatsapp_api_access_token,
        usage: { product_count: productCount, customer_count: customerCount },
      },
    };
  });

  // ─── PUT /retailers/me ──────────────────────────────────────────
  server.put('/me', async (request) => {
    const body = UpdateRetailerSchema.safeParse(request.body);
    if (!body.success) {
      throw validationError(body.error.issues[0]?.message ?? 'Validation failed');
    }

    const { referral_code, ...profileFields } = body.data;

    // One current-row fetch serves both the F-018 referral resolution and the
    // public_slug auto-regeneration below.
    const current = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { onboarded_by_id: true, shop_name: true, public_slug: true },
    });
    if (!current) throw notFound('Retailer');

    // F-018: resolve a self-serve referral code to onboarded_by_id. Silently
    // ignored if invalid/blank, and never overwrites existing attribution
    // (e.g. a retailer an agent already onboarded in person).
    let onboardedById: string | undefined;
    if (referral_code && !current.onboarded_by_id) {
      const agent = await prisma.teamMember.findUnique({
        where: { referral_code },
        select: { id: true, is_active: true },
      });
      if (agent?.is_active) onboardedById = agent.id;
    }

    // Store URL follows the shop name (user decision 2026-08-08): when the
    // retailer renames their shop, regenerate the QR slug from the NEW name
    // so the store link always carries the store's own name. Only runs when
    // a slug already exists (a QR was generated) AND the name actually
    // changed — a rename with no QR yet creates nothing, and an unchanged
    // name never churns the stable URL. Tradeoff accepted: old links/printed
    // QRs stop resolving after a rename (the slug is derived from the name,
    // not a hand-picked brand URL).
    let regeneratedSlug: string | undefined;
    if (body.data.shop_name && current.public_slug && body.data.shop_name !== current.shop_name) {
      // Bounded collision retry — the 4-char random suffix makes real
      // collisions rare, but soft-deleted retailers keep their slug, so a
      // pathological name must never spin forever. Falls back to a
      // timestamp suffix (outside the 4-char space) after 8 attempts.
      const base = body.data.shop_name;
      let slug: string;
      for (let attempt = 0; ; attempt++) {
        slug = generateCollectionSlug(base);
        if (attempt >= 8) {
          slug = `${slug}-${Date.now().toString(36)}`;
          break;
        }
        if (!(await prisma.retailer.findUnique({ where: { public_slug: slug } }))) break;
      }
      regeneratedSlug = slug;
    }

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: {
        ...profileFields,
        ...(onboardedById ? { onboarded_by_id: onboardedById } : {}),
        ...(regeneratedSlug ? { public_slug: regeneratedSlug } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Retailer',
        resource_id: request.retailerId,
        metadata: {
          updated_fields: Object.keys(body.data),
          ...(regeneratedSlug ? { public_slug_regenerated: true, slug: regeneratedSlug } : {}),
        },
        ip_address: request.ip,
      },
    });

    return { data: updated };
  });
};
