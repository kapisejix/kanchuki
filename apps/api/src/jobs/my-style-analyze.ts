// F-045 PR-6 T14 — My Style photo analysis job (BullMQ MY_STYLE_ANALYZE queue).
//
//   POST /v1/public/my-style/analyze (multipart selfie) → 202 {job_id}
//   → the client polls GET …/analyze/:jobId until ready | failed | cancelled.
//
// The Claude Vision call happens here, never in the request handler (CLAUDE.md AI rule).
//
// The photo is a person. It arrives through lib/tryon-photo-store.ts (process memory,
// one-shot take) and NOT through the BullMQ payload, because Redis is persistent storage.
// This file imports no R2/upload helper and logs no bytes — the privacy guard test
// (lib/my-style-privacy-guard.test.ts) holds that line.
//
// Three rules the tests pin:
//   1. Quota is spent only when a profile was actually produced. An unusable photo or a
//      failed read costs the shopper nothing (rate limit + the per-account lock bound abuse).
//   2. A withdrawal wins. `profile/clear` cancels the in-flight job; this job checks before
//      its DB write and again after it, and re-nulls the columns if it lost the race, so a
//      cleared profile is never resurrected.
//   3. No fallback: a failed or unreadable model reply fails the job. It never produces a
//      guessed profile (RC-059).
//
// Like the other jobs it does not import from routes/ (jobs load in the whole boot graph).
import { analyzeGarmentImage, analyzeStyleImage } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { getActiveColorFamilies } from '../lib/color-families.js';
import { completeAnalysis, getAnalysis } from '../lib/my-style-analysis.js';
import { clearStyleProfile } from '../lib/my-style-consent.js';
import { incrementCustomerUsage } from '../lib/quota.js';
import { takeTryOnPhoto } from '../lib/tryon-photo-store.js';

export interface MyStyleAnalyzeJobData {
  job_id: string;
  customer_account_id: string;
  /** Absent = selfie, so a job queued before PR-9 deploys still runs. */
  mode?: 'selfie' | 'garment';
}

// Admin usage chart: one counter per UTC day, no customer id (migration 134). Best-effort -
// a chart gap must never fail a paid analysis that already ran.
async function recordDailyAnalysis(): Promise<void> {
  const day = new Date(new Date().toISOString().slice(0, 10));
  await prisma.styleAnalysisDaily
    .upsert({
      where: { day },
      create: { day, count: 1 },
      update: { count: { increment: 1 } },
    })
    .catch((err) => console.error('[my-style] failed to record daily count:', err));
}

// Marks the job failed and hands back the error to rethrow. Message only — never the
// buffer, and provider errors carry none. No auto-retry: a retry would have no photo left
// (it was taken at the top of the handler) and each attempt is a paid call.
async function failRead(job_id: string, err: unknown): Promise<Error> {
  console.error(
    `[my-style] job ${job_id} failed:`,
    err instanceof Error ? err.message : String(err),
  );
  await completeAnalysis(job_id, { status: 'failed', reason: 'read_failed' });
  return err instanceof Error ? err : new Error(String(err));
}

// Find similar (PR-9). Same rules as the selfie path: quota only when a descriptor was
// produced, no fallback on a bad reply. Unlike a selfie there is nothing to write to the
// account and nothing to re-null after a withdrawal — a garment description is not
// personal data, and it lives only in the 15-minute job state.
async function handleGarment(
  job_id: string,
  customer_account_id: string,
  photo: { buffer: Buffer; contentType: string },
): Promise<void> {
  let result: Awaited<ReturnType<typeof analyzeGarmentImage>>;
  try {
    const families = (await getActiveColorFamilies()).map((f) => f.name);
    result = await analyzeGarmentImage(photo.buffer, photo.contentType, families);
  } catch (err) {
    throw await failRead(job_id, err);
  }

  if (!result.usable) {
    await completeAnalysis(job_id, { status: 'failed', reason: result.reason });
    return;
  }

  await incrementCustomerUsage(customer_account_id, 'STYLE_ANALYSIS').catch((err) => {
    console.error(`[my-style] failed to record usage for ${customer_account_id}:`, err);
  });
  await recordDailyAnalysis();
  // False = cleared or expired meanwhile; the cost still counts, the result is dropped.
  await completeAnalysis(job_id, { status: 'ready', garment: result.garment });
}

export async function handleMyStyleAnalyze(data: MyStyleAnalyzeJobData): Promise<void> {
  const { job_id, customer_account_id } = data;

  // One-shot take: after this line the only copy is the local buffer.
  const photo = takeTryOnPhoto(job_id);

  const state = await getAnalysis(job_id);
  if (state?.status !== 'processing') return; // cleared or expired while queued: do nothing

  if (!photo || photo.buffer.length === 0) {
    await completeAnalysis(job_id, { status: 'failed', reason: 'expired' });
    return;
  }

  if (data.mode === 'garment') {
    await handleGarment(job_id, customer_account_id, photo);
    return;
  }

  let result: Awaited<ReturnType<typeof analyzeStyleImage>>;
  try {
    result = await analyzeStyleImage(photo.buffer, photo.contentType);
  } catch (err) {
    throw await failRead(job_id, err);
  }

  if (!result.usable) {
    await completeAnalysis(job_id, { status: 'failed', reason: result.reason });
    return;
  }

  // The model ran, so the cost is real whatever happens next. Counting it even when the
  // shopper cleared mid-flight stops clear-and-retry from being free analyses.
  await incrementCustomerUsage(customer_account_id, 'STYLE_ANALYSIS').catch((err) => {
    console.error(`[my-style] failed to record usage for ${customer_account_id}:`, err);
  });
  await recordDailyAnalysis();

  if ((await getAnalysis(job_id))?.status !== 'processing') return; // cleared mid-call

  const { undertone, depth, frame } = result.profile;
  await prisma.customerAccount.update({
    where: { id: customer_account_id },
    data: {
      skin_undertone: undertone,
      skin_depth: depth,
      body_frame: frame,
      style_profile_at: new Date(),
    },
  });

  // Lost the race to a withdrawal that landed between the check and the write: take the
  // write back.
  if (!(await completeAnalysis(job_id, { status: 'ready', profile: result.profile }))) {
    await clearStyleProfile(customer_account_id);
  }
}
