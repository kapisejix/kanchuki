import { getUploadPresignedUrl, publicUrl } from '@kanchuki/ai';
import { getSecret, prisma, vaultDelete } from '@kanchuki/db';
import type { QuotaPeriod, QuotaResourceType } from '@kanchuki/db';
import { R2_PATHS, generateCollectionSlug } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../lib/features.js';
import { featureUnavailable, forbidden, notFound, validationError } from '../plugins/error-handler.js';
import { routeTicket } from './team.js';

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

function periodStart(period: QuotaPeriod, now = new Date()): Date {
  if (period === 'DAY') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'MONTH') return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(0); // LIFETIME
}

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
});

const StoreSectionSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['rack', 'shelf', 'section', 'floor', 'box']),
  parent_id: z.string().optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});

export const retailerRoutes: FastifyPluginAsync = async (server) => {
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

    // F-018: resolve a self-serve referral code to onboarded_by_id. Silently
    // ignored if invalid/blank, and never overwrites existing attribution
    // (e.g. a retailer an agent already onboarded in person).
    let onboardedById: string | undefined;
    if (referral_code) {
      const current = await prisma.retailer.findUnique({
        where: { id: request.retailerId },
        select: { onboarded_by_id: true },
      });
      if (!current?.onboarded_by_id) {
        const agent = await prisma.teamMember.findUnique({
          where: { referral_code },
          select: { id: true, is_active: true },
        });
        if (agent?.is_active) onboardedById = agent.id;
      }
    }

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: { ...profileFields, ...(onboardedById ? { onboarded_by_id: onboardedById } : {}) },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Retailer',
        resource_id: request.retailerId,
        metadata: { updated_fields: Object.keys(body.data) },
        ip_address: request.ip,
      },
    });

    return { data: updated };
  });

  // ─── POST /retailers/me/banner-upload-url ────────────────────────
  // Store banner image shown as a hero section on customer-facing pages.
  server.post('/me/banner-upload-url', async (request, reply) => {
    const body = z
      .object({
        filename: z.string().min(1).max(255),
        content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        size_bytes: z.number().int().min(1).max(10_000_000), // 10MB — banners are large
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { content_type } = body.data;
    const ext =
      content_type === 'image/png' ? 'png' : content_type === 'image/webp' ? 'webp' : 'jpg';
    const r2Key = R2_PATHS.retailerBanner(request.retailerId, `${createId()}.${ext}`);

    let uploadUrl: string;
    try {
      uploadUrl = await getUploadPresignedUrl(r2Key, content_type, 300);
    } catch {
      throw validationError('Banner storage is not configured. Please contact support.');
    }

    return reply.status(200).send({
      data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 },
    });
  });

  // ─── POST /retailers/me/logo-upload-url ─────────────────────────
  server.post('/me/logo-upload-url', async (request, reply) => {
    const body = z
      .object({
        filename: z.string().min(1).max(255),
        content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        size_bytes: z.number().int().min(1).max(5_000_000),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { content_type } = body.data;
    const ext =
      content_type === 'image/png' ? 'png' : content_type === 'image/webp' ? 'webp' : 'jpg';
    const r2Key = R2_PATHS.retailerLogo(request.retailerId, `${createId()}.${ext}`);

    let uploadUrl: string;
    try {
      uploadUrl = await getUploadPresignedUrl(r2Key, content_type, 300);
    } catch (err) {
      console.error('R2 presigned URL generation failed:', err);
      throw validationError('Photo storage is not configured. Please contact support.');
    }

    return reply.status(200).send({
      data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 },
    });
  });

  // ─── POST /retailers/me/kyc-upload-url ──────────────────────────
  // KYC docs: GST certificate accepts PDF or image; Aadhar front/back are photos only.
  server.post('/me/kyc-upload-url', async (request, reply) => {
    const body = z
      .object({
        doc_type: z.enum(['gst', 'aadhar_front', 'aadhar_back']),
        filename: z.string().min(1).max(255),
        content_type: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
        size_bytes: z.number().int().min(1).max(10_000_000),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { doc_type, content_type } = body.data;
    if (doc_type !== 'gst' && content_type === 'application/pdf') {
      throw validationError('Aadhar upload must be a photo, not a PDF');
    }

    const ext =
      content_type === 'application/pdf' ? 'pdf' : content_type === 'image/png' ? 'png' : 'jpg';
    const r2Key = R2_PATHS.retailerKyc(request.retailerId, doc_type, `${createId()}.${ext}`);

    let uploadUrl: string;
    try {
      uploadUrl = await getUploadPresignedUrl(r2Key, content_type, 300);
    } catch {
      throw validationError('Document storage is not configured. Please contact support.');
    }

    return reply.status(200).send({
      data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 },
    });
  });

  // ─── PATCH /retailers/me/kyc ─────────────────────────────────────
  // Records one uploaded KYC doc. Once all three (GST + Aadhar front + back)
  // are on file, flips status NOT_SUBMITTED -> PENDING for admin review.
  server.patch('/me/kyc', async (request) => {
    const body = z
      .object({
        doc_type: z.enum(['gst', 'aadhar_front', 'aadhar_back']),
        r2_key: z.string().min(1).max(500),
        url: z.string().min(1).max(500),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const { doc_type, r2_key, url } = body.data;

    const fieldMap = {
      gst: { urlField: 'kyc_gst_url', keyField: 'kyc_gst_r2_key' },
      aadhar_front: { urlField: 'kyc_aadhar_front_url', keyField: 'kyc_aadhar_front_r2_key' },
      aadhar_back: { urlField: 'kyc_aadhar_back_url', keyField: 'kyc_aadhar_back_r2_key' },
    } as const;
    const { urlField, keyField } = fieldMap[doc_type];

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: { [urlField]: url, [keyField]: r2_key },
    });

    let kyc_status = updated.kyc_status;
    if (
      updated.kyc_gst_url &&
      updated.kyc_aadhar_front_url &&
      updated.kyc_aadhar_back_url &&
      updated.kyc_status === 'NOT_SUBMITTED'
    ) {
      const submitted = await prisma.retailer.update({
        where: { id: request.retailerId },
        data: { kyc_status: 'PENDING', kyc_submitted_at: new Date() },
        select: { kyc_status: true },
      });
      kyc_status = submitted.kyc_status;
    }

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Retailer',
        resource_id: request.retailerId,
        metadata: { kyc_update: doc_type },
        ip_address: request.ip,
      },
    });

    return { data: { kyc_status } };
  });

  // ─── WhatsApp Business API config (bring-your-own Meta credentials) ─
  // When configured, collection bulk-send (POST /collections/:id/bulk-send)
  // uses this instead of the one-by-one wa.me flow.

  // F-013: gated behind WHATSAPP_BUSINESS_API feature.
  server.get('/me/whatsapp-api', async (request) => {
    if (!(await hasFeature(request.retailerId, 'WHATSAPP_BUSINESS_API'))) {
      return { data: null };
    }
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: {
        whatsapp_api_phone_number_id: true,
        whatsapp_api_template_name: true,
        whatsapp_api_template_lang: true,
        whatsapp_api_configured_at: true,
      },
    });
    if (!retailer) throw notFound('Retailer');
    return {
      data: { ...retailer, configured: !!retailer.whatsapp_api_phone_number_id },
    };
  });

  // F-013: gated behind WHATSAPP_BUSINESS_API feature.
  server.patch('/me/whatsapp-api', async (request) => {
    if (!(await hasFeature(request.retailerId, 'WHATSAPP_BUSINESS_API'))) {
      throw featureUnavailable('WhatsApp Business API');
    }
    const body = z
      .object({
        phone_number_id: z.string().min(1).max(100),
        access_token: z.string().min(1).max(1000).optional(), // omit to keep existing token
        template_name: z.string().min(1).max(200),
        template_lang: z.string().min(2).max(20).default('en_US'),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    if (!body.data.access_token) {
      const existing = await prisma.retailer.findUnique({
        where: { id: request.retailerId },
        select: { whatsapp_api_access_token: true },
      });
      if (!existing?.whatsapp_api_access_token) {
        throw validationError('Access token is required');
      }
    }

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: {
        whatsapp_api_phone_number_id: body.data.phone_number_id,
        ...(body.data.access_token ? { whatsapp_api_access_token: body.data.access_token } : {}),
        whatsapp_api_template_name: body.data.template_name,
        whatsapp_api_template_lang: body.data.template_lang,
        whatsapp_api_configured_at: new Date(),
      },
      select: { whatsapp_api_phone_number_id: true, whatsapp_api_configured_at: true },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Retailer',
        resource_id: request.retailerId,
        metadata: { whatsapp_api: 'configured' },
        ip_address: request.ip,
      },
    });

    return { data: { ...updated, configured: true } };
  });

  // F-013: gated behind WHATSAPP_BUSINESS_API feature.
  server.delete('/me/whatsapp-api', async (request, reply) => {
    if (!(await hasFeature(request.retailerId, 'WHATSAPP_BUSINESS_API'))) {
      throw featureUnavailable('WhatsApp Business API');
    }
    await prisma.retailer.update({
      where: { id: request.retailerId },
      data: {
        whatsapp_api_phone_number_id: null,
        whatsapp_api_access_token: null,
        whatsapp_api_template_name: null,
        whatsapp_api_template_lang: null,
        whatsapp_api_configured_at: null,
      },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'delete',
        resource_type: 'Retailer',
        resource_id: request.retailerId,
        metadata: { whatsapp_api: 'disconnected' },
        ip_address: request.ip,
      },
    });

    return reply.status(204).send();
  });

  // ─── GET /retailers/me/stats ────────────────────────────────────
  server.get('/me/stats', async (request) => {
    const retailerId = request.retailerId;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalProducts,
      totalCustomers,
      activeCollections,
      monthViews,
      monthEnquiries,
      topViewed,
      topEnquired,
    ] = await Promise.all([
      prisma.product.count({
        where: { retailer_id: retailerId, deleted_at: null, status: 'AVAILABLE' },
      }),
      prisma.customer.count({ where: { retailer_id: retailerId, deleted_at: null } }),
      prisma.collection.count({
        where: { retailer_id: retailerId, status: 'ACTIVE', deleted_at: null },
      }),
      prisma.collectionView.count({
        where: { retailer_id: retailerId, created_at: { gte: monthStart } },
      }),
      prisma.collectionEnquiry.count({
        where: { retailer_id: retailerId, created_at: { gte: monthStart } },
      }),
      prisma.customerInteraction.groupBy({
        by: ['product_id'],
        where: { retailer_id: retailerId, type: 'view', product_id: { not: null } },
        _count: { product_id: true },
        orderBy: { _count: { product_id: 'desc' } },
        take: 5,
      }),
      prisma.customerInteraction.groupBy({
        by: ['product_id'],
        where: { retailer_id: retailerId, type: 'enquiry', product_id: { not: null } },
        _count: { product_id: true },
        orderBy: { _count: { product_id: 'desc' } },
        take: 5,
      }),
    ]);

    const productIds = [...topViewed, ...topEnquired].map((g) => g.product_id as string);
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            category: true,
            primary_color: true,
            photos: { where: { is_primary: true }, select: { url: true }, take: 1 },
          },
        })
      : [];
    const productMap = new Map(
      products.map((p) => [
        p.id,
        {
          id: p.id,
          category: p.category,
          primary_color: p.primary_color,
          photo_url: p.photos[0]?.url ?? null,
        },
      ]),
    );

    const toRanked = (groups: typeof topViewed) =>
      groups
        .filter((g) => productMap.has(g.product_id as string))
        .map((g) => ({
          product: productMap.get(g.product_id as string),
          count: g._count.product_id,
        }));

    return {
      data: {
        total_products_available: totalProducts,
        total_customers: totalCustomers,
        active_collections: activeCollections,
        views_this_month: monthViews,
        enquiries_this_month: monthEnquiries,
        top_viewed_products: toRanked(topViewed),
        top_enquired_products: toRanked(topEnquired),
      },
    };
  });

  // ─── GET /retailers/me/plan ─────────────────────────────────────
  // ─── GET /retailers/me/analytics ────────────────────────────────
  server.get('/me/analytics', async (request) => {
    const retailerId = request.retailerId;
    const now = new Date();

    // Last 7 days of daily views + enquiries
    const days: { date: string; views: number; enquiries: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);

      const [views, enquiries] = await Promise.all([
        prisma.collectionView.count({
          where: { retailer_id: retailerId, created_at: { gte: dayStart, lt: dayEnd } },
        }),
        prisma.collectionEnquiry.count({
          where: { retailer_id: retailerId, created_at: { gte: dayStart, lt: dayEnd } },
        }),
      ]);

      days.push({
        date: dayStart.toISOString().slice(0, 10),
        views,
        enquiries,
      });
    }

    // Category distribution
    const categoryGroups = await prisma.product.groupBy({
      by: ['category'],
      where: { retailer_id: retailerId, deleted_at: null },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // Status distribution
    const statusGroups = await prisma.product.groupBy({
      by: ['status'],
      where: { retailer_id: retailerId, deleted_at: null },
      _count: { id: true },
    });

    // Recent collection performance
    const collections = await prisma.collection.findMany({
      where: { retailer_id: retailerId, deleted_at: null },
      orderBy: { created_at: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        view_count: true,
        enquiry_count: true,
        favorite_count: true,
        created_at: true,
        _count: { select: { products: true } },
      },
    });

    // Plan usage
    const retailer = await prisma.retailer.findUnique({
      where: { id: retailerId },
      select: {
        plan: true,
        plan_status: true,
        max_products: true,
        max_customers: true,
        try_on_credits: true,
      },
    });

    return {
      data: {
        daily_trends: days,
        category_breakdown: categoryGroups.map((g) => ({
          category: g.category ?? 'Uncategorized',
          count: g._count.id,
        })),
        status_breakdown: statusGroups.map((g) => ({ status: g.status, count: g._count.id })),
        recent_collections: collections.map((c) => ({
          id: c.id,
          title: c.title,
          slug: c.slug,
          status: c.status,
          view_count: c.view_count,
          enquiry_count: c.enquiry_count,
          favorite_count: c.favorite_count,
          product_count: c._count.products,
          created_at: c.created_at,
        })),
        plan: retailer,
      },
    };
  });

  // ─── GET /retailers/me/plan ─────────────────────────────────────
  server.get('/me/plan', async (request) => {
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: {
        plan: true,
        plan_status: true,
        trial_ends_at: true,
        plan_expires_at: true,
        max_products: true,
        max_customers: true,
        try_on_credits: true,
      },
    });
    if (!retailer) throw notFound('Retailer');
    return { data: retailer };
  });

  // ─── PATCH /retailers/me/onboarding ────────────────────────────
  server.patch('/me/onboarding', async (request) => {
    const body = z
      .object({
        step: z.number().int().min(0).max(6),
        completed: z.boolean().optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: {
        onboarding_step: body.data.step,
        ...(body.data.completed === true ? { onboarding_completed: true } : {}),
      },
      select: { onboarding_step: true, onboarding_completed: true },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Retailer',
        resource_id: request.retailerId,
        metadata: { onboarding_step: body.data.step, completed: body.data.completed ?? false },
        ip_address: request.ip,
      },
    });

    return { data: updated };
  });

  // ─── POST /retailers/me/qr-slug ─────────────────────────────────
  // Get-or-create the stable slug the QR code encodes (/store/{slug}).
  server.post('/me/qr-slug', async (request) => {
    const existing = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { public_slug: true, shop_name: true },
    });
    if (!existing) throw notFound('Retailer');
    const webBase = process.env.WEB_URL ?? '';

    if (existing.public_slug) {
      return {
        data: {
          public_slug: existing.public_slug,
          profile_url: `${webBase}/store/${existing.public_slug}`,
        },
      };
    }

    let slug = generateCollectionSlug(existing.shop_name);
    while (await prisma.retailer.findUnique({ where: { public_slug: slug } })) {
      slug = generateCollectionSlug(existing.shop_name);
    }

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: { public_slug: slug },
      select: { public_slug: true },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Retailer',
        resource_id: request.retailerId,
        metadata: { public_slug_created: true, slug: updated.public_slug },
        ip_address: request.ip,
      },
    });

    return {
      data: {
        public_slug: updated.public_slug,
        profile_url: `${webBase}/store/${updated.public_slug}`,
      },
    };
  });

  // ─── PATCH /retailers/me/storefront ─────────────────────────────
  // Pick which collection the QR profile page opens into after the
  // contact gate. Pass collection_id: null to unset.
  server.patch('/me/storefront', async (request) => {
    const body = z.object({ collection_id: z.string().nullable() }).safeParse(request.body);
    if (!body.success) throw validationError('Invalid body');

    if (body.data.collection_id) {
      const owned = await prisma.collection.findFirst({
        where: { id: body.data.collection_id, retailer_id: request.retailerId, deleted_at: null },
      });
      if (!owned) throw validationError('Collection does not belong to your store');
    }

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: { storefront_collection_id: body.data.collection_id },
      select: { storefront_collection_id: true },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Retailer',
        resource_id: request.retailerId,
        metadata: { storefront_collection_id: body.data.collection_id },
        ip_address: request.ip,
      },
    });

    return { data: updated };
  });

  // ─── GET /retailers/me/usage ──────────────────────────────────────
  // F-010: Return usage vs limits for all metered resources.
  server.get('/me/usage', async (request) => {
    const retailerId = request.retailerId;

    const retailer = await prisma.retailer.findUnique({
      where: { id: retailerId },
      select: { plan: true },
    });
    if (!retailer) throw notFound('Retailer');

    const ALL_RESOURCES: QuotaResourceType[] = [
      'PRODUCT_UPLOAD',
      'AI_TAGGING_CALL',
      'TRY_ON',
      'IMAGE_CROP',
      'BG_REMOVAL',
      'API_REQUEST',
    ];

    // Check for per-retailer override
    const overrides = await prisma.retailerLimitOverride.findMany({
      where: { retailer_id: retailerId },
    });
    const overrideMap = new Map(overrides.map((o) => [o.resource_type, o]));

    // Fetch plan limits for retailer's plan
    const planLimits = await prisma.planLimit.findMany({
      where: { plan: retailer.plan },
    });
    const planLimitMap = new Map(planLimits.map((p) => [p.resource_type, p]));

    // Fetch current usage counters
    const now = new Date();
    const counters = await prisma.usageCounter.findMany({
      where: { retailer_id: retailerId },
    });

    const usage = ALL_RESOURCES.map((resourceType) => {
      const override = overrideMap.get(resourceType);
      if (override) {
        // Per-retailer override takes priority
        const start = periodStart(override.period, now);
        const counter = counters.find(
          (c) => c.resource_type === resourceType && c.period_start.getTime() === start.getTime(),
        );
        return {
          resource_type: resourceType,
          limit: override.limit_per_period,
          used: counter?.count ?? 0,
          period: override.period,
          source: 'override' as const,
        };
      }

      const planLimit = planLimitMap.get(resourceType);
      if (!planLimit) {
        // No limit configured — unlimited
        return {
          resource_type: resourceType,
          limit: -1, // unlimited
          used: 0,
          period: 'LIFETIME' as QuotaPeriod,
          source: 'unlimited' as const,
        };
      }

      const start = periodStart(planLimit.period, now);
      const counter = counters.find(
        (c) => c.resource_type === resourceType && c.period_start.getTime() === start.getTime(),
      );
      return {
        resource_type: resourceType,
        limit: planLimit.limit_per_period,
        used: counter?.count ?? 0,
        period: planLimit.period,
        source: 'plan' as const,
      };
    });

    return { data: usage };
  });

  // ─── DELETE /retailers/me ───────────────────────────────────────
  // F-009: Soft-delete the retailer account. Collections become inaccessible.
  // Products/customers/billing records are retained for audit/GST compliance.
  server.delete('/me', async (request, reply) => {
    const retailerId = request.retailerId;

    const existing = await prisma.retailer.findUnique({
      where: { id: retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Retailer');

    // Fetch collections before archiving for vault snapshots
    const collectionsBeforeDelete = await prisma.collection.findMany({
      where: { retailer_id: retailerId, deleted_at: null },
    });

    // Soft-delete retailer + archive all collections + deactivate staff
    await Promise.all([
      prisma.retailer.update({
        where: { id: retailerId },
        data: { deleted_at: new Date() },
      }),
      prisma.collection.updateMany({
        where: { retailer_id: retailerId, deleted_at: null },
        data: { deleted_at: new Date(), status: 'ARCHIVED' },
      }),
      prisma.staff.updateMany({
        where: { retailer_id: retailerId, is_active: true },
        data: { is_active: false },
      }),
    ]);

    // F-016: Vault snapshot of the deleted retailer (fire-and-forget)
    vaultDelete({
      source_table: 'retailers',
      source_id: retailerId,
      retailer_id: retailerId,
      payload: existing as unknown as Record<string, unknown>,
      delete_reason: 'user_delete',
      deleted_by: retailerId,
    });
    // F-016: Vault snapshot of each archived collection (fire-and-forget)
    Promise.allSettled(
      collectionsBeforeDelete.map((c) =>
        vaultDelete({
          source_table: 'collections',
          source_id: c.id,
          retailer_id: retailerId,
          payload: c as unknown as Record<string, unknown>,
          delete_reason: 'user_delete',
          deleted_by: retailerId,
        }),
      ),
    );

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'delete',
        resource_type: 'Retailer',
        resource_id: retailerId,
        metadata: { soft_delete: true },
        ip_address: request.ip,
      },
    });

    return reply.status(204).send();
  });

  // ─── Store Sections ─────────────────────────────────────────────

  server.get('/me/sections', async (request) => {
    const sections = await prisma.storeSection.findMany({
      where: { retailer_id: request.retailerId },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });
    return { data: sections };
  });

  server.post('/me/sections', async (request, reply) => {
    const body = StoreSectionSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const section = await prisma.storeSection.create({
      data: { retailer_id: request.retailerId, ...body.data },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'create',
        resource_type: 'StoreSection',
        resource_id: section.id,
        metadata: { name: section.name, type: section.type },
        ip_address: request.ip,
      },
    });

    return reply.status(201).send({ data: section });
  });

  server.put('/me/sections/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = StoreSectionSchema.partial().safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const existing = await prisma.storeSection.findFirst({
      where: { id, retailer_id: request.retailerId },
    });
    if (!existing) throw notFound('Section');

    const updated = await prisma.storeSection.update({
      where: { id },
      data: body.data,
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'StoreSection',
        resource_id: id,
        metadata: { name: updated.name, updated_fields: Object.keys(body.data) },
        ip_address: request.ip,
      },
    });

    return { data: updated };
  });

  server.delete('/me/sections/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.storeSection.findFirst({
      where: { id, retailer_id: request.retailerId },
    });
    if (!existing) throw notFound('Section');

    const inUse = await prisma.product.count({
      where: { section_id: id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (inUse > 0) {
      throw validationError('Section has products assigned. Reassign them first.');
    }

    await prisma.storeSection.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'delete',
        resource_type: 'StoreSection',
        resource_id: id,
        metadata: { name: existing.name },
        ip_address: request.ip,
      },
    });

    return reply.status(204).send();
  });

  // ═══════════════════════════════════════════════════════════════
  //  F-019: Paid On-Site Catalog Upload Service
  // ═══════════════════════════════════════════════════════════════

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

    return reply.status(201).send({ data: ticket });
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
