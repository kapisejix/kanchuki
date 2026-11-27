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
const BODY = PURPOSE_CONSENTS.MY_STYLE_BODY;

/**
 * Only the columns the selfie analysis job writes. The job's compensation (it lost a race to a
 * withdrawal, or its 15-min record expired) nulls just these, never the measurements or usual
 * size it did not write (RC-192). A withdrawal clears everything itself first.
 */
export const PHOTO_PROFILE_CLEARED = {
  skin_undertone: null,
  skin_depth: null,
  body_frame: null,
  style_profile_at: null,
  profile_source: null,
} as const;

/**
 * Every account column My Style derives or collects, nulled together: by "Clear my data" and by
 * account erasure (POST /passport/delete). One list, because erasure kept its own and missed the
 * photo-derived columns (RC-172).
 */
export const STYLE_PROFILE_CLEARED = {
  ...PHOTO_PROFILE_CLEARED,
  height_cm: null,
  bust_cm: null,
  waist_cm: null,
  hip_cm: null,
  measurements_at: null,
  usual_size: null,
} as const;

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
  // "Clear my data" also deletes the measurements (STYLE_PROFILE_CLEARED), so their consent ends too.
  if (await hasLiveBodyConsent(customerAccountId)) {
    await prisma.consentEvent.create({
      data: {
        customer_account_id: customerAccountId,
        kind: BODY.withdrawn_kind,
        notice_version: BODY.version,
        ...consentContext(ctx),
      },
    });
  }
  await clearStyleProfile(customerAccountId);
  await cancelInflightAnalysis(customerAccountId);
}

/** Null every My Style column (withdrawal / "Clear my data"). */
export async function clearStyleProfile(customerAccountId: string): Promise<void> {
  await prisma.customerAccount.update({
    where: { id: customerAccountId },
    data: { ...STYLE_PROFILE_CLEARED },
  });
}

// ─── Measurements consent (separate from the photo consent) ─────────────────────────────

export async function hasLiveBodyConsent(customerAccountId: string): Promise<boolean> {
  const latest = await prisma.consentEvent.findFirst({
    where: {
      customer_account_id: customerAccountId,
      kind: { in: [BODY.granted_kind, BODY.withdrawn_kind] },
    },
    orderBy: { created_at: 'desc' },
    select: { kind: true },
  });
  return latest?.kind === BODY.granted_kind;
}

/** Record a grant. The caller has already verified the CURRENT notice version was sent. */
export async function recordBodyConsent(
  customerAccountId: string,
  ctx: ConsentRequestContext,
): Promise<void> {
  await prisma.consentEvent.create({
    data: {
      customer_account_id: customerAccountId,
      kind: BODY.granted_kind,
      notice_version: BODY.version,
      ...consentContext(ctx),
    },
  });
}

const MEASUREMENTS_CLEARED = {
  height_cm: null,
  bust_cm: null,
  waist_cm: null,
  hip_cm: null,
  measurements_at: null,
  usual_size: null,
} as const;

/** Withdraw the measurements consent and delete the numbers (UPDATE = NULL, RC-049). */
export async function withdrawBodyConsent(
  customerAccountId: string,
  ctx: ConsentRequestContext,
): Promise<void> {
  await prisma.consentEvent.create({
    data: {
      customer_account_id: customerAccountId,
      kind: BODY.withdrawn_kind,
      notice_version: BODY.version,
      ...consentContext(ctx),
    },
  });
  await prisma.customerAccount.update({
    where: { id: customerAccountId },
    data: { ...MEASUREMENTS_CLEARED },
  });
}
