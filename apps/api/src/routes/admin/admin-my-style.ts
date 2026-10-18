// Admin controls for F-045 My Style (PR-8 T18): palettes, trends, selfie-analysis usage.
//
//   GET   /my-style/palettes            PATCH /my-style/palettes/:id
//   GET   /my-style/trends              POST  /my-style/trends   PATCH /my-style/trends/:id
//   GET   /my-style/usage?days=30       (Super Admin only - cost telemetry)
//
// Segment 'my-style' sits in the standard-admin list (content/taxonomy, same tier as
// 'color-families'); the usage report is gated on the role inside the handler instead.
// Rules the tests pin:
//   - NO delete (RC-049: kanchuki_app has no DELETE here). Retire with is_active.
//   - Palettes are a fixed 3x3 grid (undertone x depth), so there is no create: an admin
//     edits a cell, never invents one. Each edit bumps `version` so a change is visible.
//   - good/avoid hold color_families.name values. Postgres cannot FK an array element, so
//     this file is the validator (migration 133 says so): every name must be an ACTIVE
//     family, and a family cannot be both good and avoid for one palette.
//   - Colour names are validated against the table, not a copy of it, so an alias edit in
//     Admin -> colour families is immediately usable here.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError, notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

// ~Rs 0.33 per Claude Vision image (spec s9). An estimate for the chart, not a bill.
export const COST_PER_ANALYSIS_PAISE = 33;

const familyList = z
  .array(z.string().trim().toLowerCase().min(1).max(40))
  .max(30)
  .transform((a) => [...new Set(a)]);

