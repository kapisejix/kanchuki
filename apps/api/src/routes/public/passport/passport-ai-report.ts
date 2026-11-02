// passport-ai-report.ts — POST /passport/ai-report: a visitor flags AI-generated content
// (Google Play AI-Generated Content policy). Identity is the passport session when there is
// one, never the body; anonymous reports are allowed because AI Stylist has no sign-in.
// Text only — no image is accepted or stored.
import { createHash } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getPassportSession, hashSessionId, passportCookieId } from './passport-helpers.js';

// Feature names the web screens send. A closed list so a caller cannot file reports
// under an arbitrary label in the admin queue.
export const AI_REPORT_FEATURES = [
  'My Style selfie analysis',
  'My Style find similar',
  'My Style complete the look',
  'AI Stylist',
  'Virtual try-on',
] as const;

const BodySchema = z.object({
  feature: z.enum(AI_REPORT_FEATURES),
  content_ref: z.string().trim().max(200).optional(),
  description: z.string().trim().min(10).max(2000),
});

const ACCOUNT_DAILY_CAP = 20;
// Anonymous reports share one bucket (the web proxy forwards no client IP, RC-084), so cap
// the whole class per hour rather than pretend to a per-visitor limit.
const ANON_HOURLY_CAP = 100;

// Key the limit on the session only when the cookie maps to a live one. An unchecked cookie
// value is attacker-chosen, so every fake value would mint its own bucket and the limit would
// never apply. Anything unverifiable falls back to request.ip — which, until the proxy
// forwards a trusted client IP (RC-084), is one shared bucket for all anonymous traffic.
async function limitKey(request: FastifyRequest): Promise<string> {
  const sid = passportCookieId(request.headers.cookie ?? '');
  if (sid) {
    try {
      const row = await prisma.passportSession.findUnique({
        where: { id: hashSessionId(sid) },
        select: { id: true, revoked_at: true, expires_at: true },
      });
      if (row && !row.revoked_at && row.expires_at > new Date()) {
        return `sess:${createHash('sha256').update(row.id).digest('hex')}`;
      }
    } catch {
      // DB hiccup: fall through to the IP key rather than fail the request.
    }
  }
  return `ip:${request.ip}`;
}

const LIMIT = { config: { rateLimit: { max: 10, timeWindow: 60 * 1000, keyGenerator: limitKey } } };

export const passportAiReportRoutes: FastifyPluginAsync = async (server) => {
  server.post('/ai-report', LIMIT, async (request, reply) => {
    const body = BodySchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send({ error: { code: 'INVALID_BODY', message: 'Describe the problem in a few words' } });
    }

    const session = await getPassportSession(request.headers.cookie || '');
    const accountId =
      session && !session.customer_account.deleted_at ? session.customer_account_id : null;

    const now = Date.now();
    const recent = await prisma.aiContentReport.count({
      where: accountId
        ? { customer_account_id: accountId, created_at: { gte: new Date(now - 24 * 3_600_000) } }
        : { customer_account_id: null, created_at: { gte: new Date(now - 3_600_000) } },
    });
    if (recent >= (accountId ? ACCOUNT_DAILY_CAP : ANON_HOURLY_CAP)) {
      return reply.status(429).send({
        error: { code: 'REPORT_LIMIT', message: 'Too many reports right now. Try again later.' },
      });
    }

    const row = await prisma.aiContentReport.create({
      data: {
        customer_account_id: accountId,
        feature: body.data.feature,
        content_ref: body.data.content_ref || null,
        description: body.data.description,
      },
      select: { id: true },
    });
    return reply.status(201).send({ data: { id: row.id } });
  });
};
