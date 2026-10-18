// Admin colour-family alias CRUD (F-045 My Style, PR-2 T5; spec §4.1).
//
// `color_families` maps the AI's free-text colours ("Mustard", "Haldi") onto a canonical
// family name that products.color_family and style_palettes both store. So:
//   - NAME is immutable. A rename would orphan every product and palette that holds it.
//   - NO delete (RC-049: kanchuki_app has no DELETE on this table). Retire with is_active.
//   - One term, one family: an alias may not equal another family's name or alias — the
//     normaliser takes the first match, so a duplicate would silently depend on row order.
//     Inactive families still own their terms (re-activating must not create a clash).

import { prisma } from '@kanchuki/db';
import { cleanColorTerm } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { clearColorFamilyCache } from '../../lib/color-families.js';
import { AppError, notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const TERM_RE = /^[a-z0-9][a-z0-9 -]{1,39}$/;
const term = z
  .string()
  .transform(cleanColorTerm)
  .pipe(z.string().regex(TERM_RE, 'Use lowercase letters, digits, spaces or hyphens (max 40)'));
const aliasList = z
  .array(term)
  .max(40)
  .transform((a) => [...new Set(a)]);

const CreateSchema = z.object({ name: term, aliases: aliasList.default([]) }).strict();
const UpdateSchema = z
  .object({ aliases: aliasList.optional(), is_active: z.boolean().optional() })
  .strict()
  .refine((b) => b.aliases !== undefined || b.is_active !== undefined, 'Nothing to update');

type Row = { id: string; name: string; aliases: string[] };

/** term -> owning family name, over every family except `exceptId`. */
function ownersExcept(rows: Row[], exceptId?: string): Map<string, string> {
  const owners = new Map<string, string>();
  for (const r of rows) {
    if (r.id === exceptId) continue;
    for (const t of [r.name, ...r.aliases]) owners.set(cleanColorTerm(t), r.name);
  }
  return owners;
}

function assertAliasesFree(name: string, aliases: string[], owners: Map<string, string>): void {
  for (const a of aliases) {
    if (a === name) throw validationError(`Alias "${a}" is the family's own name`, 'aliases');
    const owner = owners.get(a);
    if (owner) throw new AppError('CONFLICT', `"${a}" already belongs to "${owner}"`, 409);
  }
}

export const adminColorFamilyRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  server.get('/color-families', async () => ({
    data: await prisma.colorFamily.findMany({ orderBy: { name: 'asc' } }),
  }));

  server.post('/color-families', async (request, reply) => {
    const body = CreateSchema.safeParse(request.body ?? {});
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const { name, aliases } = body.data;

    const owners = ownersExcept(await prisma.colorFamily.findMany());
    const owner = owners.get(name);
    if (owner) throw new AppError('CONFLICT', `"${name}" already belongs to "${owner}"`, 409);
    assertAliasesFree(name, aliases, owners);

    let row: Awaited<ReturnType<typeof prisma.colorFamily.create>>;
    try {
      row = await prisma.colorFamily.create({ data: { name, aliases } });
    } catch (err) {
      if ((err as { code?: string } | null)?.code === 'P2002') {
        throw new AppError('CONFLICT', `"${name}" already exists`, 409);
      }
      throw err;
    }
    clearColorFamilyCache();
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'ColorFamily',
        resource_id: row.id,
        metadata: { name, aliases },
        ip_address: request.ip,
      },
    });
    return reply.status(201).send({ data: row });
  });

  server.patch('/color-families/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = UpdateSchema.safeParse(request.body ?? {});
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const existing = await prisma.colorFamily.findUnique({ where: { id } });
    if (!existing) throw notFound('Colour family');

    if (body.data.aliases) {
      const owners = ownersExcept(await prisma.colorFamily.findMany(), id);
      assertAliasesFree(existing.name, body.data.aliases, owners);
    }

    const row = await prisma.colorFamily.update({ where: { id }, data: body.data });
    clearColorFamilyCache();
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'ColorFamily',
        resource_id: id,
        metadata: { name: existing.name, ...body.data },
        ip_address: request.ip,
      },
    });
    return { data: row };
  });
};
