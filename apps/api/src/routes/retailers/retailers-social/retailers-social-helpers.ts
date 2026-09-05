import { randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';
import { MetaApiError, clampIgCaption, fetchIgPermalink } from '../../../lib/meta-graph.js';

// Shared helpers/constants for the retailer social route modules (split from
// retailers/retailers-social.ts — module-level code moved verbatim by
// scripts/_tmp-split-route-modules.cjs).

// Instagram Graph API helper functions (minimal implementation for Phase 2)
export async function getInstagramAccountId(accessToken: string): Promise<string> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`,
  );
  if (!res.ok) {
    throw new MetaApiError('Failed to list accounts', 400, 'ACCOUNTS_LIST_FAILED');
  }
  const body = (await res.json()) as { data: Array<{ id: string; name: string }> };
  const account = body.data.find((acc) => acc.id && acc.name);
  if (!account) {
    throw new MetaApiError('No Instagram account found', 404, 'ACCOUNT_NOT_FOUND');
  }
  return account.id;
}

export async function publishInstagramPhoto(
  instagramAccountId: string,
  accessToken: string,
  imageUrl: string,
  caption: string,
): Promise<{ postId: string; permalink: string }> {
  // Step 1: Create media container. IG captions cap at 2,200 chars — clamp at
  // the platform boundary (finding 5a) so an appended link can't exceed it.
  const containerRes = await fetch(`https://graph.facebook.com/v21.0/${instagramAccountId}/media`, {
    method: 'POST',
    body: new URLSearchParams({
      image_url: imageUrl,
      caption: clampIgCaption(caption),
      access_token: accessToken,
    }),
  });

  if (!containerRes.ok) {
    throw new MetaApiError(
      'Instagram rejected the photo container',
      400,
      'INSTAGRAM_CONTAINER_FAILED',
    );
  }

  const containerBody = (await containerRes.json()) as { id?: string };
  if (!containerBody.id) {
    throw new MetaApiError('No media container ID returned', 500, 'NO_CONTAINER_ID');
  }

  const creationId = containerBody.id;

  // Step 2: Publish the media
  const publishRes = await fetch(
    `https://graph.facebook.com/v21.0/${instagramAccountId}/media_publish`,
    {
      method: 'POST',
      body: new URLSearchParams({
        creation_id: creationId,
        access_token: accessToken,
      }),
    },
  );

  if (!publishRes.ok) {
    throw new MetaApiError('Instagram rejected the media publish', 400, 'INSTAGRAM_PUBLISH_FAILED');
  }

  const publishBody = (await publishRes.json()) as { id?: string };
  if (!publishBody.id) {
    throw new MetaApiError('No post ID returned from publish', 500, 'NO_POST_ID');
  }

  // The published media id is NOT an instagram.com shortcode — fabricating
  // /p/<id> 404s in history. Fetch the real permalink field, fail-open (the
  // post IS live; a permalink miss must never surface as a failure — finding 3).
  const permalink = await fetchIgPermalink(publishBody.id, accessToken);
  return { postId: publishBody.id, permalink };
}

// Short-fail Redis for the OAuth state token — same pattern as public-cache
// and msg91-otp (BullMQ's client would retry forever on a down connection).
let stateRedis: Redis | null = null;
export function getStateRedis(): Redis {
  if (!stateRedis) {
    stateRedis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      // 10s for Upstash cold start, NO lazyConnect — same 2026-08-13 incident
      // as msg91-otp/public-cache: lazyConnect + offlineQueue:false kills the
      // first command before the handshake completes.
      connectTimeout: 10_000,
    });
  }
  return stateRedis;
}

export const STATE_TTL_SEC = 600; // 10 minutes — OAuth flows shouldn't sit open longer

/** Wait for the handshake before sending a command — same 2026-08-13 fix as
 * msg91-otp: `enableOfflineQueue:false` rejects commands sent before 'ready'
 * with "Stream isn't writeable" (the FIRST connect of the day always failed). */
export async function awaitStateRedisReady(redis: Redis): Promise<void> {
  if (redis.status === 'ready') return Promise.resolve();
  return new Promise((resolve, reject) => {
    redis.once('ready', () => resolve());
    redis.once('error', (err) => reject(err));
  });
}

export async function createOAuthState(retailerId: string): Promise<string> {
  const state = randomBytes(24).toString('base64url');
  const redis = getStateRedis();
  await awaitStateRedisReady(redis);
  await redis.set(`social:oauth:${state}`, retailerId, 'EX', STATE_TTL_SEC);
  return state;
}

export async function consumeOAuthState(state: string): Promise<string | null> {
  const redis = getStateRedis();
  await awaitStateRedisReady(redis);
  const retailerId = await redis.getdel(`social:oauth:${state}`);
  return retailerId;
}
