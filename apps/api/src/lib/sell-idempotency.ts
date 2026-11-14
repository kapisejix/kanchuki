// sell-idempotency.ts — fast first check for POST /v1/products/sell (F-047).
//
// `product_sales` UNIQUE (retailer_id, bill_id, product_id, size) is the record of truth. This
// Redis key only lets a double-tap or an offline replay be answered before touching Postgres.
// A Redis error means "skip the fast check" (isNew: true, degraded), never "allow a second
// sale": the unique key still blocks the double decrement.
//
// Own short-fail client (NOT getRedis()/BullMQ, whose maxRetriesPerRequest: null would retry
// forever on a down connection). Same VITEST bypass as social-post-idempotency / msg91-otp.

import { Redis } from 'ioredis';
import { awaitRedisReady } from './msg91-otp.js';

const KEY = (retailerId: string, billId: string) => `sell:${retailerId}:${billId}`;
const TTL_SEC = 24 * 60 * 60;

let client: Redis | null = null;

function getClient(): Redis {
  client ??= new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 10_000,
  });
  return client;
}

function redisAvailable(): boolean {
  return process.env.VITEST !== 'true';
}

export interface SellClaim {
  /** true = first sight of this bill (or Redis unusable): the caller proceeds. */
  isNew: boolean;
  degradedReason: string | null;
}

export async function claimSellBill(retailerId: string, billId: string): Promise<SellClaim> {
  if (!redisAvailable()) return { isNew: true, degradedReason: null };
  const redis = getClient();
  try {
    await awaitRedisReady(redis);
    const ok = await redis.set(KEY(retailerId, billId), '1', 'EX', TTL_SEC, 'NX');
    return { isNew: ok === 'OK', degradedReason: null };
  } catch {
    return { isNew: true, degradedReason: 'redis-unavailable' };
  }
}

/** Free the key so the retailer can retry a bill that sold nothing. Best effort. */
export async function releaseSellBill(retailerId: string, billId: string): Promise<void> {
  if (!redisAvailable()) return;
  const redis = getClient();
  try {
    await awaitRedisReady(redis);
    await redis.del(KEY(retailerId, billId));
  } catch {
    // The key expires in 24 h and the DB unique key still guards the retry.
  }
}
