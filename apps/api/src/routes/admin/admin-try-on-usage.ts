// F-044 R2 T7 (E11) - try-on GPU usage report.
//
// Super-admin segment ('try-on-usage' in admin-access.ts): it is cost
// telemetry, same tier as 'ai-usage'. Aggregated in JS from one bounded
// findMany over the window - volume is quota-capped.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminAuthPreHandler } from '../admin-auth.js';

// ponytail: hard cap on rows scanned; move to SQL GROUP BY if a window ever exceeds it.
const MAX_ROWS = 100_000;

export const adminTryOnUsageRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  server.get('/try-on-usage', async (request) => {
    const { days } = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
      .parse(request.query ?? {});

    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await prisma.tryOnJob.findMany({
      where: { created_at: { gte: since } },
      select: { retailer_id: true, status: true, gpu_ms: true, created_at: true },
      orderBy: { created_at: 'asc' },
      take: MAX_ROWS,
    });

    let completed = 0;
    let failed = 0;
    let sum = 0;
    let metered = 0;
    const byDay = new Map<string, { jobs: number; gpu_ms_sum: number }>();
    const byRetailer = new Map<string, { jobs: number; gpu_ms_sum: number }>();

    for (const r of rows) {
      const ms = r.gpu_ms ?? 0;
      if (r.status === 'COMPLETED') completed++;
      if (r.status === 'FAILED') failed++;
      if (r.gpu_ms != null) metered++;
      sum += ms;
      const day = r.created_at.toISOString().slice(0, 10);
      for (const [map, key] of [
        [byDay, day],
        [byRetailer, r.retailer_id],
      ] as const) {
        const e = map.get(key) ?? { jobs: 0, gpu_ms_sum: 0 };
        e.jobs++;
        e.gpu_ms_sum += ms;
        map.set(key, e);
      }
    }

    const top = [...byRetailer.entries()]
      .sort((a, b) => b[1].gpu_ms_sum - a[1].gpu_ms_sum)
      .slice(0, 20);
    const names = top.length
      ? await prisma.retailer.findMany({
          where: { id: { in: top.map(([id]) => id) } },
          select: { id: true, shop_name: true },
        })
      : [];
    const nameOf = new Map(names.map((n) => [n.id, n.shop_name]));

    return {
      data: {
        totals: {
          jobs: rows.length,
          completed,
          failed,
          gpu_ms_sum: sum,
          gpu_ms_avg: metered ? Math.round(sum / metered) : null,
        },
        by_day: [...byDay.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([day, v]) => ({ day, ...v })),
        by_retailer: top.map(([retailer_id, v]) => ({
          retailer_id,
          shop_name: nameOf.get(retailer_id) ?? retailer_id,
          ...v,
        })),
      },
    };
  });
};
