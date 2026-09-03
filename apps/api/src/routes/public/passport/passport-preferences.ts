// passport-preferences.ts — preference read/write + profiling opt-out events (split from apps/api/src/routes/public/passport.ts — body byte-identical)
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CURRENT_NOTICE_VERSION, getPassportSession } from './passport-helpers.js';

export const passportPreferencesRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /passport/preferences ────────────────────────────────
  // Returns the shopper's personalization preferences.
  server.get('/preferences', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'Passport session required' } });
    }

    const account = session.customer_account;

    return reply.status(200).send({
      profiling_enabled: account.profiling_enabled,
      pref_colors: account.pref_colors,
      pref_styles: account.pref_styles,
      pref_fabrics: account.pref_fabrics,
      budget_min: account.budget_min,
      budget_max: account.budget_max,
    });
  });
  // ─── PUT /passport/preferences ────────────────────────────────
  // Update personalization preferences. Setting profiling_enabled to
  // false freezes the preference vector and stops behavioral writes.
  const PreferencesSchema = z.object({
    profiling_enabled: z.boolean().optional(),
    pref_colors: z.array(z.string()).optional(),
    pref_styles: z.array(z.string()).optional(),
    pref_fabrics: z.array(z.string()).optional(),
    budget_min: z.number().int().nonnegative().optional(),
    budget_max: z.number().int().nonnegative().optional(),
  });

  server.put('/preferences', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'Passport session required' } });
    }

    const body = PreferencesSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send({ error: { code: 'INVALID_BODY', message: 'Invalid preferences' } });
    }

    const accountId = session.customer_account_id;
    const current = session.customer_account;
    const updates = body.data;

    // If profiling is being disabled, freeze the vector (stop updating it)
    // and record the event. The vector naturally becomes stale as no new
    // behavioral writes are recorded while profiling_enabled is false.
    if (updates.profiling_enabled === false && current.profiling_enabled === true) {
      // Record the event
      await prisma.consentEvent.create({
        data: {
          customer_account_id: accountId,
          kind: 'PROFILING_DISABLED',
          notice_version: CURRENT_NOTICE_VERSION,
        },
      });
    }

    // If profiling is being re-enabled, record the event
    if (updates.profiling_enabled === true && current.profiling_enabled === false) {
      await prisma.consentEvent.create({
        data: {
          customer_account_id: accountId,
          kind: 'PROFILING_ENABLED',
          notice_version: CURRENT_NOTICE_VERSION,
        },
      });
    }

    // Update the account
    await prisma.customerAccount.update({
      where: { id: accountId },
      data: updates,
    });

    return reply.status(200).send({ ok: true });
  });
};
