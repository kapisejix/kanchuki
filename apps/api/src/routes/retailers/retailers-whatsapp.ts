// Auto-split from retailers.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import { featureUnavailable, notFound, validationError } from '../../plugins/error-handler.js';

export const retailersWhatsappRoutes: FastifyPluginAsync = async (server) => {
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
};
