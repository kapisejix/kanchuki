// F-031? Partner Network Manager (Phase 2: B2B Partnerships with salons, tailors, etc.).
//
// Retailer flows:
//   1. Partner Management: CRUD operations for partners (salons, tailors, etc.)
//   2. Referral Tracking: View referrals from partners and earned commissions
//   3. Commission Payouts: Mark commissions as paid
//   4. Event Management: Create and manage co-hosted events with partners
//
// Security:
//   - Partners are retailer-scoped (can only access own partners)
//   - Every action records an audit log
//   - Feature gated behind PARTNER_NETWORK feature flag
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../../lib/features.js';
import {
  AppError,
  featureUnavailable,
  forbidden,
  notFound,
  serviceUnavailable,
  validationError,
} from '../../../plugins/error-handler.js';
import { isRealOwner } from '../../../plugins/auth.js';



export const retailersPartnersRoutes: FastifyPluginAsync = async (
  server
) => {
  // Guard function to check if PARTNER_NETWORK feature is enabled
  const guard = async (retailerId: string) => {
    if (!(await hasFeature(retailerId, 'PARTNER_NETWORK'))) {
      throw featureUnavailable('Partner Network Manager');
    }
  };

  // ─── GET /retailers/me/partners — list partners ───────
  server.get('/me/partners', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const partners = await prisma.partner.findMany({
      where: { retailer_id: retailerId, is_active: true },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        contact_person: true,
        phone: true,
        email: true,
        referral_code: true,
        commission_rate: true,
        commission_type: true,
        fixed_commission_paise: true,
        created_at: true,
        _count: {
          select: { referrals: { where: { status: 'PENDING' } } },
        },
      },
    });

    return {
      data: partners.map((p) => ({
        ...p,
        pending_referrals: p._count.referrals,
        // Don't send sensitive info like fixed_commission_paise unless needed
      })),
    };
  });

  // ─── POST /retailers/me/partners — create partner ─────
  server.post('/me/partners', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const body = z
      .object({
        name: z.string().min(1),
        type: z.enum(['SALON', 'TAILOR', 'STYLIST', 'MAKEUP_ARTIST', 'OTHER']),
        contact_person: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        address: z.string().optional(),
        commission_rate: z.number().int().min(0).max(100),
        commission_type: z.enum(['FIXED_AMOUNT', 'PERCENTAGE_OF_SALE']).optional(),
        fixed_commission_paise: z.number().int().optional(),
      })
      .safeParse(request.body);

    if (!body.success) throw validationError('Invalid partner data');

    // Generate a unique referral code
    const referralCode = generatePartnerReferralCode();

    const partner = await prisma.partner.create({
      data: {
        retailer_id: retailerId,
        name: body.data.name,
        type: body.data.type,
        contact_person: body.data.contact_person,
        phone: body.data.phone,
        email: body.data.email,
        address: body.data.address,
        referral_code: referralCode,
        commission_rate: body.data.commission_rate,
        commission_type: body.data.commission_type ?? 'PERCENTAGE_OF_SALE',
        fixed_commission_paise:
          body.data.fixed_commission_paise ?? undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'create_partner',
        resource_type: 'Partner',
        resource_id: partner.id,
        metadata: {
          partner_type: partner.type,
          partner_name: partner.name,
        },
        ip_address: request.ip,
      },
    });

    return { data: partner };
  });

  // ─── PUT /retailers/me/partners/:id — update partner ───
  server.put('/me/partners/:id', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    // First verify the partner belongs to this retailer
    const existingPartner = await prisma.partner.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!existingPartner) throw notFound('Partner');

    const body = z
      .object({
        name: z.string().min(1).optional(),
        type: z.enum(['SALON', 'TAILOR', 'STYLIST', 'MAKEUP_ARTIST', 'OTHER']).optional(),
        contact_person: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        address: z.string().optional(),
        commission_rate: z.number().int().min(0).max(100).optional(),
        commission_type: z.enum(['FIXED_AMOUNT', 'PERCENTAGE_OF_SALE']).optional(),
        fixed_commission_paise: z.number().int().optional(),
        is_active: z.boolean().optional(),
      })
      .safeParse(request.body);

    if (!body.success) throw validationError('Invalid partner data');

    // Prevent updating referral_code (it's permanent)
    const updateData: any = {
      ...body.data,
      // Remove undefined values
      commission_type:
        body.data.commission_type === undefined
          ? undefined
          : body.data.commission_type,
      fixed_commission_paise:
        body.data.fixed_commission_paise === undefined
          ? undefined
          : body.data.fixed_commission_paise,
    };

    // Clean up undefined values
    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key]
    );

    const partner = await prisma.partner.update({
      where: { id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'update_partner',
        resource_type: 'Partner',
        resource_id: partner.id,
        metadata: {
          changes: Object.keys(body.data),
        },
        ip_address: request.ip,
      },
    });

    return { data: partner };
  });

  // ─── DELETE /retailers/me/partners/:id — deactivate partner ─
  server.delete('/me/partners/:id', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    // Verify ownership before deleting
    const partner = await prisma.partner.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!partner) throw notFound('Partner');

    // Soft delete by setting is_active to false
    const updatedPartner = await prisma.partner.update({
      where: { id },
      data: { is_active: false },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'deactivate_partner',
        resource_type: 'Partner',
        resource_id: partner.id,
        metadata: {
          partner_type: partner.type,
          partner_name: partner.name,
        },
        ip_address: request.ip,
      },
    });

    return { data: { message: 'Partner deactivated successfully' } };
  });

  // ─── GET /retailers/me/partners/:id/referrals — get partner referrals ─
  server.get('/me/partners/:id/referrals', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    // Verify ownership
    const partner = await prisma.partner.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!partner) throw notFound('Partner');

    const referrals = await prisma.partnerReferral.findMany({
      where: { partner_id: id },
      orderBy: { created_at: 'desc' },
      take: 100,
      select: {
        id: true,
        customer_id: true,
        order_id: true,
        commission_paise: true,
        status: true,
        created_at: true,
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        order: {
          select: {
            id: true,
            total_amount: true,
            status: true,
          },
        },
      },
    });

    return {
      data: referrals.map((r) => ({
        ...r,
        // Format commission for display
        commission_formatted: `₹${(r.commission_paise / 100).toFixed(0)}`,
      })),
    };
  });

  // ─── POST /retailers/me/partners/referrals/:id/pay — mark commission as paid ─
  server.post('/me/partners/referrals/:id/pay', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    // Verify the referral belongs to a partner of this retailer
    const referral = await prisma.partnerReferral.findFirst({
      where: {
        id,
        partner: {
          retailer_id: retailerId,
        },
      },
      include: {
        partner: true,
      },
    });

    if (!referral) throw notFound('Referral');
    if (referral.status === 'PAID')
      throw validationError('Commission already paid');
    if (referral.status === 'CANCELLED')
      throw validationError('Cannot pay cancelled referral');

    // Mark as paid
    const updatedReferral = await prisma.partnerReferral.update({
      where: { id },
      data: { status: 'PAID' },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'pay_partner_commission',
        resource_type: 'PartnerReferral',
        resource_id: referral.id,
        metadata: {
          partner_id: referral.partner_id,
          partner_name: referral.partner.name,
          commission_paise: referral.commission_paise,
        },
        ip_address: request.ip,
      },
    });

    return {
      data: {
        message: `Commission of ₹${(
          referral.commission_paise / 100
        ).toFixed(0)} marked as paid`,
      },
    };
  });

  // ─── GET /retailers/me/partners/events — list partner events ───
  server.get('/me/partners/events', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const events = await prisma.partnerEvent.findMany({
      where: { retailer_id: retailerId },
      orderBy: { starts_at: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        starts_at: true,
        ends_at: true,
        location: true,
        is_virtual: true,
        discount_code: true,
        discount_paise: true,
        is_active: true,
        created_at: true,
        partner: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return {
      data: events.map((e) => ({
        ...e,
        // Format dates for display
        starts_at_formatted: new Date(e.starts_at).toLocaleString(),
        ends_at_formatted: e.ends_at
          ? new Date(e.ends_at).toLocaleString()
          : null,
        // Format discount for display
        discount_formatted: e.discount_paise
          ? `₹${(e.discount_paise / 100).toFixed(0)} off`
          : e.discount_code
          ? `Code: ${e.discount_code}`
          : null,
      })),
    };
  });

  // ─── POST /retailers/me/partners/events — create partner event ───
  server.post('/me/partners/events', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const body = z
      .object({
        partner_id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        starts_at: z.string().datetime(),
        ends_at: z.string().datetime().optional(),
        location: z.string().optional(),
        is_virtual: z.boolean().optional(),
        discount_code: z.string().optional(),
        discount_paise: z.number().int().optional(),
      })
      .safeParse(request.body);

    if (!body.success) throw validationError('Invalid event data');

    // Verify the partner belongs to this retailer
    const partner = await prisma.partner.findFirst({
      where: {
        id: body.data.partner_id,
        retailer_id: retailerId,
      },
    });
    if (!partner) throw notFound('Partner');

    const event = await prisma.partnerEvent.create({
      data: {
        retailer_id: retailerId,
        partner_id: body.data.partner_id,
        name: body.data.name,
        description: body.data.description,
        starts_at: new Date(body.data.starts_at),
        ends_at: body.data.ends_at
          ? new Date(body.data.ends_at)
          : undefined,
        location: body.data.location,
        is_virtual: body.data.is_virtual ?? false,
        discount_code: body.data.discount_code,
        discount_paise: body.data.discount_paise,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'create_partner_event',
        resource_type: 'PartnerEvent',
        resource_id: event.id,
        metadata: {
          partner_id: event.partner_id,
          partner_name: partner.name,
          event_name: event.name,
        },
        ip_address: request.ip,
      },
    });

    return { data: event };
  });

  // ─── PUT /retailers/me/partners/events/:id — update event ───
  server.put('/me/partners/events/:id', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    // Verify ownership through partner
    const existingEvent = await prisma.partnerEvent.findFirst({
      where: {
        id,
        partner: {
          retailer_id: retailerId,
        },
      },
    });
    if (!existingEvent) throw notFound('Event');

    const body = z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        starts_at: z.string().datetime().optional(),
        ends_at: z.string().datetime().optional(),
        location: z.string().optional(),
        is_virtual: z.boolean().optional(),
        discount_code: z.string().optional(),
        discount_paise: z.number().int().optional(),
        is_active: z.boolean().optional(),
      })
      .safeParse(request.body);

    if (!body.success) throw validationError('Invalid event data');

    // Clean up undefined values
    const updateData: any = {
      ...body.data,
      starts_at:
        body.data.starts_at !== undefined
          ? new Date(body.data.starts_at)
          : undefined,
      ends_at:
        body.data.ends_at !== undefined
          ? new Date(body.data.ends_at)
          : undefined,
    };

    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key]
    );

    const event = await prisma.partnerEvent.update({
      where: { id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'update_partner_event',
        resource_type: 'PartnerEvent',
        resource_id: event.id,
        metadata: {
          changes: Object.keys(body.data),
        },
        ip_address: request.ip,
      },
    });

    return { data: event };
  });

  // ─── DELETE /retailers/me/partners/events/:id — delete event ───
  server.delete('/me/partners/events/:id', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    // Verify ownership through partner
    const event = await prisma.partnerEvent.findFirst({
      where: {
        id,
        partner: {
          retailer_id: retailerId,
        },
      },
    });
    if (!event) throw notFound('Event');

    // Soft delete
    await prisma.partnerEvent.update({
      where: { id },
      data: { is_active: false },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'delete_partner_event',
        resource_type: 'PartnerEvent',
        resource_id: event.id,
        metadata: {
          partner_id: event.partner_id,
          event_name: event.name,
        },
        ip_address: request.ip,
      },
    });

    return { data: { message: 'Event deactivated successfully' } };
  });
};

// Helper function to generate a unique partner referral code
function generatePartnerReferralCode(): string {
  // Generate a readable code like: PART-SALO-XXXXXX
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PART-${timestamp.substring(0, 4)}-${random}`;
}