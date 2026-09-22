// Retailer affiliate referral — code + shareable link (T3).
// Spec: docs/tasks/referral-program-retailer-affiliate.md §7 T3.
//
// Scope of T3 and nothing more: mint/fetch the retailer's OWN affiliate code and
// hand back the shareable link. Writing the `ReferralConversion` at signup is T4,
// the qualification cron is T5, payouts are T7, and the mobile screen is T8 —
// `apps/mobile` is under Play Console review, so nothing here reaches it.
//
// Registration note (RC-025): this module is wired in TWO places — the barrel
// (routes/retailers/index.ts) and the aggregator (routes/retailers.ts). The 404
// this repo shipped once before was a route that existed in one and not the
// other, so the test asserts the URL resolves rather than that the file exists.
//
// Deliberately NOT built here: any endpoint that resolves a typed code to a shop.
// `classifyReferralCode` (lib/referral-codes.ts) tells the caller which namespace
// a code is in without a lookup, and resolution — "this code belongs to Priya
// Cloth House" — returns only as part of T4's server-side signup write, where it
// costs something to ask. A public "is this code real?" endpoint would be a
// code-enumeration oracle: 456,976 candidates is a few minutes of requests, and
// the answer is a list of who is in the program.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { buildReferralLink, generateAffiliateCode } from '../../lib/referral-codes.js';

/** Mint attempts before giving up. A `code` collision needs all six chars to clash. */
const MINT_ATTEMPTS = 5;

interface ReferralCodeRow {
  code: string;
  is_active: boolean;
  created_at: Date;
}

/**
 * The row's public shape. `link` is built, never stored: it is derived from
 * WEB_URL and the code, so changing the base URL or the landing path does not
 * require rewriting every retailer's row and cannot go stale per-retailer.
 */
const present = (row: ReferralCodeRow) => ({
  code: row.code,
  link: buildReferralLink(row.code),
  is_active: row.is_active,
  created_at: row.created_at,
});

export const retailersReferralRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /retailers/me/referral-code ─────────────────────────────
  // Fetch-or-mint. Idempotent by design: an existing code is returned untouched.
  // Re-minting per request would break every link already shared, which is the
  // whole value of the code.
  server.get('/me/referral-code', async (request) => {
    const retailerId = request.retailerId;

    const existing = await prisma.referralCode.findUnique({
      where: { retailer_id: retailerId },
      select: { code: true, is_active: true, created_at: true },
    });
    if (existing) return { data: present(existing) };

    // First request for this retailer. Two concurrent firsts both reach here and
    // `retailer_id` is unique, so exactly one insert can win — the loser must
    // reconcile to the winner's code rather than minting a second one, or the
    // retailer would hold two codes and half their referrals would attribute to
    // the one they never shared. Same reconcile shape as the social composer's
    // createOrReconcilePost (2026-09-05, finding 1).
    let lastError: unknown;
    for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt += 1) {
      try {
        const created = await prisma.referralCode.create({
          data: { retailer_id: retailerId, code: generateAffiliateCode() },
          select: { code: true, is_active: true, created_at: true },
        });
        return { data: present(created) };
      } catch (err) {
        lastError = err;
        // Anything that is not a unique violation is a real failure — surface it
        // rather than retrying a broken request five times.
        if (!isUniqueViolation(err)) throw err;

        // Which unique index did we hit? A concurrent twin winning on
        // retailer_id is resolvable by re-reading; a `code` collision just needs
        // a fresh code, so fall through and loop.
        const winner = await prisma.referralCode.findUnique({
          where: { retailer_id: retailerId },
          select: { code: true, is_active: true, created_at: true },
        });
        if (winner) return { data: present(winner) };
      }
    }

    // Retries exhausted — rethrow the real Prisma error rather than a constant
    // string, so a genuine cause is not replaced by a guess (RC-003/RC-009).
    throw lastError;
  });
};

/** P2002 detection, matching routes/retailers/retailers-social/…-rows.ts. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
