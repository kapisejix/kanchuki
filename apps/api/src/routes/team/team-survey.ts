import { prisma } from '@kanchuki/db';
// Staff-only retailer discovery survey (apps/web/src/app/survey) — a field
// agent fills this in while standing in the retailer's shop, not the
// retailer themselves. Gated by teamAuthPreHandler (every /v1/team/* route
// except /login, see team-helpers.ts) instead of being public, so there's no
// spam surface to defend — an unauthenticated request never reaches here.
// Same reuse-AuditLog pattern as the old public version (no migration), but
// actor_id/actor_type now record which staff member submitted it.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { forbidden, validationError } from '../../plugins/error-handler.js';
import { teamAuthPreHandler } from './team-helpers.js';

const surveySchema = z.object({
  locale: z.enum(['en', 'hi', 'pa']).default('en'),
  storeName: z.string().trim().max(200).optional(),
  ownerName: z.string().trim().max(200).optional(),
  city: z.string().trim().max(200).optional(),
  years: z.string().trim().max(50).optional(),
  category: z.array(z.string().max(50)).max(20).optional(),
  categoryOther: z.string().trim().max(200).optional(),
  skuCount: z.string().trim().max(50).optional(),
  staffCount: z.string().trim().max(50).optional(),
  manualShowCount: z.string().trim().max(50).optional(),
  timePerCustomer: z.string().trim().max(50).optional(),
  purchaseRate: z.string().trim().max(50).optional(),
  irritationLevel: z.string().trim().max(5).optional(),
  rateColorTrendAsk: z.string().trim().max(50).optional(),
  mobileCatalogValue: z.string().trim().max(50).optional(),
  staffWorkReduction: z.string().trim().max(50).optional(),
  onlineShoppingEffect: z.string().trim().max(5).optional(),
  whyNotOnline: z.array(z.string().max(50)).max(20).optional(),
  whyNotOnlineOther: z.string().trim().max(200).optional(),
  hasWebsite: z.string().trim().max(50).optional(),
  social: z.array(z.string().max(50)).max(20).optional(),
  whoPosts: z.string().trim().max(50).optional(),
  postFreq: z.string().trim().max(50).optional(),
  gmb: z.string().trim().max(50).optional(),
  gRating: z.string().trim().max(200).optional(),
  reviewHabit: z.string().trim().max(50).optional(),
  usesSoftware: z.string().trim().max(50).optional(),
  softwareName: z.string().trim().max(200).optional(),
  notifyMethod: z.array(z.string().max(50)).max(20).optional(),
  custRecord: z.string().trim().max(50).optional(),
  repeatPct: z.string().trim().max(50).optional(),
  shareMethod: z.string().trim().max(50).optional(),
  orderChannel: z.array(z.string().max(50)).max(20).optional(),
  festivalPromo: z.string().trim().max(50).optional(),
  pain_photoTime: z.string().trim().max(5).optional(),
  pain_visibility: z.string().trim().max(5).optional(),
  pain_whatsappChaos: z.string().trim().max(5).optional(),
  pain_noCrm: z.string().trim().max(5).optional(),
  pain_onlineCompetition: z.string().trim().max(5).optional(),
  biggestFrustration: z.string().trim().max(2000).optional(),
  wantedFeature: z.array(z.string().max(50)).max(20).optional(),
  trialInterest: z.string().trim().max(50).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  contactTime: z.string().trim().max(200).optional(),
});

export const teamSurveyRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', teamAuthPreHandler);

  // ─── POST /team/survey ───────────────────────────────────────────
  server.post('/survey', async (request, reply) => {
    const tm = request.teamMember;
    if (!tm) throw forbidden('Not authenticated');

    const body = surveySchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    await prisma.auditLog.create({
      data: {
        actor_id: tm.id,
        actor_type: 'team_member',
        action: 'SURVEY_SUBMIT',
        resource_type: 'RetailerSurvey',
        metadata: body.data,
        ip_address: request.ip,
      },
    });

    return reply.status(201).send({ data: { received: true } });
  });
};
