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
import { INTEGRATION_KEYS, PLAN_PRICING, R2_PATHS } from '@kanchuki/shared';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

export const adminIntegrationsRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

type IntegrationKeyEntry = (typeof INTEGRATION_KEYS)[number];
  // ─── GET /admin/integrations ─────────────────────────────────────
  // F-012: super-admin-only credential vault. Values are never returned —
  // only masked_preview. Every catalog key not yet configured here is
  // listed as "not_set" (falling back to its .env var at call time).
  server.get('/integrations', async () => {
    const rows = await prisma.integrationSetting.findMany({ orderBy: { key_name: 'asc' } });
    const byKey = new Map(rows.map((r) => [r.key_name, r]));

    const catalog = INTEGRATION_KEYS.map(({ key_name, category, label }: IntegrationKeyEntry) => {
      const row = byKey.get(key_name);
      return row
        ? {
            id: row.id,
            key_name: row.key_name,
            category: row.category,
            label: row.label,
            masked_preview: row.masked_preview,
            is_active: row.is_active,
            updated_at: row.updated_at,
            configured: true,
          }
        : {
            id: null,
            key_name,
            category,
            label,
            masked_preview: null,
            is_active: false,
            updated_at: null,
            configured: false,
          };
    });

    return { data: catalog };
  });

  // ─── POST /admin/integrations ─────────────────────────────────────
  // Create a credential row. Fails if key_name is already configured —
  // use PATCH to rotate an existing one (never-reveal: there is no way to
  // read the old value back, so this is a deliberate two-endpoint split).
  server.post('/integrations', async (request) => {
    const body = z
      .object({
        key_name: z.enum(
          INTEGRATION_KEYS.map((k: IntegrationKeyEntry) => k.key_name) as [string, ...string[]],
        ),
        value: z.string().min(1).max(2000),
      })
      .parse(request.body);

    const known = INTEGRATION_KEYS.find((k: IntegrationKeyEntry) => k.key_name === body.key_name);
    if (!known) throw validationError('Unknown integration key', 'key_name');

    const existing = await prisma.integrationSetting.findUnique({
      where: { key_name: body.key_name },
    });
    if (existing) throw validationError('Already configured — use PATCH to update', 'key_name');

    const row = await prisma.integrationSetting.create({
      data: {
        key_name: known.key_name,
        category: known.category,
        label: known.label,
        encrypted_value: encryptSecret(body.value),
        masked_preview: maskSecret(body.value),
      },
    });
    invalidateSecret(known.key_name);

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'IntegrationSetting',
        resource_id: known.key_name,
        metadata: { category: known.category, label: known.label },
        ip_address: request.ip,
      },
    });

    request.log.info({ key_name: known.key_name }, 'Integration setting created');
    const { encrypted_value: _encrypted_value, ...safe } = row;
    return { data: safe };
  });

  // ─── PATCH /admin/integrations/:id ─────────────────────────────────
  // Rotate the value and/or toggle is_active. Never returns the value.
  server.patch('/integrations/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        value: z.string().min(1).max(2000).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = await prisma.integrationSetting.findUnique({ where: { id } });
    if (!existing) throw notFound('Integration setting');

    const row = await prisma.integrationSetting.update({
      where: { id },
      data: {
        ...(body.value !== undefined
          ? { encrypted_value: encryptSecret(body.value), masked_preview: maskSecret(body.value) }
          : {}),
        ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
      },
    });
    invalidateSecret(existing.key_name);

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'IntegrationSetting',
        resource_id: existing.key_name,
        metadata: { rotated_value: body.value !== undefined, is_active: row.is_active },
        ip_address: request.ip,
      },
    });

    request.log.info({ key_name: existing.key_name }, 'Integration setting updated');
    const { encrypted_value: _encrypted_value, ...safe } = row;
    return { data: safe };
  });

  // ─── DELETE /admin/integrations/:id ────────────────────────────────
  // Removes the DB override — the app falls back to the .env var of the
  // same name (getSecret()), it does not disable the integration outright.
  server.delete('/integrations/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const existing = await prisma.integrationSetting.findUnique({ where: { id } });
    if (!existing) throw notFound('Integration setting');

    await prisma.integrationSetting.delete({ where: { id } });
    invalidateSecret(existing.key_name);

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'IntegrationSetting',
        resource_id: existing.key_name,
        metadata: { category: existing.category, label: existing.label },
        ip_address: request.ip,
      },
    });

    request.log.info({ key_name: existing.key_name }, 'Integration setting deleted');
    return reply.status(204).send();
  });

};
