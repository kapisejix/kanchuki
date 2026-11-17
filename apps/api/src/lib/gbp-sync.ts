// Sync one retailer's Google reviews into gbp_reviews. Shared by the on-demand refresh
// (GET /me/google-business/reviews), the admin "link" action and the 6-hourly job.
// docs/tasks/pending/google-business-profile-and-setup-checklist.md B6.

import { prisma } from '@kanchuki/db';
import { GbpError, listReviews } from './google-business.js';

// On-demand and admin syncs read the 250 newest-updated reviews. The 6-hourly job passes
// FULL_WALK_PAGES: 2000 reviews, i.e. 40 calls per link per run. ponytail: a shop past 2000 is never
// "complete", so it keeps its stale rows; raise the number or go incremental if one ever appears.
const MAX_PAGES = 5;
export const FULL_WALK_PAGES = 40;
export const STALE_AFTER_MS = 15 * 60_000;

type LinkRef = { id: string; retailer_id: string; gbp_account_id: string; gbp_location_id: string };

/**
 * `complete` is present only when the whole list was read (no page left, link unchanged) AND the
 * number of reviews seen equals the total Google reports. It is the proof the caller needs before
 * deleting rows Google no longer returns: every row with synced_at before `since` was not in it.
 * Any doubt (no total, a mismatch, an empty glitch, the page cap) leaves it out, and nothing is culled.
 */
export type SyncResult =
  | { ok: true; synced: number; complete?: { since: Date } }
  | { ok: false; code: GbpError['code'] };

export async function syncLink(
  link: LinkRef,
  opts: { maxPages?: number } = {},
): Promise<SyncResult> {
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const since = new Date();
  // The link can be unlinked or re-pointed at another location while Google answers (seconds).
  // Every write below is conditioned on the link still being this exact one, so a stale sync
  // can neither revive an unlinked row nor file the old location's reviews under a new one.
  const stillThisLink = {
    id: link.id,
    status: { in: ['LINKED', 'NEEDS_ACCESS'] as ('LINKED' | 'NEEDS_ACCESS')[] },
    gbp_account_id: link.gbp_account_id,
    gbp_location_id: link.gbp_location_id,
  };
  try {
    let synced = 0;
    let pageToken: string | undefined;
    let avg: number | null = null;
    let total: number | null = null;
    let seen = 0;
    let finished = false;
    for (let page = 0; page < maxPages; page++) {
      const res = await listReviews(link.gbp_account_id, link.gbp_location_id, pageToken);
      if ((await prisma.gbpLink.count({ where: stillThisLink })) === 0) {
        return { ok: true, synced }; // link changed under us: nothing of this run is ours to write
      }
      avg = res.averageRating ?? avg;
      total = res.totalReviewCount ?? total;
      for (const r of res.reviews) {
        const data = {
          reviewer_name: r.reviewerName,
          star_rating: r.starRating,
          comment: r.comment,
          google_created_at: r.createdAt,
          google_updated_at: r.updatedAt,
          reply_comment: r.replyComment,
          reply_updated_at: r.replyUpdatedAt,
          synced_at: new Date(),
        };
        await prisma.gbpReview.upsert({
          where: { link_id_google_review_id: { link_id: link.id, google_review_id: r.reviewId } },
          create: {
            retailer_id: link.retailer_id,
            link_id: link.id,
            google_review_id: r.reviewId,
            ...data,
          },
          update: data,
        });
        synced++;
      }
      seen += res.reviews.length;
      if (!res.nextPageToken) {
        finished = true;
        break;
      }
      pageToken = res.nextPageToken;
    }
    await prisma.gbpLink.updateMany({
      where: stillThisLink,
      data: {
        status: 'LINKED',
        last_synced_at: new Date(),
        last_error_code: null,
        ...(avg != null ? { avg_rating: avg } : {}),
        ...(total != null ? { review_count: total } : {}),
      },
    });
    return finished && total != null && seen === total
      ? { ok: true, synced, complete: { since } }
      : { ok: true, synced };
  } catch (err) {
    if (!(err instanceof GbpError)) throw err;
    // Here the only resource asked about is this link's location, so a 404 means it is gone
    // or unreachable for our identity: the same retailer-visible state as a refusal.
    const code = err.code === 'NOT_FOUND' ? 'NEEDS_ACCESS' : err.code;
    await prisma.gbpLink.updateMany({
      where: stillThisLink,
      data: {
        last_error_code: code,
        // Only a per-location refusal changes the retailer's state; platform-level
        // problems (not approved / token revoked / outage) must not flip every retailer.
        ...(code === 'NEEDS_ACCESS' ? { status: 'NEEDS_ACCESS' as const } : {}),
      },
    });
    return { ok: false, code };
  }
}

/**
 * Claim-then-sync for the on-demand path: the CAS on last_synced_at means concurrent
 * requests start at most one sync per link per STALE_AFTER_MS.
 */
export async function syncIfStale(link: LinkRef): Promise<boolean> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const claimed = await prisma.gbpLink.updateMany({
    where: {
      id: link.id,
      status: 'LINKED',
      OR: [{ last_synced_at: null }, { last_synced_at: { lt: cutoff } }],
    },
    data: { last_synced_at: new Date() },
  });
  if (claimed.count === 0) return false;
  await syncLink(link);
  return true;
}
