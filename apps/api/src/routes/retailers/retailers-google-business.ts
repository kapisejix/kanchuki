// Google Business Profile reviews — retailer side
// (docs/tasks/pending/google-business-profile-and-setup-checklist.md B5).
//
// Owner-only: no staff/support allowlist lists /me/google-business/* (deny-by-default) and
// every handler also checks isRealOwner (RC-068). The retailer NEVER supplies a Google
// account/location id — those come from gbp_links, which only admin routes can set — and a
// review id is only ever resolved inside the caller's own link (tenant isolation).
// Nothing reports success without Google confirming it (RC-056/058/060).

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import { gbpAvailable } from '../../lib/gbp-availability.js';
import { syncIfStale } from '../../lib/gbp-sync.js';
import { GbpError, gbpManagerEmail, replyToReview } from '../../lib/google-business.js';
import { reserveQuota } from '../../lib/quota.js';
import { isRealOwner } from '../../plugins/auth.js';
import {
  AppError,
  featureUnavailable,
  forbidden,
  notFound,
  validationError,
} from '../../plugins/error-handler.js';
import { createRoutedTicket } from './retailers-tickets.js';

type State = 'UNAVAILABLE' | 'NOT_REQUESTED' | 'REQUESTED' | 'LINKED' | 'NEEDS_ACCESS';

const STEPS = [
  'Open business.google.com and select your shop.',
  'Go to Business Profile settings → People and access → Add.',
  'Add the Kanchuki email below with the role Manager.',
  'Our team will link your profile and your reviews will appear here.',
];

function requireOwner(request: FastifyRequest): void {
  if (!isRealOwner(request)) throw forbidden('Only the shop owner can do this');
}

/** Plan lacks the feature → 402; platform not ready (no connection / not approved) → 409. */
async function requireAvailable(retailerId: string): Promise<void> {
  if (!(await hasFeature(retailerId, 'GOOGLE_BUSINESS_PROFILE'))) {
    throw featureUnavailable('Google reviews');
  }
  if (!(await gbpAvailable(retailerId))) {
    throw new AppError('NOT_AVAILABLE', 'Google reviews are not available yet', 409);
  }
}

function gbpToAppError(err: GbpError): AppError {
  switch (err.code) {
    case 'NEEDS_ACCESS':
      return new AppError(
        'GOOGLE_ACCESS',
        'Kanchuki no longer has access to your Google profile. Add us again as Manager.',
        409,
      );
    case 'NOT_FOUND':
      return new AppError('REVIEW_NOT_FOUND', 'This review is no longer on Google.', 404);
    case 'NOT_APPROVED':
    case 'NOT_CONNECTED':
      return new AppError('NOT_AVAILABLE', 'Google reviews are not available yet', 409);
    case 'TOKEN_REVOKED':
      return new AppError('GOOGLE_UNAVAILABLE', 'Google reviews are paused. Try again later.', 503);
    default:
      return new AppError('GOOGLE_UNAVAILABLE', 'Google did not respond. Try again.', 502);
  }
}

const ReplyBody = z.object({ comment: z.string().trim().min(1).max(4096) });
const ReviewsQuery = z.object({ cursor: z.string().max(60).optional() });

