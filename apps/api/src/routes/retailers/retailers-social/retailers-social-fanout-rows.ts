// retailers-social-fanout-rows.ts — the SocialPost write path for fan-out
// publishes.
//
// Split out of retailers-social-fanout.ts (2026-09-17) when that module crossed
// the 800-line route-size guard. Behaviour is unchanged: this is the same
// write/reconcile/retry logic and the same per-target result shape, moved so
// the route module reads as the publish flow instead of the flow plus its
// persistence plumbing.
//
// Everything here is about making ONE target's row land correctly: the
// idempotency reconcile (finding 1+2), the never-leak-a-raw-error policy
// (finding 4), and the one wire format shared by fresh publishes, Redis dedupe
// replays and P2002 reconciliations.
import { decryptSecret, prisma } from '@kanchuki/db';

// Finding 4 (task doc §12): never persist a raw non-Meta error message. Only
// MetaApiError carries a curated, user-safe message; DB/network errors
// (hostnames, connection detail, SQL fragments) must never leak into
// social_post.error_message or the results envelope.
export const GENERIC_PUBLISH_ERROR = 'Something went wrong while posting. Please try again.';

export function accountToken(encrypted: string): string {
  return decryptSecret(encrypted);
}

/** One history row → the per-target result shape (shared by fresh publishes,
 * Redis dedupe replays and P2002 reconciliations so every path speaks the
 * same wire format). */
export function toResultRow(
  p: {
    id: string;
    social_account_id: string;
    platform: string;
    status: string;
    external_post_url: string | null;
    error_message: string | null;
  },
  opts: { deduplicated: boolean },
): Record<string, unknown> {
  return {
    social_account_id: p.social_account_id,
    platform: p.platform,
    status: p.status,
    external_post_url: p.external_post_url,
    social_post_id: p.id,
    error_message: p.error_message,
    ...(opts.deduplicated ? { deduplicated: true } : {}),
  };
}

// The SocialPost create data we fan out — typed as Prisma's unchecked create
// input so the reconciling write accepts it without per-call casts.
export type PostRowDraft = Parameters<typeof prisma.socialPost.create>[0]['data'];

// A draft + the platform-side outcome fields attached after publish.
export type PostRowDraftWithOutcome = PostRowDraft & {
  external_post_id?: string | null;
  external_post_url?: string | null;
};

/**
 * Write one target's SocialPost row, reconciling a DB unique violation
 * (P2002 — a concurrent twin already owns this (retailer, account,
 * client_post_id) row). Reconcile instead of failing:
 *   • twin row is POSTED  → the post is already live (we or the twin put it
 *     there); surface it deduplicated, never write a second row.
 *   • twin row is FAILED + our attempt actually POSTED → the post IS live,
 *     so upgrade the row (history must not claim failure for a live post).
 *   • twin row is FAILED + we failed too → surface the existing FAILED row.
 * Returns { post, deduplicated } matching toResultRow's input shape.
 */
export async function createOrReconcilePost(
  draft: PostRowDraft,
): Promise<{ post: PostRowDraftWithOutcome & { id: string }; deduplicated: boolean }> {
  try {
    const created = await prisma.socialPost.create({ data: draft });
    return { post: created as PostRowDraftWithOutcome & { id: string }, deduplicated: false };
  } catch (err) {
    const isUniqueViolation =
      typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
    if (!isUniqueViolation) throw err;
    const existing = await prisma.socialPost.findFirst({
      where: {
        retailer_id: draft.retailer_id,
        social_account_id: draft.social_account_id,
        client_post_id: draft.client_post_id,
      },
    });
    if (!existing) throw err; // vanished between create + read — surface original
    if (existing.status === 'FAILED' && draft.status === 'POSTED') {
      // Our publish landed but the twin's row says FAILED — upgrade it so the
      // live post is recorded as POSTED with the platform ids we received.
      const upgraded = await prisma.socialPost.update({
        where: { id: existing.id },
        data: {
          status: 'POSTED',
          external_post_id: draft.external_post_id ?? null,
          external_post_url: draft.external_post_url ?? null,
          error_message: null,
        },
      });
      return {
        post: upgraded as PostRowDraftWithOutcome & { id: string },
        deduplicated: true,
      };
    }
    return {
      post: existing as PostRowDraftWithOutcome & { id: string },
      deduplicated: true,
    };
  }
}

/**
 * Bounded-retry wrapper for the POSTED row write only. Finding 4: once the
 * platform accepted the post (Phase 2 reached), the post IS live — a transient
 * DB blip must not drop the history row, and must never become a FAILED row.
 * P2002 reconciles inside createOrReconcilePost (returns the twin, no throw),
 * so a throw here is a genuine non-unique DB error — retry briefly, then
 * rethrow so the caller surfaces a transient 500 (the client retries with the
 * same client_post_id and idempotency replays — no double post).
 */
export async function createPostedRowWithRetry(
  draft: PostRowDraft,
  attempts = 3,
): Promise<{ post: PostRowDraftWithOutcome & { id: string }; deduplicated: boolean }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await createOrReconcilePost(draft);
    } catch (err) {
      lastErr = err;
      // P2002 never escapes createOrReconcilePost — this is a transient DB
      // error; back off briefly and try again before giving up.
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  throw lastErr;
}
