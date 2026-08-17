// Admin CRUD for the festival calendar (roadmap D — growth campaigns).
//
// The calendar is admin-managed: retailers read it read-only via
// GET /v1/growth/festivals; admins add/edit/delete rows freely so they can
// run state-wise / region-wise festival offers with exact start/end dates.
// Festival ids are numeric auto-increment — meaningless to retailers.
//
// SECURITY: guarded by the standard adminAuthPreHandler (admin key + CSRF)
// like every /v1/admin route. DELETE is a SOFT delete (deleted_at) — the app
// role is DELETE-less under SECURITY §19; reads filter deleted rows out.
// Campaigns snapshot festival_name at creation, so deleting a festival never
// breaks existing campaigns.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const FestivalPayloadSchema = z.object({
  name: z.string().trim().min(1, 'Festival name is required').max(120),
  region: z.string().trim().min(1, 'Region is required').max(80),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date(),
});

const FestivalUpdateSchema = FestivalPayloadSchema.partial();

export const adminFestivalsRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/festivals ────────────────────────────────────────
  // Every festival (including past ones) for the management table, newest
  // first so upcoming/current offers sit on top.
  server.get('/festivals', async () => {
    const festivals = await prisma.festival.findMany({
      where: { deleted_at: null },
      orderBy: { starts_at: 'desc' },
    });
    return { data: festivals };
  });

  // ─── POST /admin/festivals ───────────────────────────────────────
  server.post('/festivals', async (request, reply) => {
    const body = FestivalPayloadSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    if (body.data.ends_at <= body.data.starts_at) {
      throw validationError('End date must be after the start date');
    }

    const festival = await prisma.festival.create({ data: body.data });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'Festival',
        resource_id: String(festival.id),
        metadata: {
          name: festival.name,
          region: festival.region,
          starts_at: festival.starts_at.toISOString(),
          ends_at: festival.ends_at.toISOString(),
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ id: festival.id, name: festival.name }, 'Festival created');
    return reply.status(201).send({ data: festival });
  });

  // ─── PUT /admin/festivals/:id ────────────────────────────────────
  server.put<{ Params: { id: string } }>('/festivals/:id', async (request) => {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const existing = await prisma.festival.findFirst({ where: { id, deleted_at: null } });
    if (!existing) throw notFound('Festival');

    const body = FestivalUpdateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const data = body.data;

    const startsAt = data.starts_at ?? existing.starts_at;
    const endsAt = data.ends_at ?? existing.ends_at;
    if (endsAt <= startsAt) throw validationError('End date must be after the start date');

    const festival = await prisma.festival.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.region !== undefined ? { region: data.region } : {}),
        ...(data.starts_at !== undefined ? { starts_at: data.starts_at } : {}),
        ...(data.ends_at !== undefined ? { ends_at: data.ends_at } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'Festival',
        resource_id: String(festival.id),
        metadata: {
          before: {
            name: existing.name,
            region: existing.region,
            starts_at: existing.starts_at.toISOString(),
            ends_at: existing.ends_at.toISOString(),
          },
          after: {
            name: festival.name,
            region: festival.region,
            starts_at: festival.starts_at.toISOString(),
            ends_at: festival.ends_at.toISOString(),
          },
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ id: festival.id, name: festival.name }, 'Festival updated');
    return { data: festival };
  });

  // ─── DELETE /admin/festivals/:id ─────────────────────────────────
  // SOFT delete — same reason as the commission expense ledger: the app role
  // is DELETE-less (SECURITY §19), so this sets deleted_at (an UPDATE) and
  // reads filter it out. Campaigns keep their festival_name snapshot.
  server.delete<{ Params: { id: string } }>('/festivals/:id', async (request, reply) => {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const existing = await prisma.festival.findFirst({ where: { id, deleted_at: null } });
    if (!existing) throw notFound('Festival');

    await prisma.festival.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'Festival',
        resource_id: String(existing.id),
        metadata: {
          name: existing.name,
          region: existing.region,
          starts_at: existing.starts_at.toISOString(),
          ends_at: existing.ends_at.toISOString(),
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ id: existing.id, name: existing.name }, 'Festival deleted');
    return reply.status(204).send();
  });
};
