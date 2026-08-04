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

export const adminAiRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/ai-providers ─────────────────────────────────────
  server.get('/ai-providers', async () => {
    const rows = await prisma.aiProviderConfig.findMany({
      orderBy: [{ priority: 'asc' }, { created_at: 'asc' }],
    });

    // Report whether each row's key is actually configured (DB or env), so
    // the admin UI can flag rows that will be skipped by the failover.
    const withKeyState = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        key_configured: !!(await getSecret(row.api_key_name)),
      })),
    );
    return { data: withKeyState };
  });

  // ─── POST /admin/ai-providers ────────────────────────────────────
  server.post('/ai-providers', async (request, reply) => {
    const body = z
      .object({
        provider_type: z.enum(['ANTHROPIC', 'OPENAI_COMPAT', 'GEMINI']),
        label: z.string().min(1).max(100),
        model_name: z.string().min(1).max(200),
        lite_model_name: z.string().max(200).nullable().optional(),
        base_url: z.string().url().nullable().optional(),
        api_key_name: z.string().min(1).max(100),
        priority: z.number().int().min(1).max(999).optional(),
        is_active: z.boolean().optional(),
        credits_per_call: z.number().int().min(1).max(100_000).default(1),
      })
      .parse(request.body);

    const row = await prisma.aiProviderConfig.create({
      data: {
        provider_type: body.provider_type,
        label: body.label,
        model_name: body.model_name,
        lite_model_name: body.lite_model_name ?? null,
        base_url: body.base_url ?? null,
        api_key_name: body.api_key_name,
        priority: body.priority ?? 1,
        is_active: body.is_active ?? true,
        credits_per_call: body.credits_per_call,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'AiProviderConfig',
        resource_id: row.id,
        metadata: {
          label: row.label,
          provider_type: row.provider_type,
          model_name: row.model_name,
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ provider_id: row.id, label: row.label }, 'AI provider created');
    return reply.status(201).send({ data: row });
  });

  // ─── PATCH /admin/ai-providers/:id ───────────────────────────────
  server.patch<{ Params: { id: string } }>('/ai-providers/:id', async (request) => {
    const body = z
      .object({
        provider_type: z.enum(['ANTHROPIC', 'OPENAI_COMPAT', 'GEMINI']).optional(),
        label: z.string().min(1).max(100).optional(),
        model_name: z.string().min(1).max(200).optional(),
        lite_model_name: z.string().max(200).nullable().optional(),
        base_url: z.string().url().nullable().optional(),
        api_key_name: z.string().min(1).max(100).optional(),
        priority: z.number().int().min(1).max(999).optional(),
        is_active: z.boolean().optional(),
        credits_per_call: z.number().int().min(1).max(100_000).optional(),
      })
      .parse(request.body);

    const existing = await prisma.aiProviderConfig.findUnique({ where: { id: request.params.id } });
    if (!existing) throw notFound('AI provider');

    const row = await prisma.aiProviderConfig.update({
      where: { id: request.params.id },
      data: body,
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'AiProviderConfig',
        resource_id: row.id,
        metadata: { label: row.label, updated_fields: Object.keys(body) },
        ip_address: request.ip,
      },
    });

    request.log.info({ provider_id: row.id }, 'AI provider updated');
    return { data: row };
  });

  // ─── DELETE /admin/ai-providers/:id ──────────────────────────────
  server.delete<{ Params: { id: string } }>('/ai-providers/:id', async (request, reply) => {
    const existing = await prisma.aiProviderConfig.findUnique({ where: { id: request.params.id } });
    if (!existing) throw notFound('AI provider');

    await prisma.aiProviderConfig.delete({ where: { id: request.params.id } });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'AiProviderConfig',
        resource_id: request.params.id,
        metadata: { label: existing.label, provider_type: existing.provider_type },
        ip_address: request.ip,
      },
    });

    request.log.info({ provider_id: request.params.id }, 'AI provider deleted');
    return reply.status(204).send();
  });

  // ─── POST /admin/ai-providers/reorder ────────────────────────────
  // Accept an ordered list of ids; rewrites priority 1..N in that order.
  server.post('/ai-providers/reorder', async (request) => {
    const body = z.object({ ordered_ids: z.array(z.string()).min(1).max(100) }).parse(request.body);

    await prisma.$transaction(
      body.ordered_ids.map((id, index) =>
        prisma.aiProviderConfig.update({
          where: { id },
          data: { priority: index + 1 },
        }),
      ),
    );

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'AiProviderConfig',
        metadata: { reordered: body.ordered_ids },
        ip_address: request.ip,
      },
    });

    return { data: { reordered: body.ordered_ids.length } };
  });
};
