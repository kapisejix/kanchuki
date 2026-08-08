// Single-flight, jittered Redis response cache for the public GET endpoints
// (the customer PWA hot path — a viral WhatsApp collection link can fan out to
// thousands of requests in seconds).
//
// Why a separate client instead of getRedis(): BullMQ requires
// maxRetriesPerRequest: null, which makes ioredis retry commands forever on a
// down connection — a hung cache lookup on the public hot path would be
// catastrophic. This cache owns a short-fail client instead: commands reject
// fast when Redis is down and the route degrades to a direct DB read. A cache
// must never fail a request.
//
// Stampede protection is two-layered:
//   1. Single-flight — only one request per key recomputes; the rest wait for
//      its result (bounded by lockWaitMs, then they compute themselves).
//   2. TTL jitter — each entry expires at base TTL + 0–50% random offset, so
//      keys written at the same instant don't all refetch at one boundary.
import { Redis } from 'ioredis';

// 60s base TTL is the invalidation strategy: product/collection/suspension
// changes from the retailer side appear on the storefront within a minute,
// without any cross-service cache-busting plumbing.
const BASE_TTL_SEC = 60;
const JITTER_FRACTION = 0.5; // 0–50% over the base TTL, per key at write time
const LOCK_TTL_MS = 5_000; // NX lock TTL — a crashed recomputer self-releases
const DEFAULT_LOCK_WAIT_MS = 2_500; // how long non-winners wait before computing
const DEFAULT_WAIT_SLEEP_MS = 25; // poll interval (jittered) while waiting

let cacheRedis: Redis | null = null;

function getCacheRedis(): Redis {
  cacheRedis ??= new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2_000,
    lazyConnect: true,
  });
  return cacheRedis;
}

/** Structural subset of ioredis used by the cache — injectable for tests. */
export interface PublicCacheRedis {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: 'EX' | 'PX',
    ttl: number,
    condition?: 'NX',
  ): Promise<'OK' | null>;
  del(key: string): Promise<number>;
}

/**
 * Namespaced cache key from the raw request URL. Query params are sorted so
 * `?page=2&category=A` and `?category=A&page=2` share one entry.
 */
export function normalizedPublicCacheKey(requestUrl: string): string {
  const [path, qs] = requestUrl.split('?');
  if (!qs) return `public:get:${path}`;
  return `public:get:${path}?${qs.split('&').sort().join('&')}`;
}

function lockKey(key: string): string {
  return `${key}:lock`;
}

function jitteredTtlSec(): number {
  return BASE_TTL_SEC + Math.floor(Math.random() * BASE_TTL_SEC * JITTER_FRACTION);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Cache-aside read with single-flight stampede protection + TTL jitter.
 *
 * @param redis injected client (the real short-fail client in prod, a fake in tests)
 * @param key namespaced cache key
 * @param compute recompute callback — only the single-flight winner runs it
 * @param opts test overrides for the wait budget (lockWaitMs / waitSleepMs)
 *
 * Always resolves or rejects with the compute result — a Redis failure at any
 * step degrades to a direct compute, never a thrown cache error.
 */
export async function publicCacheGetOrCompute<T>(
  redis: PublicCacheRedis,
  key: string,
  compute: () => Promise<T>,
  opts: { lockWaitMs?: number; waitSleepMs?: number } = {},
): Promise<T> {
  const lockWaitMs = opts.lockWaitMs ?? DEFAULT_LOCK_WAIT_MS;
  const waitSleepMs = opts.waitSleepMs ?? DEFAULT_WAIT_SLEEP_MS;
  const lk = lockKey(key);

  // 1. Fast path — cache hit.
  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch {
    // Redis down — fall through to direct compute.
  }

  // 2. Try to become the single recomputer (atomic NX lock).
  let acquired = false;
  try {
    acquired = (await redis.set(lk, '1', 'PX', LOCK_TTL_MS, 'NX')) === 'OK';
  } catch {
    // Lock server down — compute directly.
  }

  if (acquired) {
    try {
      // Double-check: the winner may have filled the cache while we locked.
      // Guarded like the fast path — a Redis blip or corrupt value here must
      // degrade to a fresh compute, never fail the request.
      try {
        const again = await redis.get(key);
        if (again !== null) return JSON.parse(again) as T;
      } catch {
        // Redis blip or corrupt value — recompute below.
      }

      const value = await compute();
      try {
        await redis.set(key, JSON.stringify(value), 'EX', jitteredTtlSec());
      } catch {
        // Store failed (Redis blip) — still serve the freshly computed value.
      }
      return value;
    } finally {
      await redis.del(lk).catch(() => undefined);
    }
  }

  // 3. Not the winner — wait briefly for the value, then fall back to a direct
  //    compute. A slow or crashed winner never hangs the rest of the herd; the
  //    stampede is bounded to the lock-wait window.
  const deadline = Date.now() + lockWaitMs;
  while (Date.now() < deadline) {
    await sleep(waitSleepMs + Math.floor(Math.random() * waitSleepMs));
    try {
      const value = await redis.get(key);
      if (value !== null) return JSON.parse(value) as T;
    } catch {
      break; // Redis went down mid-wait — compute directly.
    }
  }

  return compute();
}

/**
 * Route-facing wrapper. Under vitest (NODE_ENV=test) Redis is skipped entirely
 * so existing route tests stay deterministic without a Redis instance; in
 * production any Redis failure fails open to a direct compute.
 */
export function withPublicCache<T>(requestUrl: string, compute: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV === 'test') return compute();
  return publicCacheGetOrCompute(getCacheRedis(), normalizedPublicCacheKey(requestUrl), compute);
}
