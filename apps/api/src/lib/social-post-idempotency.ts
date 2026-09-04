// social-post-idempotency.ts — client_post_id dedup markers for the composer
// fan-out publish (R-13 in docs/tasks/social-create-post-composer.md).
//
// The DB `@@unique([retailer_id, social_account_id, client_post_id])` (092) is
// the record-of-truth guard — it makes a concurrent double-POST raise a unique
// violation instead of double-posting. The Redis marker is the cheap, primary
// gate so a normal retry (flaky network) returns the FIRST attempt's result
// instead of re-running the whole Meta publish.
//
// Own short-fail client (NOT getRedis()/BullMQ — maxRetriesPerRequest: null
// would retry forever on a down connection and hang the hot publish path).
// Same VITEST bypass convention as msg91-otp / public-cache / studio-shoot.

import { Redis } from 'ioredis';

const MARKER_KEY = (clientPostId: string) => `social:post:${clientPostId}`;
const MARKER_TTL_SEC = 24 * 60 * 60; // 24h — a retry window this wide is generous

let markerRedis: Redis | null = null;

function getMarkerRedis(): Redis {
  markerRedis ??= new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 10_000,
  });
  return markerRedis;
}

async function awaitRedisReady(redis: Redis): Promise<void> {
  if (redis.status === 'ready') return;
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
}

// Same VITEST bypass convention as the sibling libs — route tests run without
// Redis and stay deterministic. The DB unique constraint is still exercised in
// the unit tests via the mocked prisma layer.
function redisAvailable(): boolean {
  return process.env.VITEST !== 'true';
}

export interface IdempotencyResult {
  /** true = this client_post_id is NEW — the caller should proceed. */
  isNew: boolean;
  /** Best-effort summary of why the marker could not be consulted. */
  degradedReason: string | null;
}

/**
 * Atomically claim a client_post_id (SET NX). Returns { isNew: false } for a
 * duplicate. Fail-open: if Redis is down we proceed anyway (the DB unique
 * constraint is the backstop), but never throw into the publish path.
 */
export async function claimSocialPostId(clientPostId: string): Promise<IdempotencyResult> {
  if (!redisAvailable()) return { isNew: true, degradedReason: null };
  const redis = getMarkerRedis();
  try {
    await awaitRedisReady(redis);
    const claimed = await redis.set(MARKER_KEY(clientPostId), '1', 'EX', MARKER_TTL_SEC, 'NX');
    return { isNew: claimed === 'OK', degradedReason: null };
  } catch {
    // Fail-open: the DB unique constraint still dedupes concurrent doubles.
    return { isNew: true, degradedReason: 'redis-unavailable' };
  }
}
