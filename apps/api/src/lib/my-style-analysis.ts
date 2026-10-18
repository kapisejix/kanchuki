// F-045 PR-6 — My Style analysis job state.
//
// There is deliberately no DB table for this (spec §4): a job lives in Redis for 15 minutes
// and holds only the DERIVED profile (three enums) — never the photo, which stays in
// lib/tryon-photo-store.ts (process memory) and never crosses Redis.
//
// Two keys:
//   mystyle:job:{jobId}        JSON {account_id,status,profile?,reason?}   TTL 15 min
//   mystyle:inflight:{account} = jobId (SET NX)                            TTL 3 min
// The lock is the double-submit guard (RC-015) and what stops a shopper spending quota in
// parallel — quota is only incremented when a job succeeds, so without it N concurrent
// requests would all pass the pre-check. Its TTL is a backstop for a job that died.
//
// Own short-fail client, fail CLOSED: unlike the post-idempotency marker, if Redis is down
// a photo analysis must not start (nothing could report its result), so these throw and
// the route answers 503 — never a fake success (RC-060). Under VITEST an in-memory map
// stands in (same convention as the sibling libs) and hands back copies (RC-037).
import type { GarmentDescriptor, MyStyleProfile } from '@kanchuki/shared';
import { Redis } from 'ioredis';

export type AnalysisStatus = 'processing' | 'ready' | 'failed' | 'cancelled';

export interface AnalysisState {
  account_id: string;
  status: AnalysisStatus;
  profile?: MyStyleProfile;
  /** Find-similar (PR-9): a description of a garment, not of the shopper. */
  garment?: GarmentDescriptor;
  /** A code, not prose: an enum reason from the model or read_failed / expired. */
  reason?: string;
}

export type AnalysisOutcome =
  | { status: 'ready'; profile: MyStyleProfile }
  | { status: 'ready'; garment: GarmentDescriptor }
  | { status: 'failed'; reason: string };

const JOB_TTL_SEC = 15 * 60;
const LOCK_TTL_SEC = 3 * 60;
const jobKey = (id: string) => `mystyle:job:${id}`;
const lockKey = (accountId: string) => `mystyle:inflight:${accountId}`;

const useMemory = () => process.env.VITEST === 'true';
const memJobs = new Map<string, string>();
const memLocks = new Map<string, string>();

export function __resetMyStyleState(): void {
  memJobs.clear();
  memLocks.clear();
}

let client: Redis | null = null;
function getClient(): Redis {
  client ??= new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 10_000,
  });
  return client;
}

// Same ready-wait as the other short-fail clients: with the offline queue off, a command
// sent before the handshake rejects instantly, so wait for 'ready' first.
async function ready(): Promise<Redis> {
  const redis = getClient();
  if (redis.status === 'ready') return redis;
  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      redis.off('error', onError);
      resolve();
    };
    const onError = (err: Error) => {
      redis.off('ready', onReady);
      reject(err);
    };
    redis.once('ready', onReady);
    redis.once('error', onError);
  });
  return redis;
}

async function readJob(jobId: string): Promise<AnalysisState | null> {
  const raw = useMemory() ? (memJobs.get(jobId) ?? null) : await (await ready()).get(jobKey(jobId));
  return raw ? (JSON.parse(raw) as AnalysisState) : null;
}

async function writeJob(jobId: string, state: AnalysisState): Promise<void> {
  const raw = JSON.stringify(state);
  if (useMemory()) memJobs.set(jobId, raw);
  else await (await ready()).set(jobKey(jobId), raw, 'EX', JOB_TTL_SEC);
}

async function readLock(accountId: string): Promise<string | null> {
  return useMemory() ? (memLocks.get(accountId) ?? null) : (await ready()).get(lockKey(accountId));
}

async function dropLock(accountId: string, onlyIfJob?: string): Promise<void> {
  if (onlyIfJob && (await readLock(accountId)) !== onlyIfJob) return;
  if (useMemory()) memLocks.delete(accountId);
  else await (await ready()).del(lockKey(accountId));
}

/** Take the account's lock and create a `processing` job. 'busy' = one already runs. */
export async function startAnalysis(jobId: string, accountId: string): Promise<'started' | 'busy'> {
  if (useMemory()) {
    if (memLocks.has(accountId)) return 'busy';
    memLocks.set(accountId, jobId);
  } else {
    const got = await (await ready()).set(lockKey(accountId), jobId, 'EX', LOCK_TTL_SEC, 'NX');
    if (got !== 'OK') return 'busy';
  }
  try {
    await writeJob(jobId, { account_id: accountId, status: 'processing' });
  } catch (err) {
    await dropLock(accountId, jobId).catch(() => {});
    throw err;
  }
  return 'started';
}

export const getAnalysis = readJob;

/**
 * Finish a job — only if it is still `processing`. False means it was cancelled (the
 * shopper cleared their data mid-flight) or expired, and the caller must not publish its
 * result. Read-then-write is not atomic; the job re-checks after its DB write for exactly
 * that reason (jobs/my-style-analyze.ts), so the window is closed by compensation.
 */
export async function completeAnalysis(jobId: string, outcome: AnalysisOutcome): Promise<boolean> {
  const current = await readJob(jobId);
  if (!current || current.status !== 'processing') return false;
  await writeJob(jobId, { account_id: current.account_id, ...outcome });
  await dropLock(current.account_id, jobId);
  return true;
}

/** Mark the account's in-flight job cancelled and free the lock. No-op if none. */
export async function cancelInflightAnalysis(accountId: string): Promise<void> {
  const jobId = await readLock(accountId);
  if (!jobId) return;
  const current = await readJob(jobId);
  if (current?.status === 'processing') {
    await writeJob(jobId, { account_id: accountId, status: 'cancelled' });
  }
  await dropLock(accountId);
}
