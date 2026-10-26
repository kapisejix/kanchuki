// Sync one retailer's Google reviews into gbp_reviews. Shared by the on-demand refresh
// (GET /me/google-business/reviews), the admin "link" action and the 6-hourly job.
// docs/tasks/pending/google-business-profile-and-setup-checklist.md B6.

import { prisma } from '@kanchuki/db';
import { GbpError, listReviews } from './google-business.js';

const MAX_PAGES = 5; // 250 newest-updated reviews per run; older ones were synced earlier
export const STALE_AFTER_MS = 15 * 60_000;

type LinkRef = { id: string; retailer_id: string; gbp_account_id: string; gbp_location_id: string };

export type SyncResult = { ok: true; synced: number } | { ok: false; code: GbpError['code'] };

export async function syncLink(link: LinkRef): Promise<SyncResult> {
  try {
    let synced = 0;
    let pageToken: string | undefined;
    let avg: number | null = null;
    let total: number | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await listReviews(link.gbp_account_id, link.gbp_location_id, pageToken);
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
      if (!res.nextPageToken) break;
      pageToken = res.nextPageToken;
    }
    await prisma.gbpLink.update({
      where: { id: link.id },
      data: {
        status: 'LINKED',
        last_synced_at: new Date(),
        last_error_code: null,
        ...(avg != null ? { avg_rating: avg } : {}),
        ...(total != null ? { review_count: total } : {}),
      },
    });
    return { ok: true, synced };
  } catch (err) {
    if (!(err instanceof GbpError)) throw err;
    await prisma.gbpLink.update({
      where: { id: link.id },
      data: {
        last_error_code: err.code,
        // Only a per-location refusal changes the retailer's state; platform-level
        // problems (not approved / token revoked / outage) must not flip every retailer.
        ...(err.code === 'NEEDS_ACCESS' ? { status: 'NEEDS_ACCESS' as const } : {}),
      },
    });
    return { ok: false, code: err.code };
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
