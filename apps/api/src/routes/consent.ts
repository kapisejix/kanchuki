import { deleteObject } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validationError } from '../plugins/error-handler.js';

// ─── Schemas ─────────────────────────────────────────────────

const RevokeConsentSchema = z.object({
  token: z.string().min(1, 'Revocation token is required'),
});

// ─── Routes ──────────────────────────────────────────────────

export const consentRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /v1/consent/revoke ────────────────────────────────────
  // Customer-facing endpoint to withdraw training-data consent and delete
  // all retained photos. No auth required — the revocation_token itself is
  // the proof of ownership (returned to the customer via the try-on result
  // screen, see docs/SECURITY.md §3b).
  //
  // This endpoint is intentionally not behind the authPlugin — customers
  // don't have accounts. The token is a random, unguessable cuid2 string
  // that only the customer who opted in would have access to.
  //
  // Tight per-route rate limit: 5 requests/min per IP to prevent brute-force
  // token guessing, tighter than the global 200/min.
  server.post(
    '/revoke',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const body = RevokeConsentSchema.safeParse(request.body);
      if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

      const { token } = body.data;

      // Look up the consent record by revocation token
      const consent = await prisma.trainingPhotoConsent.findUnique({
        where: { revocation_token: token },
      });

      if (!consent) {
        // Use a vague error message to avoid leaking whether a token is valid
        throw validationError('Invalid or expired revocation token');
      }

      // Delete the three R2 objects (best-effort — some may already be cleaned
      // up by the 180-day retention cron, which runs first).
      const keysToDelete = [
        consent.customer_photo_r2_key,
        consent.garment_photo_r2_key,
        ...(consent.result_r2_key ? [consent.result_r2_key] : []),
      ];

      const r2Results = await Promise.allSettled(keysToDelete.map((key) => deleteObject(key)));

      // Log any R2 deletion failures but don't fail the request — the DB row
      // deletion is the authoritative record, and orphaned R2 objects will be
      // caught by the 180-day retention cron.
      for (let i = 0; i < r2Results.length; i++) {
        const result = r2Results[i];
        if (result && result.status === 'rejected') {
          console.error(
            `[consent] Failed to delete training R2 object ${keysToDelete[i]}: ${String(result.reason)}`,
          );
        }
      }

      // Delete the consent row from the database
      await prisma.trainingPhotoConsent.delete({
        where: { id: consent.id },
      });

      return reply.status(200).send({
        data: {
          message:
            'Your training-data consent has been revoked and all retained photos have been deleted.',
        },
      });
    },
  );
};