const PaletteUpdate = z
  .object({
    good_families: familyList.optional(),
    avoid_families: familyList.optional(),
    is_active: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

const keywords = z
  .array(z.string().trim().toLowerCase().min(2).max(40))
  .max(30)
  .transform((a) => [...new Set(a)]);
const isoDate = z.string().datetime({ offset: true }).nullable();

const TrendFields = {
  label: z.string().trim().min(2).max(60),
  kind: z.string().trim().toLowerCase().min(2).max(30),
  match_keywords: keywords,
  boost: z.number().min(0).max(1),
  starts_at: isoDate,
  ends_at: isoDate,
};
const TrendCreate = z
  .object({
    ...TrendFields,
    match_keywords: keywords.default([]),
    boost: TrendFields.boost.default(0),
  })
  .partial({ starts_at: true, ends_at: true })
  .strict();
const TrendUpdate = z
  .object({ ...TrendFields, is_active: z.boolean() })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

function assertWindow(starts: Date | null | undefined, ends: Date | null | undefined): void {
  if (starts && ends && ends < starts) {
    throw validationError('ends_at must be on or after starts_at', 'ends_at');
  }
}
const toDate = (s: string | null | undefined) => (s ? new Date(s) : s === null ? null : undefined);

export const adminMyStyleRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  async function audit(
    request: { adminId?: string | null; ip: string },
    action: 'CREATE' | 'UPDATE',
    resource_type: string,
    resource_id: string,
    metadata: Record<string, unknown>,
  ) {
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action,
        resource_type,
        resource_id,
        metadata: { ...metadata, admin: request.adminId ?? null },
        ip_address: request.ip,
      },
    });
  }

  // --- palettes -------------------------------------------------
  server.get('/my-style/palettes', async () => ({
    data: await prisma.stylePalette.findMany({
      orderBy: [{ undertone: 'asc' }, { depth: 'asc' }, { version: 'desc' }],
    }),
  }));

  server.patch('/my-style/palettes/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = PaletteUpdate.safeParse(request.body ?? {});
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const existing = await prisma.stylePalette.findUnique({ where: { id } });
    if (!existing) throw notFound('Palette');

    const good = body.data.good_families ?? existing.good_families;
    const avoid = body.data.avoid_families ?? existing.avoid_families;
    const both = good.find((f) => avoid.includes(f));
    if (both) throw validationError(`"${both}" cannot be both good and avoid`, 'avoid_families');

    if (body.data.good_families || body.data.avoid_families) {
      const known = new Set(
        (
          await prisma.colorFamily.findMany({ where: { is_active: true }, select: { name: true } })
        ).map((f) => f.name),
      );
      const unknown = [...good, ...avoid].find((f) => !known.has(f));
      if (unknown) {
        throw validationError(`"${unknown}" is not an active colour family`, 'good_families');
      }
    }

    const row = await prisma.stylePalette.update({
      where: { id },
      data: { ...body.data, version: { increment: 1 } },
    });
    await audit(request, 'UPDATE', 'StylePalette', id, {
      cell: `${existing.undertone}/${existing.depth}`,
      before: {
        good: existing.good_families,
        avoid: existing.avoid_families,
        is_active: existing.is_active,
      },
      after: { good: row.good_families, avoid: row.avoid_families, is_active: row.is_active },
    });
    return { data: row };
  });

  // --- trends ---------------------------------------------------
  server.get('/my-style/trends', async () => ({
    data: await prisma.styleTrend.findMany({ orderBy: [{ is_active: 'desc' }, { label: 'asc' }] }),
  }));

  server.post('/my-style/trends', async (request, reply) => {
    const body = TrendCreate.safeParse(request.body ?? {});
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const { starts_at, ends_at, ...rest } = body.data;
    const starts = toDate(starts_at) ?? null;
    const ends = toDate(ends_at) ?? null;
    assertWindow(starts, ends);

    const row = await prisma.styleTrend.create({
      data: { ...rest, starts_at: starts, ends_at: ends },
    });
    await audit(request, 'CREATE', 'StyleTrend', row.id, { label: row.label, boost: row.boost });
    return reply.status(201).send({ data: row });
  });

  server.patch('/my-style/trends/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = TrendUpdate.safeParse(request.body ?? {});
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const existing = await prisma.styleTrend.findUnique({ where: { id } });
    if (!existing) throw notFound('Trend');

    const { starts_at, ends_at, ...rest } = body.data;
    const starts = toDate(starts_at);
    const ends = toDate(ends_at);
    assertWindow(
      starts === undefined ? existing.starts_at : starts,
      ends === undefined ? existing.ends_at : ends,
    );

    const row = await prisma.styleTrend.update({
      where: { id },
      data: {
        ...rest,
        ...(starts !== undefined && { starts_at: starts }),
        ...(ends !== undefined && { ends_at: ends }),
      },
    });
    await audit(request, 'UPDATE', 'StyleTrend', id, {
      label: existing.label,
      before: { boost: existing.boost, is_active: existing.is_active },
      after: { boost: row.boost, is_active: row.is_active },
    });
    return { data: row };
  });

  // --- usage ----------------------------------------------------
  server.get('/my-style/usage', async (request) => {
    if (request.adminRole !== 'SUPER_ADMIN') {
      throw new AppError('FORBIDDEN', 'Only a Super Admin can view My Style usage and cost', 403);
    }
    const { days } = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
      .parse(request.query ?? {});

    const today = new Date(new Date().toISOString().slice(0, 10));
    const since = new Date(today.getTime() - (days - 1) * 86_400_000);
    const rows = await prisma.styleAnalysisDaily.findMany({
      where: { day: { gte: since } },
      orderBy: { day: 'asc' },
    });
    const counts = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r.count]));

    // Every day in the window, zeros included, so the chart has no gaps to misread.
    const by_day = Array.from({ length: days }, (_, i) => {
      const day = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      const count = counts.get(day) ?? 0;
      return { day, count, cost_paise: count * COST_PER_ANALYSIS_PAISE };
    });
    const total = by_day.reduce((s, d) => s + d.count, 0);

    const limit = await prisma.customerResourceLimit.findUnique({
      where: { resource_type: 'STYLE_ANALYSIS' },
    });

    return {
      data: {
        days,
        totals: { analyses: total, cost_paise: total * COST_PER_ANALYSIS_PAISE },
        cost_per_analysis_paise: COST_PER_ANALYSIS_PAISE,
        by_day,
        limit: limit ? { limit_per_period: limit.limit_per_period, period: limit.period } : null,
      },
    };
  });
};
