// F-045 PR-6 — My Style photo consent + "clear my data".
//
// Same event-log shape as lib/tryon-consent.ts: the most recent event of EITHER kind
// decides whether a grant is live, so a withdrawal revokes without deleting the grant and
// re-consenting is just a newer grant.
//
// Unlike try-on there is no stored image to delete: the photo never persists. What a
// withdrawal removes is the DERIVED profile on the account (UPDATE … = NULL — DELETE is
// revoked platform-wide, RC-049) and any analysis still running.
import { prisma } from '@kanchuki/db';
import { cancelInflightAnalysis } from './my-style-analysis.js';
import { PURPOSE_CONSENTS } from './notice-versions.js';
import { type ConsentRequestContext, consentContext } from './tryon-consent.js';

const MY_STYLE = PURPOSE_CONSENTS.MY_STYLE;

export async function hasLiveMyStyleConsent(customerAccountId: string): Promise<boolean> {
  const latest = await prisma.consentEvent.findFirst({
    where: {
      customer_account_id: customerAccountId,
      kind: { in: [MY_STYLE.granted_kind, MY_STYLE.withdrawn_kind] },
    },
    orderBy: { created_at: 'desc' },
    select: { kind: true },
  });
  return latest?.kind === MY_STYLE.granted_kind;
}

/** Record a grant. The caller has already verified the CURRENT notice version was sent. */
export async function recordMyStyleConsent(
  customerAccountId: string,
  ctx: ConsentRequestContext,
): Promise<void> {
  await prisma.consentEvent.create({
    data: {
      customer_account_id: customerAccountId,
      kind: MY_STYLE.granted_kind,
      notice_version: MY_STYLE.version,
      ...consentContext(ctx),
    },
  });
}

/**
 * Withdraw consent and delete what it was for. Order matters:
 *   1. log the withdrawal — the change of mind is a fact whatever happens next;
 *   2. null the derived profile;
 *   3. cancel an in-flight analysis, so the job (which re-checks after its own write)
 *      loses and re-nulls instead of resurrecting the profile (RC-044 shape).
 */
export async function withdrawMyStyleConsent(
  customerAccountId: string,
  ctx: ConsentRequestContext,
): Promise<void> {
  await prisma.consentEvent.create({
    data: {
      customer_account_id: customerAccountId,
      kind: MY_STYLE.withdrawn_kind,
      notice_version: MY_STYLE.version,
      ...consentContext(ctx),
    },
  });
  await clearStyleProfile(customerAccountId);
  await cancelInflightAnalysis(customerAccountId);
}

/** Null the derived columns. Also the job's compensation when it loses to a withdrawal. */
export async function clearStyleProfile(customerAccountId: string): Promise<void> {
  await prisma.customerAccount.update({
    where: { id: customerAccountId },
    data: { skin_undertone: null, skin_depth: null, body_frame: null, style_profile_at: null },
  });
}