export const retailersGoogleBusinessRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /me/google-business/status ─────────────────────────────
  server.get('/me/google-business/status', async (request) => {
    requireOwner(request);
    const available = await gbpAvailable(request.retailerId);
    if (!available) return { data: { state: 'UNAVAILABLE' as State } };

    const link = await prisma.gbpLink.findUnique({
      where: { retailer_id: request.retailerId },
      select: {
        status: true,
        location_title: true,
        last_synced_at: true,
        avg_rating: true,
        review_count: true,
        last_error_code: true,
      },
    });
    const state: State =
      !link || link.status === 'UNLINKED' ? 'NOT_REQUESTED' : (link.status as State);
    return {
      data: {
        state,
        ...(state === 'LINKED' || state === 'NEEDS_ACCESS'
          ? {
              location_title: link?.location_title ?? null,
              last_synced_at: link?.last_synced_at ?? null,
              avg_rating: link?.avg_rating ?? null,
              review_count: link?.review_count ?? null,
              // review_count stays null until a sync succeeds, so null + this flag = "not synced",
              // never "0 reviews". The raw code stays server-side.
              sync_failed: !!link?.last_error_code,
            }
          : {}),
        ...(state !== 'LINKED' ? { manager_email: await gbpManagerEmail(), steps: STEPS } : {}),
      },
    };
  });

  // ─── POST /me/google-business/request ───────────────────────────
  // Consent + "please link me". Creates the same routed "Ask Kanchuki team" ticket as the
  // dashboard checklist; the ticket grants NO access to anything.
  server.post('/me/google-business/request', async (request, reply) => {
    requireOwner(request);
    const body = z.object({ consent: z.literal(true) }).safeParse(request.body);
    if (!body.success) throw validationError('Please confirm you agree to let Kanchuki help');
    await requireAvailable(request.retailerId);

    const existing = await prisma.gbpLink.findUnique({
      where: { retailer_id: request.retailerId },
      select: { status: true },
    });
    if (existing?.status === 'LINKED') return { data: { state: 'LINKED' as State } };

    await prisma.gbpLink.upsert({
      where: { retailer_id: request.retailerId },
      create: { retailer_id: request.retailerId, status: 'REQUESTED', consented_at: new Date() },
      update: {
        status: 'REQUESTED',
        consented_at: new Date(),
        gbp_account_id: null,
        gbp_location_id: null,
        location_title: null,
        last_error_code: null,
      },
    });
    try {
      await createRoutedTicket(
        request.retailerId,
        {
          ticket_type: 'GROWTH_SETUP',
          requires_visit: false,
          setup_item: 'google_business',
          note: '[setup:google_business] Owner agreed to let the Kanchuki team link their Google Business Profile.',
        },
        request.log,
      );
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err; // an open request already exists
    }
    reply.code(201);
    return {
      data: { state: 'REQUESTED' as State, manager_email: await gbpManagerEmail(), steps: STEPS },
    };
  });

  // ─── GET /me/google-business/reviews ────────────────────────────
  server.get('/me/google-business/reviews', async (request) => {
    requireOwner(request);
    await requireAvailable(request.retailerId);
    const q = ReviewsQuery.safeParse(request.query);
    if (!q.success) throw validationError('Invalid cursor');

    const link = await prisma.gbpLink.findUnique({
      where: { retailer_id: request.retailerId },
      select: {
        id: true,
        retailer_id: true,
        status: true,
        gbp_account_id: true,
        gbp_location_id: true,
        linked_at: true,
        last_synced_at: true,
        avg_rating: true,
        review_count: true,
        last_error_code: true,
      },
    });
    if (!link || link.status !== 'LINKED' || !link.gbp_account_id || !link.gbp_location_id) {
      throw new AppError('NOT_LINKED', 'Your Google profile is not linked yet', 409);
    }

    // Refresh in the background when stale; never block the response on Google.
    void syncIfStale({
      id: link.id,
      retailer_id: link.retailer_id,
      gbp_account_id: link.gbp_account_id,
      gbp_location_id: link.gbp_location_id,
    }).catch((err) => request.log.error({ err }, 'gbp on-demand sync failed'));

    const PAGE = 20;
    const rows = await prisma.gbpReview.findMany({
      where: {
        retailer_id: request.retailerId,
        link_id: link.id,
        // rows synced before the current link was made belong to a previous location
        ...(link.linked_at ? { synced_at: { gte: link.linked_at } } : {}),
      },
      orderBy: [{ google_created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      ...(q.data.cursor ? { cursor: { id: q.data.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, PAGE);
    return {
      data: {
        summary: {
          avg_rating: link.avg_rating,
          review_count: link.review_count,
          last_synced_at: link.last_synced_at,
          sync_failed: !!link.last_error_code,
        },
        reviews: page.map((r) => ({
          id: r.id,
          reviewer_name: r.reviewer_name,
          star_rating: r.star_rating,
          comment: r.comment,
          created_at: r.google_created_at,
          reply: r.reply_comment
            ? { comment: r.reply_comment, updated_at: r.reply_updated_at }
            : null,
        })),
        next_cursor: rows.length > PAGE ? (page[page.length - 1]?.id ?? null) : null,
      },
    };
  });

  // ─── POST /me/google-business/reviews/:id/reply ─────────────────
  // Order matters: gate → own link → own review → quota → Google → ONLY THEN write + count.
  server.post<{ Params: { id: string } }>(
    '/me/google-business/reviews/:id/reply',
    async (request) => {
      requireOwner(request);
      const body = ReplyBody.safeParse(request.body);
      if (!body.success) throw validationError('Write a reply of 1 to 4096 characters');
      await requireAvailable(request.retailerId);

      const link = await prisma.gbpLink.findUnique({
        where: { retailer_id: request.retailerId },
        select: { id: true, status: true, gbp_account_id: true, gbp_location_id: true },
      });
      if (!link || link.status !== 'LINKED' || !link.gbp_account_id || !link.gbp_location_id) {
        throw new AppError('NOT_LINKED', 'Your Google profile is not linked yet', 409);
      }
      const review = await prisma.gbpReview.findFirst({
        where: { id: request.params.id, retailer_id: request.retailerId, link_id: link.id },
        select: { id: true, google_review_id: true },
      });
      if (!review) throw notFound('Review');

      const refund = await reserveQuota(request.retailerId, 'GBP_REVIEW_REPLY');

      let confirmed: { comment: string; updatedAt: Date };
      try {
        confirmed = await replyToReview(
          link.gbp_account_id,
          link.gbp_location_id,
          review.google_review_id,
          body.data.comment,
        );
      } catch (err) {
        await refund().catch(() => {}); // Google did not post a reply, so the slot is not spent
        if (!(err instanceof GbpError)) throw err;
        if (err.code === 'NEEDS_ACCESS') {
          await prisma.gbpLink.update({
            where: { id: link.id },
            data: { status: 'NEEDS_ACCESS', last_error_code: err.code },
          });
        }
        throw gbpToAppError(err);
      }

      // The reply is already live on Google. A failure below must not become a 500: the retailer
      // would retry and post it twice. The slot stays spent (it was used) and the next sync
      // copies the reply into our row.
      try {
        await prisma.gbpReview.update({
          where: { id: review.id },
          data: { reply_comment: confirmed.comment, reply_updated_at: confirmed.updatedAt },
        });
      } catch (err) {
        request.log.error({ err }, 'gbp reply posted on Google but not saved locally');
      }
      try {
        await prisma.auditLog.create({
          data: {
            actor_type: 'retailer',
            actor_id: request.retailerId,
            action: 'reply',
            resource_type: 'GbpReview',
            resource_id: review.id,
            metadata: { length: confirmed.comment.length },
            ip_address: request.ip,
          },
        });
      } catch (err) {
        request.log.error({ err }, 'gbp reply posted on Google but audit row failed');
      }
      return { data: { reply: { comment: confirmed.comment, updated_at: confirmed.updatedAt } } };
    },
  );

  // ─── DELETE /me/google-business/link ────────────────────────────
  // Ends it on our side and frees the Google location for relinking. The retailer must
  // also remove our Manager access in Google — the UI says so.
  server.delete('/me/google-business/link', async (request, reply) => {
    requireOwner(request);
    await prisma.gbpLink.updateMany({
      where: { retailer_id: request.retailerId, status: { not: 'UNLINKED' } },
      data: {
        status: 'UNLINKED',
        unlinked_at: new Date(),
        gbp_account_id: null,
        gbp_location_id: null,
        location_title: null,
      },
    });
    return reply.status(204).send();
  });
};
