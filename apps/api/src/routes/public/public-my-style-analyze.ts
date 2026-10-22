// F-045 PR-6 T15 — My Style photo analysis (docs/tasks/pending/my-style.md §3.3, §4, §6).
//
//   POST /my-style/analyze        multipart selfie → 202 {job_id}
//   GET  /my-style/analyze/:jobId poll → {status, profile? | reason?}
//   POST /my-style/profile/clear  null the derived profile + withdraw consent
//
// Separate plugin from the feed (public-my-style.ts) on purpose: this one drags in the
// queue, the AI package and multipart, and the feed's tests should not load them.
//
// The photo is a person and is NEVER persisted: it is read into a Buffer, stashed in
// process memory for the job (lib/tryon-photo-store.ts — not in the BullMQ payload, because
// Redis is storage too), and discarded. No R2, no DB, no log of bytes. The Claude Vision
// call is the job's (jobs/my-style-analyze.ts), never this handler's.
//
// Order of refusal, cheapest and least-revealing first: kill-switch 404 → 401 → bad query →
// no AI provider 503 (before anything is spent, RC-060) → consent → quota → photo → lock.
//
// Consent travels in the query string, not a multipart field: a field ordered after the
// file can read as absent, and absent consent must fail closed — which would turn a
// client's field ordering into a rejected request (same reasoning as try-on).
import multipart from '@fastify/multipart';
import { hasConfiguredVisionProvider } from '@kanchuki/ai';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { addMyStyleAnalyzeJob } from '../../jobs/index.js';
import { CUSTOMER_STYLE_ANALYSIS } from '../../lib/features.js';
import { completeAnalysis, getAnalysis, startAnalysis } from '../../lib/my-style-analysis.js';
import {
  hasLiveMyStyleConsent,
  recordMyStyleConsent,
  withdrawMyStyleConsent,
} from '../../lib/my-style-consent.js';
import { isCurrentMyStyleConsent } from '../../lib/notice-versions.js';
import { checkCustomerQuota } from '../../lib/quota.js';
import { discardTryOnPhoto, putTryOnPhoto } from '../../lib/tryon-photo-store.js';
import { sniffImageType } from '../../lib/upload-guard.js';
import {
  AppError,
  notFound,
  serviceUnavailable,
  validationError,
} from '../../plugins/error-handler.js';
import { getPassportSession } from './passport/passport-helpers.js';

