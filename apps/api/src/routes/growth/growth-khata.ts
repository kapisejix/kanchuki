import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validationError, notFound } from '../../plugins/error-handler.js';
import { summarizeKhata } from './growth-helpers.js';

const KhataEntrySchema = z.object({
  type: z.enum(['SALES', 'PURCHASE', 'EXPENSE']),
  payment_mode: z.enum(['CASH', 'UPI', 'OTHER']),
  amount_paise: z.number().int().min(1),
  entry_date: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
});

// Free for all plans — this is a baseline ops tool, not a paid extra.

export const growthKhataRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /growth/khata ──────────────────────────────────────────
  // ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive, retailer-local day).
  server.get('/khata', async (request) => {
    const retailerId = request.retailerId;
    const query = z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .safeParse(request.query);
    const from = query.success && query.data.from ? new Date(`${query.data.from}T00:00:00.000Z`) : undefined;
    const to = query.success && query.data.to ? new Date(`${query.data.to}T23:59:59.999Z`) : undefined;

    const entries = await prisma.khataEntry.findMany({
      where: { retailer_id: retailerId, ...(from ? { entry_date: { gte: from } } : {}), ...(to ? { entry_date: { lte: to } } : {}) },
      orderBy: { entry_date: 'desc' },
      take: query.success ? query.data.limit : 100,
    });
    return { data: entries };
  });

  // ─── POST /growth/khata ─────────────────────────────────────────
  server.post('/khata', async (request, reply) => {
    const retailerId = request.retailerId;
    const body = KhataEntrySchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const { entry_date, ...rest } = body.data;
    const entry = await prisma.khataEntry.create({
      data: { retailer_id: retailerId, entry_date: entry_date ? new Date(entry_date) : new Date(), ...rest },
    });
    return reply.status(201).send({ data: entry });
  });

  // ─── PUT /growth/khata/:id ──────────────────────────────────────
  server.put('/khata/:id', async (request, reply) => {
    const retailerId = request.retailerId;
    const { id } = request.params as { id: string };
    const existing = await prisma.khataEntry.findFirst({ where: { id, retailer_id: retailerId } });
    if (!existing) throw notFound('Khata entry');

    const body = KhataEntrySchema.partial().safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const { entry_date, ...rest } = body.data;
    const updated = await prisma.khataEntry.update({
      where: { id },
      data: { ...rest, ...(entry_date ? { entry_date: new Date(entry_date) } : {}) },
    });
    return reply.send({ data: updated });
  });

  // ─── DELETE /growth/khata/:id ───────────────────────────────────
  server.delete('/khata/:id', async (request, reply) => {
    const retailerId = request.retailerId;
    const { id } = request.params as { id: string };
    const existing = await prisma.khataEntry.findFirst({ where: { id, retailer_id: retailerId } });
    if (!existing) throw notFound('Khata entry');
    await prisma.khataEntry.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ─── GET /growth/khata/summary ──────────────────────────────────
  // P&L over a range (default: current month) + per-day trend.
  server.get('/khata/summary', async (request) => {
    const retailerId = request.retailerId;
    const query = z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .safeParse(request.query);
    const now = new Date();
    const from = query.success && query.data.from ? new Date(`${query.data.from}T00:00:00.000Z`) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = query.success && query.data.to ? new Date(`${query.data.to}T23:59:59.999Z`) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const entries = await prisma.khataEntry.findMany({
      where: { retailer_id: retailerId, entry_date: { gte: from, lte: to } },
      select: { type: true, payment_mode: true, amount_paise: true, entry_date: true },
      orderBy: { entry_date: 'asc' },
    });

    const daily = new Map<string, { sales: number; purchases: number; expenses: number }>();
    for (const e of entries) {
      const day = e.entry_date.toISOString().slice(0, 10);
      const row = daily.get(day) ?? { sales: 0, purchases: 0, expenses: 0 };
      if (e.type === 'SALES') row.sales += e.amount_paise;
      else if (e.type === 'PURCHASE') row.purchases += e.amount_paise;
      else row.expenses += e.amount_paise;
      daily.set(day, row);
    }

    return {
      data: {
        summary: summarizeKhata(entries),
        daily: Array.from(daily.entries()).map(([date, v]) => ({ date, ...v })),
      },
    };
  });
};
