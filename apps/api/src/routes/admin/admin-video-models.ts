// F-034 T6: AI promo video models (video_models) and the one model each plan uses
// (plan_video_models). Super-Admin only ('video-models' in admin-access.ts): it decides
// what the platform pays Fal per clip.
//
// No DELETE anywhere: kanchuki_app has no DELETE grant on either table (migration 166,
// RC-049/RC-162). Retire a model with enabled = false; a plan whose model is disabled
// has no promo video (videoModelForPlan() requires enabled).
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const PLANS = ['STARTER', 'GROWTH', 'PRO'] as const;

const num = (d: unknown) => (d == null ? null : Number(d));

export const adminVideoModelsRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/video-models ─────────────────────────────────────
  // USD prices only; the page shows a ₹ estimate at BENCH_USD_TO_INR.
  server.get('/video-models', async () => {
    const [models, picks] = await Promise.all([
      prisma.videoModel.findMany({ orderBy: { model_key: 'asc' } }),
      prisma.planVideoModel.findMany(),
    ]);
    const plans = Object.fromEntries(PLANS.map((p) => [p, null as string | null]));
    for (const r of picks) plans[r.plan] = r.model_key;
    return {
      data: {
        models: models.map((m) => ({
          model_key: m.model_key,
          label: m.label,
          endpoint: m.endpoint,
          notes: m.notes,
          enabled: m.enabled,
          removal_date: m.removal_date,
          price_usd_per_second: num(m.price_usd_per_second),
          price_usd_per_million_tokens: num(m.price_usd_per_million_tokens),
        })),
        plans,
      },
    };
  });

  // ─── PATCH /admin/video-models/:key ──────────────────────────────
  server.patch('/video-models/:key', async (request) => {
    const { key } = z.object({ key: z.string().min(1) }).parse(request.params);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body ?? {});
    const existing = await prisma.videoModel.findUnique({ where: { model_key: key } });
    if (!existing) throw notFound('Video model');
    const row = await prisma.videoModel.update({ where: { model_key: key }, data: { enabled } });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'VideoModel',
        resource_id: key,
        metadata: { before: { enabled: existing.enabled }, after: { enabled } },
        ip_address: request.ip,
      },
    });
    return { data: { model_key: row.model_key, enabled: row.enabled } };
  });

  // ─── PUT /admin/video-models/plans/:plan ─────────────────────────
  // A disabled model may be picked: the plan is set up before the model goes live.
  server.put('/video-models/plans/:plan', async (request) => {
    const { plan } = z.object({ plan: z.enum(PLANS) }).parse(request.params);
    const { model_key } = z.object({ model_key: z.string().min(1) }).parse(request.body ?? {});
    const model = await prisma.videoModel.findUnique({ where: { model_key } });
    if (!model) throw notFound('Video model');
    const before = await prisma.planVideoModel.findUnique({ where: { plan } });
    await prisma.planVideoModel.upsert({
      where: { plan },
      create: { plan, model_key },
      update: { model_key },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'PlanVideoModel',
        resource_id: plan,
        metadata: { before: { model_key: before?.model_key ?? null }, after: { model_key } },
        ip_address: request.ip,
      },
    });
    return { data: { plan, model_key } };
  });
};
