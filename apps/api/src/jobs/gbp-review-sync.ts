// Google Business Profile review sync + purge (cron every 6 h; registered WITHOUT
// repeat.limit — RC-062). docs/tasks/pending/google-business-profile-and-setup-checklist.md B6.
//
// Does nothing until the platform is ready (shared Google identity connected AND API
// approved). Platform-level failures (not approved / token revoked) stop the whole run and
// raise ONE Sentry event instead of one per retailer.

import { getPurgePrisma, prisma } from '@kanchuki/db';
import { Sentry } from '../instrument.js';
import { hasFeature } from '../lib/features.js';
import { FULL_WALK_PAGES, syncLink } from '../lib/gbp-sync.js';
import { GBP_KEYS, gbpApiApproved, getGbpSetting } from '../lib/google-business.js';

const GAP_MS = 200; // stay far under Google's ~300 requests/min once approved
const PLATFORM_CODES = new Set(['NOT_APPROVED', 'TOKEN_REVOKED', 'NOT_CONNECTED']);

export type GbpSyncSummary =
  | { skipped: 'not_ready' }
  | { links: number; synced: number; failed: number; stoppedEarly: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function handleGbpReviewSync(): Promise<GbpSyncSummary> {
  const [token, approved] = await Promise.all([
    getGbpSetting(GBP_KEYS.refreshToken),
    gbpApiApproved(),
  ]);
  if (!token || !approved) return { skipped: 'not_ready' };

  // NEEDS_ACCESS links are retried too: the retailer re-adding us as Manager self-heals them.
  const links = await prisma.gbpLink.findMany({
    where: { status: { in: ['LINKED', 'NEEDS_ACCESS'] }, gbp_account_id: { not: null } },
    orderBy: { last_synced_at: { sort: 'asc', nulls: 'first' } },
    take: 500,
    select: { id: true, retailer_id: true, gbp_account_id: true, gbp_location_id: true },
  });

  let synced = 0;
  let failed = 0;
  let stoppedEarly = false;
  for (const l of links) {
    if (!l.gbp_account_id || !l.gbp_location_id) continue;
    if (!(await hasFeature(l.retailer_id, 'GOOGLE_BUSINESS_PROFILE'))) continue;
    const res = await syncLink(
      {
        id: l.id,
        retailer_id: l.retailer_id,
        gbp_account_id: l.gbp_account_id,
        gbp_location_id: l.gbp_location_id,
      },
      { maxPages: FULL_WALK_PAGES },
    );
    if (res.ok) {
      synced += res.synced;
      if (res.complete) {
        await deleteVanishedReviews(l.id, l.gbp_account_id, l.gbp_location_id, res.complete.since);
      }
    } else {
      failed++;
      if (PLATFORM_CODES.has(res.code)) {
        Sentry.captureMessage(`gbp-review-sync stopped: ${res.code}`, 'warning');
        stoppedEarly = true;
        break;
      }
    }
    await sleep(GAP_MS);
  }

  await purgeOldReviews();
  return { links: links.length, synced, failed, stoppedEarly };
}

/**
 * A review deleted on Google is simply absent from a complete walk, so its row was not touched
 * (synced_at is stamped on every upsert) since the walk began. Conditioned on the link still
 * being the same one, so a link unlinked or re-pointed while Google answered loses nothing.
 */
async function deleteVanishedReviews(
  linkId: string,
  account: string,
  location: string,
  since: Date,
): Promise<void> {
  await getPurgePrisma().$executeRawUnsafe(
    `DELETE FROM gbp_reviews r USING gbp_links l
      WHERE r.link_id = l.id AND l.id = $1
        AND l.status IN ('LINKED', 'NEEDS_ACCESS')
        AND l.gbp_account_id = $2 AND l.gbp_location_id = $3
        AND r.synced_at < $4`,
    linkId,
    account,
    location,
    since,
  );
}

/**
 * Reviews of a link unlinked > 30 days ago, and rows left over from a previous location of
 * a re-linked retailer. DELETE is revoked for the app role (RC-049), so this uses the
 * kanchuki_purge client — which holds DELETE on gbp_reviews only (migration 141).
 */
export async function purgeOldReviews(): Promise<void> {
  const db = getPurgePrisma();
  await db.$executeRawUnsafe(
    `DELETE FROM gbp_reviews WHERE link_id IN (
       SELECT id FROM gbp_links WHERE status = 'UNLINKED' AND unlinked_at < now() - interval '30 days')`,
  );
  await db.$executeRawUnsafe(
    `DELETE FROM gbp_reviews r USING gbp_links l
      WHERE r.link_id = l.id AND l.status = 'LINKED' AND l.linked_at IS NOT NULL
        AND r.synced_at < l.linked_at`,
  );
}
