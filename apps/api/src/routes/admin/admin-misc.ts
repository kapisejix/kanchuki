// Auto-split from admin.ts (scripts/split-admin-routes.mjs) — route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';

import {
  encryptSecret,
  getReplicaPrisma,
  getSecret,
  getVaultPrisma,
  invalidateSecret,
  maskSecret,
  prisma,
  vaultDelete,
} from '@kanchuki/db';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

export const adminMiscRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/default-categories ──────────────────────────────
  // F-024: admin-editable GLOBAL template for the retailer Shop-By-
  // Categories defaults. Copied into new retailers at onboarding; AI
  // tagging auto-assigns category_id against the retailer's own list.
  server.get('/default-categories', async () => {
    const categories = await prisma.defaultProductCategory.findMany({
      orderBy: { sort_order: 'asc' },
    });
    return { data: categories };
  });

  // ─── POST /admin/default-categories ─────────────────────────────
  server.post('/default-categories', async (request) => {
    const body = z
      .object({
        name: z.string().min(1).max(100),
        sort_order: z.number().int().min(0).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(request.body);

    const category = await prisma.defaultProductCategory
      .create({
        data: {
          name: body.name.trim(),
          sort_order: body.sort_order ?? 0,
          is_active: body.is_active ?? true,
        },
      })
      .catch(() => null);
    if (!category) throw validationError('A default category with this name already exists', 'name');

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'DefaultProductCategory',
        resource_id: category.id,
        metadata: { name: category.name, sort_order: category.sort_order },
        ip_address: request.ip,
      },
    });

    return { data: category };
  });

  // ─── PATCH /admin/default-categories/:id ────────────────────────
  server.patch<{ Params: { id: string } }>('/default-categories/:id', async (request) => {
    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        sort_order: z.number().int().min(0).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(request.body);

    const category = await prisma.defaultProductCategory
      .update({
        where: { id: request.params.id },
        data: body.name !== undefined ? { ...body, name: body.name.trim() } : body,
      })
      .catch(() => null);
    if (!category) throw notFound('Default category');

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'DefaultProductCategory',
        resource_id: category.id,
        metadata: { name: category.name, sort_order: category.sort_order, is_active: category.is_active },
        ip_address: request.ip,
      },
    });

    return { data: category };
  });

  // ─── DELETE /admin/default-categories/:id ───────────────────────
  server.delete<{ Params: { id: string } }>('/default-categories/:id', async (request, reply) => {
    const category = await prisma.defaultProductCategory
      .delete({ where: { id: request.params.id } })
      .catch(() => null);

    if (category) {
      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          action: 'DELETE',
          resource_type: 'DefaultProductCategory',
          resource_id: category.id,
          metadata: { name: category.name },
          ip_address: request.ip,
        },
      });
    }

    return reply.status(204).send();
  });

  // ─── AI Provider Registry (F-023) ───────────────────────────────
  // Admin-configurable list of tagging models the failover engine tries in
  // priority order. Each row = provider type + model + API key name + weighted
  // credit cost. Admin adds any OpenAI-protocol provider via OPENAI_COMPAT
  // + base_url (OpenRouter, DeepSeek, Mistral, Groq, ...).

};
