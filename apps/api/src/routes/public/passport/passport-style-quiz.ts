// PATCH /passport/style-quiz — F-045 My Style T8 (closes F-039 §3.1). The quiz used to
// write localStorage only. The web sends the labels it shows; the mapping to columns lives
// in @kanchuki/shared (mapStyleQuizAnswers) so it cannot drift from the UI.
import { prisma } from '@kanchuki/db';
import { DEFAULT_COLOR_FAMILIES, mapStyleQuizAnswers } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getActiveColorFamilies } from '../../../lib/color-families.js';
import { getPassportSession } from './passport-helpers.js';

const answers = z.array(z.string().trim().min(1).max(40)).max(12);
const StyleQuizSchema = z
  .object({
    occasion: answers.optional(),
    region: answers.optional(),
    budget: answers.optional(),
    fabric: answers.optional(),
    color: answers.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Send at least one answer');

export const passportStyleQuizRoutes: FastifyPluginAsync = async (server) => {
  server.patch('/style-quiz', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'Passport session required' } });
    }

    const body = StyleQuizSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send({ error: { code: 'INVALID_BODY', message: 'Invalid style quiz answers' } });
    }

    // A failed lookup must not lose the shopper's answers: the built-in families are the
    // same table the DB was seeded from (parity-tested), so colours still map.
    const families = await getActiveColorFamilies().catch(() => DEFAULT_COLOR_FAMILIES);
    const columns = mapStyleQuizAnswers(body.data, families);

    await prisma.customerAccount.update({
      where: { id: session.customer_account_id },
      data: columns,
    });
    return reply.status(200).send({ ok: true, saved: columns });
  });
};
