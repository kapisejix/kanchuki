// F-031 Social Media Publishing (Phase 1: Facebook Page).
//
// Retailer flows:
//   1. Connect: GET /retailers/me/social/connect → { auth_url, state } —
//      the mobile app opens auth_url in a browser (web page at /social/connect),
//      which redirects through the Meta login dialog. Meta redirects back to
//      the Kanchuki callback URL with ?code=&state=.
//   2. Callback: POST /retailers/me/social/callback { code, state } — exchange
//      the code for tokens, list the retailer's Pages, return them for the
//      web page to render a picker. Nothing is stored yet — the retailer
//      picks which Page to connect, then POSTs the choice:
//   3. POST /retailers/me/social/accounts { platform_account_id } — stores the
//      selected Page (encrypted token via F-012) under a new SocialAccount row.
//   4. POST /retailers/me/social/accounts/:id/posts — publish a post to the
//      connected Page (SINGLE_PRODUCT or COLLECTION_LINK).
//   5. GET /retailers/me/social/accounts (list, masked) + GET .../:id/posts (history)
//   6. DELETE /retailers/me/social/accounts/:id — disconnect.
//
// Security:
//   - OAuth `state` is a random opaque token stored in Redis (10 min TTL) and
//     bound to the retailer; the callback verifies it before doing anything.
//   - Tokens are stored encrypted (encryptSecret) and only masked previews
//     ever leave the API.
//   - Publish + disconnect are owner-only (staff get 403 via staffCanAccess).
//   - Every post stores a SocialPost history row with status POSTED/FAILED.
import { decryptSecret, encryptSecret, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { Redis } from 'ioredis';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  MetaApiError,
  buildOAuthUrl,
  exchangeCodeForToken,
  listPages,
  publishLinkPost,
  publishPhotoPost,
  resolveMetaCredentials,
} from '../../lib/meta-graph.js';
import { buildCollectionUrl } from '../../lib/store-urls.js';
import {
  AppError,
  forbidden,
  notFound,
  serviceUnavailable,
  validationError,
} from '../../plugins/error-handler.js';
import { isRealOwner } from '../../plugins/auth.js';

