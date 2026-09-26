// F-039 Phase 2 — virtual try-on consent state + audit (task T6).
//
// Read and written for the same reason twice: the GENERATED image is a photo of
// a real person that the platform stores, so "was this person asked?" has to be
// answerable from the database, not from a checkbox the UI may or may not have
// rendered. See `docs/SECURITY.md` (Photo Retention Notice section) for the
// user-facing promise these two functions enforce.
//
// Two caller shapes, one function each because they differ in kind, not degree:
//
//   passport shopper  → a grant is REMEMBERED. `hasLiveTryOnConsent()` answers
//                       "may this shopper generate without being asked again?",
//                       and the grant/withdrawal pair is a `ConsentEvent` log,
//                       matching every other passport consent (PASSPORT_CREATED,
//                       STORE_CONSENT_GRANTED, …).
//
//   in-store walk-in  → there is no account to remember against
//                       (`try_on_jobs.customer_account_id` is null by design),
//                       so consent is taken per generation and lives on the job
//                       row. Nothing to read or write here; the route records
//                       it directly.
//
// WHY `ConsentEvent` CANNOT CARRY THE IN-STORE CASE: `customer_account_id` on
// that table is NOT NULL. That is a schema fact, not a preference — which is
// why the job row carries its own consent columns rather than the walk-in path
// going unrecorded.

import { createHash } from 'node:crypto';
import { deleteObject } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { PURPOSE_CONSENTS } from './notice-versions.js';

const TRY_ON = PURPOSE_CONSENTS.TRY_ON;

/** `ConsentEvent.kind` for a grant. Kept as a const so a typo is a build error
 *  at the one call site that matters, not a consent record nobody can query. */
export const TRY_ON_CONSENTED = TRY_ON.granted_kind;
export const TRY_ON_CONSENT_WITHDRAWN = TRY_ON.withdrawn_kind;

export interface ConsentRequestContext {
  /** The API's view of the caller's IP; hashed, never stored raw. */
  ip?: string | undefined;
  userAgent?: string | null | undefined;
}

function consentContext(ctx: ConsentRequestContext) {
  return {
    ip_hash: createHash('sha256')
      .update(ctx.ip || 'unknown')
      .digest('hex'),
    user_agent: ctx.userAgent || null,
  };
}

/**
 * Does this shopper have a grant that is still live?
 *
 * "Live" = the most recent try-on consent event of EITHER kind is a grant. So
 * a withdrawal revokes the grant without deleting it (the withdrawal is itself
 * the audit record of the change of mind), and re-consenting after a withdrawal
 * works by simply logging a newer grant. Reading only the latest event is what
 * makes the order of grant/withdraw/grant resolve correctly; counting grants
 * instead would let a stale grant outvote a later withdrawal.
 *
 * Deliberately reads `ConsentEvent` and not the job rows: a shopper who has
 * never completed a generation must still be able to consent before the first
 * one, and a job-scoped read would make consent impossible to have in advance.
 */
export async function hasLiveTryOnConsent(customerAccountId: string): Promise<boolean> {
  const latest = await prisma.consentEvent.findFirst({
    where: {
      customer_account_id: customerAccountId,
      kind: { in: [TRY_ON_CONSENTED, TRY_ON_CONSENT_WITHDRAWN] },
    },
    orderBy: { created_at: 'desc' },
    select: { kind: true },
  });
  return latest?.kind === TRY_ON_CONSENTED;
}

/**
 * Record a shopper's grant. Called only when the route has already verified the
 * client sent the CURRENT notice version — this function does not re-check it,
 * because the version it writes must be the one accepted, not the one current
 * at some later moment.
 */
export async function recordTryOnConsent(
  customerAccountId: string,
  retailerId: string,
  ctx: ConsentRequestContext,
): Promise<void> {
  await prisma.consentEvent.create({
    data: {
      customer_account_id: customerAccountId,
      retailer_id: retailerId,
      kind: TRY_ON_CONSENTED,
      notice_version: TRY_ON.version,
      ...consentContext(ctx),
    },
  });
}

export interface WithdrawResult {
  /** Stored images successfully deleted from R2. */
  images_deleted: number;
  /**
   * Stored images that could NOT be deleted (R2 error). Their `result_url` is
   * deliberately left in place so the object stays reachable and a retry can
   * still find it — clearing the key after a failed delete would orphan the
   * object permanently while making the row claim there was nothing to remove.
   * The row is still marked withdrawn either way, so nothing serves them.
   */
  images_failed: number;
}

/**
 * Withdraw a shopper's try-on consent: log it, then delete what it was for.
 *
 * Both halves are the promise. Logging the withdrawal without deleting the
 * images would leave stored photographs of the person on a `withdrawn` consent,
 * which is the failure this whole task exists to prevent — so the deletion is
 * not a separate cleanup job that might never run.
 *
 * The `ConsentEvent` is written FIRST and unconditionally: the person's change
 * of mind is a fact regardless of whether our storage delete then succeeds, and
 * blocking future generations must not depend on an R2 call.
 */
export async function withdrawTryOnConsent(
  customerAccountId: string,
  ctx: ConsentRequestContext,
): Promise<WithdrawResult> {
  await prisma.consentEvent.create({
    data: {
      customer_account_id: customerAccountId,
      kind: TRY_ON_CONSENT_WITHDRAWN,
      notice_version: TRY_ON.version,
      ...consentContext(ctx),
    },
  });

  const jobs = await prisma.tryOnJob.findMany({
    where: {
      customer_account_id: customerAccountId,
      consent_withdrawn_at: null,
      result_url: { not: null },
    },
    select: { id: true, result_url: true },
  });

  const result: WithdrawResult = { images_deleted: 0, images_failed: 0 };

  for (const job of jobs) {
    const key = job.result_url;
    if (!key) continue;

    try {
      await deleteObject(key);
    } catch (err) {
      // Leave the key alone: it is the only pointer to an object we still owe
      // this person a delete for. The trailing updateMany below marks the row
      // withdrawn, so the image stops being served regardless.
      result.images_failed += 1;
      console.error(`[try-on] withdrawal could not delete ${key} for job ${job.id}:`, err);
      continue;
    }
    result.images_deleted += 1;

    // Normally the key and the withdrawal land in one write, so a row can never
    // read as "withdrawn with no image" while the object still exists. If this
    // write fails the object is already gone, and the trailing updateMany still
    // sets withdrawn_at — which is what keeps the status route from presigning
    // a key that no longer resolves.
    await prisma.tryOnJob
      .update({
        where: { id: job.id },
        data: { result_url: null, consent_withdrawn_at: new Date() },
      })
      .catch((err) => {
        console.error(`[try-on] deleted ${key} but could not clear it on job ${job.id}:`, err);
      });
  }

  // Everything with nothing to delete — FAILED, still PENDING, or a job whose
  // key a failed delete above deliberately left — must still carry the
  // withdrawal, or "this person withdrew" would be unprovable from the row.
  await prisma.tryOnJob.updateMany({
    where: { customer_account_id: customerAccountId, consent_withdrawn_at: null },
    data: { consent_withdrawn_at: new Date() },
  });

  return result;
}
