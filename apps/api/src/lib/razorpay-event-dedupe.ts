// razorpay-event-dedupe.ts — replay guard for POST /billing/webhook (bug hunt #7).
//
// Razorpay redelivers a failed webhook for up to 24 h with the ORIGINAL created_at, so a
// short age window dropped real retries. Instead: one Redis key per `x-razorpay-event-id`
// (same id on every retry). The first delivery claims it; a replay of a processed event is
// answered 200 without touching the DB. A 5xx releases the key so Razorpay's retry runs.
// Redis error = process anyway (degraded): every handler is idempotent on its own rows.
//
// Own short-fail client, same pattern + VITEST bypass as sell-idempotency.ts.

import { Redis } from 'ioredis';
import { awaitRedisReady } from './msg91-otp.js';

/** Longer than Razorpay's 24 h retry window; also the max accepted event age. */
export const RAZORPAY_EVENT_TTL_SEC = 48 * 60 * 60;
const KEY = (eventId: string) => `rzp-evt:${eventId}`;

let client: Redis | null = null;

function getClient(): Redis {
  client ??= new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 10_000,
  });
  return client;
}

const redisAvailable = () => process.env.VITEST !== 'true';

/** true = first delivery (or Redis unusable): process it. false = already processed. */
export async function claimRazorpayEvent(eventId: string): Promise<boolean> {
  if (!redisAvailable()) return true;
  const redis = getClient();
  try {
    await awaitRedisReady(redis);
    return (await redis.set(KEY(eventId), '1', 'EX', RAZORPAY_EVENT_TTL_SEC, 'NX')) === 'OK';
  } catch {
    return true;
  }
}

/** Free the key after a failed delivery so the retry is processed. Best effort. */
export async function releaseRazorpayEvent(eventId: string): Promise<void> {
  if (!redisAvailable()) return;
  const redis = getClient();
  try {
    await awaitRedisReady(redis);
    await redis.del(KEY(eventId));
  } catch {
    // Worst case the retry is answered as a duplicate; the 5xx was already alerted.
  }
}
