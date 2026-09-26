// passport-tryon.ts — virtual try-on consent state + withdrawal (F-040 T6).
//
// The generated try-on image is a photo of a real person that the platform
// stores, so the shopper who consented has to be able to see that consent and
// take it back. "Withdrawal as easy as granting" is the DPDP shape, and it is
// the reason this is a passport route rather than something buried in a
// settings screen: it is the shopper's own data and their own session.
//
//   GET  /passport/try-on/consent   → { consented }        what the UI shows
//   POST /passport/try-on/withdraw  → { ok, images_deleted, images_failed }
//
// Granting does NOT get its own endpoint on purpose. A grant is given while
// looking at the actual try-on screen, so the try-on request itself carries it
// (`?consent_version=` on POST /v1/products/:id/try-on) — a separate "grant"
// call would be a second thing for the UI to remember to do, and the failure
// mode of forgetting it is a consent screen that records nothing.
//
// Withdrawal is deliberately NOT implemented as "delete the jobs". The job row
// is also the quota counter and the audit trail, so it stays; what goes is the
// stored IMAGE (R2 object deleted, `result_url` cleared) plus a `ConsentEvent`
// recording the change of mind. See lib/tryon-consent.ts.

import type { FastifyPluginAsync } from 'fastify';
import { PURPOSE_CONSENTS } from '../../../lib/notice-versions.js';
import { hasLiveTryOnConsent, withdrawTryOnConsent } from '../../../lib/tryon-consent.js';
import { getPassportSession } from './passport-helpers.js';

export const passportTryOnRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /passport/try-on/consent ──────────────────────────────
  // Whether a live grant exists, and which notice version it is against, so
  // the try-on screen can show "you can withdraw this" only when that is true
  // and can re-ask when the wording has moved on.
  server.get('/try-on/consent', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }

    const consented = await hasLiveTryOnConsent(session.customer_account_id);
    return reply.status(200).send({
      consented,
      notice_version: PURPOSE_CONSENTS.TRY_ON.version,
    });
  });

  // ─── POST /passport/try-on/withdraw ────────────────────────────
  server.post('/try-on/withdraw', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }

    const result = await withdrawTryOnConsent(session.customer_account_id, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    // The counts are returned rather than swallowed: a caller is entitled to
    // know that N images could not be deleted, because that is a promise we did
    // not keep and the honest answer is "withdrawn, but N are still queued for
    // deletion" — not a bare `ok: true`. (`images_failed` non-zero is logged
    // server-side with the keys, so it is actionable without the client.)
    return reply.status(200).send({
      ok: true,
      images_deleted: result.images_deleted,
      images_failed: result.images_failed,
    });
  });
};
