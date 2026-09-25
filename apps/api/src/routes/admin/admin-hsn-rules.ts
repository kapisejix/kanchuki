// Admin editor for the HSN keyword rules used by the WhatsApp catalog sync
// (§6.11, migration 117). Read by jobs/catalog-sync.ts refreshHsnRules().
//
// SECURITY: adminAuthPreHandler + super-admin segment (`hsn-rules`, tax data —
// see packages/shared/src/constants/admin-access.ts). No DELETE: the app role
// is DELETE-less (SECURITY §19); a rule is retired with is_active = false.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const RulePayloadSchema = z.object({
  // Lowercased + de-duplicated here so the matcher never has to care.
  keywords: z
    .array(z.string().trim().toLowerCase().min(1).max(40))
    .min(1, 'At least one keyword is required')
    .max(30)
    .transform((k) => [...new Set(k)]),
  hsn: z
    .string()
    .trim()
    .regex(/^\d{4}(\d{2}){0,2}$/, 'HSN must be 4, 6 or 8 digits'),
  sort_order: z.number().int().min(0).max(100_000).default(0),
  is_active: z.boolean().default(true),
});

// Pinned by test: a PATCH of one field must not re-apply the create defaults
// (is_active / sort_order). zod's .partial() skips defaults today; the test
// catches it if an upgrade changes that.
const RuleUpdateSchema = RulePayloadSchema.partial();

const snapshot = (r: {
  keywords: string[];
  hsn: string;
  sort_order: number;
  is_active: boolean;
}) => ({
  keywords: r.keywords,
  hsn: r.hsn,
  sort_order: r.sort_order,
  is_active: r.is_active,
});

export const adminHsnRulesRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/hsn-rules ────────────────────────────────────────
  // Every rule, inactive included, in match order.
  server.get('/hsn-rules', async () => {
    const rules = await prisma.hsnRule.findMany({
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
    return { data: rules };
  });

  // ─── POST /admin/hsn-rules ───────────────────────────────────────
  server.post('/hsn-rules', async (request, reply) => {
    const body = RulePayloadSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const rule = await prisma.hsnRule.create({ data: body.data });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'HsnRule',
        resource_id: rule.id,
        metadata: snapshot(rule),
        ip_address: request.ip,
      },
    });
    return reply.status(201).send({ data: rule });
  });

  // ─── PATCH /admin/hsn-rules/:id ──────────────────────────────────
  server.patch<{ Params: { id: string } }>('/hsn-rules/:id', async (request) => {
    const existing = await prisma.hsnRule.findUnique({ where: { id: request.params.id } });
    if (!existing) throw notFound('HSN rule');

    const body = RuleUpdateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const rule = await prisma.hsnRule.update({ where: { id: existing.id }, data: body.data });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'HsnRule',
        resource_id: rule.id,
        metadata: { before: snapshot(existing), after: snapshot(rule) },
        ip_address: request.ip,
      },
    });
    return { data: rule };
  });
};