// Short-fail Redis for the OAuth state token — same pattern as public-cache
// and msg91-otp (BullMQ's client would retry forever on a down connection).
let stateRedis: Redis | null = null;
function getStateRedis(): Redis {
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

const STATE_TTL_SEC = 600; // 10 minutes — OAuth flows shouldn't sit open longer

/** Wait for the handshake before sending a command — same 2026-08-13 fix as
 * msg91-otp: `enableOfflineQueue:false` rejects commands sent before 'ready'
 * with "Stream isn't writeable" (the FIRST connect of the day always failed). */
function awaitStateRedisReady(redis: Redis): Promise<void> {
  if (redis.status === 'ready') return Promise.resolve();
  return new Promise((resolve, reject) => {
    redis.once('ready', () => resolve());
    redis.once('error', (err) => reject(err));
  });
}

async function createOAuthState(retailerId: string): Promise<string> {
  const state = randomBytes(24).toString('base64url');
  const redis = getStateRedis();
  await awaitStateRedisReady(redis);
  await redis.set(`social:oauth:${state}`, retailerId, 'EX', STATE_TTL_SEC);
  return state;
}

async function consumeOAuthState(state: string): Promise<string | null> {
  const redis = getStateRedis();
  await awaitStateRedisReady(redis);
  const retailerId = await redis.getdel(`social:oauth:${state}`);
  return retailerId;
}

export const retailersSocialRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /retailers/me/social/connect — start OAuth ─────────────
  // Returns the Meta login URL + state. The mobile app opens `auth_url`
  // (the Kanchuki web page at {WEB_URL}/social/connect), which then handles
  // the Meta redirect. Requires META_APP_ID/META_APP_SECRET to be configured.
  server.get('/me/social/connect', async (request) => {
    const meta = await resolveMetaCredentials();
    if (!meta) {
      throw serviceUnavailable('Social publishing is not configured yet');
    }
    const state = await createOAuthState(request.retailerId);
    // Redirect URI is the Kanchuki web callback (apps/web /social/connect/callback).
    const redirectUri = `${process.env.WEB_URL ?? ''}/social/connect/callback`;
    return { data: { auth_url: buildOAuthUrl(meta, redirectUri, state), state } };
  });

  // ─── POST /retailers/me/social/callback — exchange code + list Pages ─
  // Code comes from the web callback page (?code=&state=). Verifies state,
  // exchanges code for tokens, lists the retailer's Pages so the web page can
  // render a picker. Nothing stored yet.
  server.post('/me/social/callback', async (request) => {
    const body = z
      .object({ code: z.string().min(1), state: z.string().min(1) })
      .safeParse(request.body);
    if (!body.success) throw validationError('code and state are required');

    const meta = await resolveMetaCredentials();
    if (!meta) throw serviceUnavailable('Social publishing is not configured yet');

    const boundRetailer = await consumeOAuthState(body.data.state);
    if (boundRetailer !== request.retailerId) {
      throw validationError('Invalid or expired OAuth state');
    }

    const redirectUri = `${process.env.WEB_URL ?? ''}/social/connect/callback`;
    const { accessToken } = await exchangeCodeForToken(meta, body.data.code, redirectUri);
    const pages = await listPages(accessToken);
    if (pages.length === 0) {
      throw validationError('No Facebook Pages found for this account');
    }

    // Hold the token for the follow-up connect call (retailer picks a Page).
    // Store under the same state key so the choice endpoint can fetch it.
    const redis = getStateRedis();
    await redis.set(`social:tokens:${body.data.state}`, accessToken, 'EX', STATE_TTL_SEC);

    return {
      data: {
        pages: pages.map((p) => ({ id: p.id, name: p.name })),
        state: body.data.state,
      },
    };
  });

  // ─── POST /retailers/me/social/accounts — store the chosen Page ──
  // The web picker posts { platform_account_id, state } — the state ties the
  // choice back to the just-exchanged token. Upserts the SocialAccount row.
  server.post('/me/social/accounts', async (request) => {
    const body = z
      .object({ platform_account_id: z.string().min(1), state: z.string().min(1) })
      .safeParse(request.body);
    if (!body.success) throw validationError('platform_account_id and state are required');

    const redis = getStateRedis();
    const accessToken = await redis.getdel(`social:tokens:${body.data.state}`);
    if (!accessToken) {
      throw validationError('OAuth session expired — please connect again');
    }

    // Fetch the chosen page's name + page-scoped token.
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${body.data.platform_account_id}?${new URLSearchParams({
        access_token: accessToken,
        fields: 'id,name,access_token',
      })}`,
    );
    const page = (await res.json()) as { id?: string; name?: string; access_token?: string };
    if (!res.ok || !page.id || !page.name || !page.access_token) {
      throw new MetaApiError('Could not fetch the selected Facebook Page', 400, 'PAGE_FETCH_FAILED');
    }

    const account = await prisma.socialAccount.upsert({
      where: {
        retailer_id_platform_platform_account_id: {
          retailer_id: request.retailerId,
          platform: 'FACEBOOK',
          platform_account_id: page.id,
        },
      },
      update: {
        platform_account_name: page.name,
        access_token_encrypted: encryptSecret(page.access_token),
        is_active: true,
      },
      create: {
        retailer_id: request.retailerId,
        platform: 'FACEBOOK',
        platform_account_id: page.id,
        platform_account_name: page.name,
        access_token_encrypted: encryptSecret(page.access_token),
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'connect',
        resource_type: 'SocialAccount',
        resource_id: account.id,
        metadata: { platform: 'FACEBOOK', platform_account_id: page.id, account_name: page.name },
        ip_address: request.ip,
      },
    });

    return { data: { id: account.id, platform: 'FACEBOOK', account_name: page.name } };
  });

  // ─── GET /retailers/me/social/accounts — list connected accounts ─
  server.get('/me/social/accounts', async (request) => {
    const accounts = await prisma.socialAccount.findMany({
      where: { retailer_id: request.retailerId, is_active: true },
      select: {
        id: true,
        platform: true,
        platform_account_id: true,
        platform_account_name: true,
        token_expires_at: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });
    return {
      data: accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        account_id: a.platform_account_id,
        account_name: a.platform_account_name,
        token_expires_at: a.token_expires_at,
        connected_at: a.created_at,
      })),
    };
  });

  // ─── DELETE /retailers/me/social/accounts/:id — disconnect ───────
  server.delete<{ Params: { id: string } }>('/me/social/accounts/:id', async (request, reply) => {
    const account = await prisma.socialAccount.findFirst({
      where: { id: request.params.id, retailer_id: request.retailerId },
    });
    if (!account) throw notFound('Social account');

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { is_active: false },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'disconnect',
        resource_type: 'SocialAccount',
        resource_id: account.id,
        metadata: { platform: account.platform, platform_account_id: account.platform_account_id },
        ip_address: request.ip,
      },
    });
    return reply.status(204).send();
  });

  // ─── POST /retailers/me/social/accounts/:id/posts — publish ──────
  // Body: { post_type: 'SINGLE_PRODUCT'|'COLLECTION_LINK', product_id?,
  //         collection_id?, caption? }
  // SINGLE_PRODUCT: publish the product's hero photo + auto caption.
  // COLLECTION_LINK: publish a link post to the collection's /c/[slug] URL.
  // Every attempt records a SocialPost row (POSTED with the FB url, or FAILED
  // with a safe error message).
  server.post<{ Params: { id: string } }>('/me/social/accounts/:id/posts', async (request) => {
    if (!isRealOwner(request)) throw forbidden('Only the shop owner can post to social media');

    const body = z
      .object({
        post_type: z.enum(['SINGLE_PRODUCT', 'COLLECTION_LINK']),
        product_id: z.string().optional(),
        collection_id: z.string().optional(),
        caption: z.string().max(2200).optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError('Invalid post payload');

    const account = await prisma.socialAccount.findFirst({
      where: { id: request.params.id, retailer_id: request.retailerId, is_active: true },
    });
    if (!account) throw notFound('Social account');

    const token = decryptSecret(account.access_token_encrypted);

    let externalPostId: string | null = null;
    let externalPostUrl: string | null = null;
    let caption = body.data.caption?.trim() ?? '';
    let productIds: string[] = [];
    let collectionId: string | null = null;

    try {
      if (body.data.post_type === 'SINGLE_PRODUCT') {
        if (!body.data.product_id) throw validationError('product_id is required for SINGLE_PRODUCT');
        const product = await prisma.product.findFirst({
          where: { id: body.data.product_id, retailer_id: request.retailerId, deleted_at: null },
          select: {
            id: true,
            name: true,
            price_min: true,
            photos: { where: { is_primary: true }, take: 1 },
          },
        });
        if (!product) throw notFound('Product');
        const photo = product.photos[0];
        if (!photo) throw validationError('This product has no photo to post');

        productIds = [product.id];
        if (!caption) {
          // price_min is stored in paise (₹1500 = 150000).
          const price = product.price_min ? ` — ₹${product.price_min / 100}` : '';
          caption = `${product.name ?? 'New arrival'}${price}\n\nShop the collection on WhatsApp: ${'https://kanchuki.app'}`;
        }
        const { postId } = await publishPhotoPost(token, photo.url, caption);
        externalPostId = postId;
        externalPostUrl = `https://www.facebook.com/${account.platform_account_id}/posts/${postId}`;
      } else {
        // COLLECTION_LINK
        if (!body.data.collection_id) throw validationError('collection_id is required');
        const collection = await prisma.collection.findFirst({
          where: { id: body.data.collection_id, retailer_id: request.retailerId, deleted_at: null },
          select: { id: true, title: true, slug: true },
        });
        if (!collection) throw notFound('Collection');
        collectionId = collection.id;

        // The collection's public link (canonical scheme — store URL or the
        // legacy /c/{slug} fallback when the store has no public slug).
        const retailer = await prisma.retailer.findUnique({
          where: { id: request.retailerId },
          select: { public_slug: true },
        });
        const link = buildCollectionUrl(retailer?.public_slug ?? null, collection.slug);

        if (!caption) caption = `Shop ${collection.title} — new collection on WhatsApp. ${link}`;
        const { postId } = await publishLinkPost(token, link, caption);
        externalPostId = postId;
        externalPostUrl = `https://www.facebook.com/${account.platform_account_id}/posts/${postId}`;
      }

      const post = await prisma.socialPost.create({
        data: {
          retailer_id: request.retailerId,
          social_account_id: account.id,
          platform: account.platform,
          post_type: body.data.post_type,
          product_ids: productIds,
          collection_id: collectionId,
          caption,
          external_post_id: externalPostId,
          external_post_url: externalPostUrl,
          status: 'POSTED',
        },
      });

      await prisma.auditLog.create({
        data: {
          actor_type: 'retailer',
          actor_id: request.retailerId,
          action: 'publish',
          resource_type: 'SocialPost',
          resource_id: post.id,
          metadata: {
            platform: account.platform,
            post_type: body.data.post_type,
            product_ids: productIds,
            collection_id: collectionId,
            external_post_id: externalPostId,
          },
          ip_address: request.ip,
        },
      });

      return {
        data: {
          id: post.id,
          post_type: post.post_type,
          external_post_url: externalPostUrl,
          status: 'POSTED',
        },
      };
    } catch (err) {
      // Client-side validation errors (missing product/photo/collection, wrong
      // payload) are the caller's fault — propagate as-is, no FAILED row.
      if (err instanceof AppError) throw err;

      // Publish failures record a FAILED history row with a safe message.
      const safeMessage =
        err instanceof MetaApiError
          ? 'Facebook rejected the post — please try again.'
          : err instanceof Error
            ? err.message
            : 'Post failed';
      await prisma.socialPost.create({
        data: {
          retailer_id: request.retailerId,
          social_account_id: account.id,
          platform: account.platform,
          post_type: body.data.post_type,
          product_ids: productIds,
          collection_id: collectionId,
          caption: caption || '—',
          status: 'FAILED',
          error_message: safeMessage,
        },
      });
      throw new MetaApiError(safeMessage, 400, 'PUBLISH_FAILED');
    }
  });

  // ─── GET /retailers/me/social/accounts/:id/posts — history ───────
  server.get<{ Params: { id: string } }>('/me/social/accounts/:id/posts', async (request) => {
    const account = await prisma.socialAccount.findFirst({
      where: { id: request.params.id, retailer_id: request.retailerId },
      select: { id: true },
    });
    if (!account) throw notFound('Social account');

    const posts = await prisma.socialPost.findMany({
      where: { social_account_id: account.id, retailer_id: request.retailerId },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return {
      data: posts.map((p) => ({
        id: p.id,
        post_type: p.post_type,
        caption: p.caption,
        status: p.status,
        external_post_url: p.external_post_url,
        error_message: p.error_message,
        product_ids: p.product_ids,
        collection_id: p.collection_id,
        created_at: p.created_at,
      })),
    };
  });
};
