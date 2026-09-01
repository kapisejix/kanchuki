import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@kanchuki/db';
import { z } from 'zod';
import { adminAuthPreHandler } from '../admin-auth.js';

const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/;

export const adminGstProfileRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/gst-profile ─────────────────────────────────────
  // Returns the platform GST profile (singleton row). 404 if never set.
  server.get('/gst-profile', async () => {
    const row = await prisma.platformGstProfile.findUnique({ where: { id: 'singleton' } });
    if (!row) return { data: null };
    return { data: row };
  });

  // ─── PUT /admin/gst-profile ─────────────────────────────────────
  // Upsert the platform GST profile. Validates GSTIN format (15 chars).
  server.put('/gst-profile', async (request) => {
    const body = z
      .object({
        company_name: z.string().min(1),
        gstin: z.string().regex(GSTIN_REGEX, 'Invalid GSTIN format (15 chars, e.g. 27AABCU9603R1ZM)'),
        address_line1: z.string().min(1),
        address_line2: z.string().optional(),
        city: z.string().min(1),
        state: z.string().min(1),
        state_code: z.string().regex(/^\d{2}$/, 'State code must be 2 digits'),
        pan: z.string().optional(),
        invoice_prefix: z.string().min(1).default('KAN'),
      })
      .parse(request.body);

    const prev = await prisma.platformGstProfile.findUnique({ where: { id: 'singleton' } });

    const row = await prisma.platformGstProfile.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...body },
      update: body,
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: prev ? 'UPDATE' : 'CREATE',
        resource_type: 'PlatformGstProfile',
        resource_id: 'singleton',
        metadata: {
          before: prev
            ? { company_name: prev.company_name, gstin: prev.gstin, state_code: prev.state_code }
            : null,
          after: { company_name: body.company_name, gstin: body.gstin, state_code: body.state_code },
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ company_name: body.company_name }, 'GST profile updated');

    return { data: row };
  });
};