/** Phone JPEGs run 2–8 MB; over this Fastify answers 413. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const QuerySchema = z.object({
  consent_version: z.string().min(1).optional(),
  // 'garment' = find-similar (PR-9): the photo is of a garment, not of the shopper.
  mode: z.enum(['selfie', 'garment']).default('selfie'),
});

function unauthorized(reply: FastifyReply) {
  return reply
    .status(401)
    .send({ error: { code: 'UNAUTHORIZED', message: 'Passport session required' } });
}

export const publicMyStyleAnalyzeRoutes: FastifyPluginAsync = async (server) => {
  await server.register(multipart, { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });

  const sessionFor = (request: FastifyRequest) => getPassportSession(request.headers.cookie || '');

  // ─── POST /analyze ────────────────────────────────────────────
  server.post(
    '/analyze',
    { config: { rateLimit: { max: 5, timeWindow: 60 * 1000 } } },
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      if (!CUSTOMER_STYLE_ANALYSIS) throw notFound('Not found');
      const session = await sessionFor(request);
      if (!session) return unauthorized(reply);
      const accountId = session.customer_account_id;

      const query = QuerySchema.safeParse(request.query);
      if (!query.success) throw validationError('Invalid request.', 'consent_version');

      // Refuse before spending anything if the AI cannot run at all (RC-060).
      if (!(await hasConfiguredVisionProvider())) {
        throw serviceUnavailable('Style analysis is not available right now. Please try later.');
      }

      // Consent — server-side, because a client can always call the API directly.
      const remembered = await hasLiveMyStyleConsent(accountId);
      if (!remembered && !isCurrentMyStyleConsent(query.data.consent_version)) {
        throw validationError(
          'Please read and accept how your photo is used before continuing.',
          'consent_version',
        );
      }
      if (!remembered) {
        await recordMyStyleConsent(accountId, {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        });
      }

      // Quota is spent by the job on success; the lock below stops parallel spend.
      await checkCustomerQuota(accountId, 'STYLE_ANALYSIS');

      if (!request.isMultipart()) {
        throw validationError('Expected a multipart form with one photo.', 'photo');
      }
      const file = await request.file();
      if (!file) throw validationError('A photo is required.', 'photo');
      const buffer = await file.toBuffer(); // throws 413 past MAX_PHOTO_BYTES
      if (buffer.length === 0) throw validationError('The submitted photo was empty.', 'photo');
      const contentType = sniffImageType(buffer);
      if (!contentType) {
        throw validationError('Only JPEG, PNG or WebP photos are supported.', 'photo');
      }

      const jobId = `mystyle_${createId()}`;
      let started: 'started' | 'busy';
      try {
        started = await startAnalysis(jobId, accountId);
      } catch {
        throw serviceUnavailable('Style analysis is not available right now. Please try later.');
      }
      if (started === 'busy') {
        throw new AppError(
          'ANALYSIS_IN_PROGRESS',
          'Your last photo is still being read. Please wait a moment.',
          409,
        );
      }

      // In-process handoff; a full store means the server is saturated — fail this one.
      if (!putTryOnPhoto(jobId, buffer, contentType)) {
        await completeAnalysis(jobId, { status: 'failed', reason: 'busy' }).catch(() => {});
        throw serviceUnavailable('Busy right now. Please try again in a moment.');
      }

      try {
        await addMyStyleAnalyzeJob({
          job_id: jobId,
          customer_account_id: accountId,
          mode: query.data.mode,
        });
      } catch (err) {
        // Nothing will take the photo now — drop it rather than hold it for the TTL, and
        // free the shopper's lock so they can retry.
        discardTryOnPhoto(jobId);
        await completeAnalysis(jobId, { status: 'failed', reason: 'enqueue_failed' }).catch(
          () => {},
        );
        throw err;
      }

      return reply.status(202).send({ data: { job_id: jobId, status: 'processing' } });
    },
  );

  // ─── GET /analyze/:jobId ──────────────────────────────────────
  server.get('/analyze/:jobId', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    if (!CUSTOMER_STYLE_ANALYSIS) throw notFound('Not found');
    const session = await sessionFor(request);
    if (!session) return unauthorized(reply);

    const { jobId } = request.params as { jobId: string };
    let state: Awaited<ReturnType<typeof getAnalysis>>;
    try {
      state = await getAnalysis(jobId);
    } catch {
      throw serviceUnavailable('Style analysis is not available right now. Please try later.');
    }
    // Same 404 for "not yours" and "does not exist": a job id is an opaque handle, and
    // answering differently would confirm other shoppers' ids.
    if (!state || state.account_id !== session.customer_account_id) throw notFound('Analysis');

    return {
      data: {
        status: state.status,
        ...(state.profile ? { profile: state.profile } : {}),
        ...(state.garment ? { garment: state.garment } : {}),
        ...(state.reason ? { reason: state.reason } : {}),
      },
    };
  });

  // ─── POST /profile/clear ──────────────────────────────────────
  // Deliberately NOT behind the kill-switch: switching analysis off must never stop
  // anyone deleting what we derived from their photo.
  server.post('/profile/clear', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const session = await sessionFor(request);
    if (!session) return unauthorized(reply);

    await withdrawMyStyleConsent(session.customer_account_id, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    // 200 with a body, never 204: the web proxy cannot rebuild a null-body status (RC-045).
    return { data: { ok: true } };
  });
};
