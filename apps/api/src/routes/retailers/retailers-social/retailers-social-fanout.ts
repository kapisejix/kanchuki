// retailers-social-fanout.ts — composer-v2 fan-out publish (T-3.1).
//
// POST /retailers/me/social/posts publishes ONE post to MANY connected
// accounts in a single request (R-12), replacing the per-account
// /accounts/:id/posts round-trips. Each target gets its own SocialPost row
// (POSTED or FAILED — same history model as the old route) and the response
// is a per-target result array; partial success is normal and expected
// (FB ok / IG failed must never roll back the FB post).
//
// Contract (docs/tasks/social-create-post-composer.md §6.1):
//   {
//     client_post_id: uuid,            // client minted; dedupes retries (R-13)
//     post_type: SINGLE_PRODUCT|CAROUSEL|COLLECTION_LINK,
//     targets: [socialAccountId, ...], // 1..n connected accounts
//     items?: [{ product_id, photo_id?|video_id? }],  // 1 | 2..10 | none
//     collection_id?, link_type?, link_product_id?, caption?
//   }
// Validation errors (bad item counts, unknown media, IG+link-only, mixed
// carousel media) throw a 400 with NO rows written. Publish failures per
// target are recorded as FAILED rows and surfaced in the results.
import { decryptSecret, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  MetaApiError,
  publishFacebookCarousel,
  publishInstagramCarousel,
  publishLinkPost,
  publishPhotoPost,
  publishVideoPost,
} from '../../../lib/meta-graph.js';
import { resolvePostTemplate } from '../../../lib/post-template-placeholders.js';
import { claimSocialPostId } from '../../../lib/social-post-idempotency.js';
import { buildCollectionUrl, buildProductUrl, buildStoreUrl } from '../../../lib/store-urls.js';
import { isRealOwner } from '../../../plugins/auth.js';
import { forbidden, validationError } from '../../../plugins/error-handler.js';
import { publishInstagramPhoto } from './retailers-social-helpers.js';

// R-15: 30 publish requests per retailer per hour (each fan-out request is one
// unit regardless of target count). The DB is the record of truth; this route
// rate limit is the coarse throttle on top of the global IP limiter.
const PUBLISH_LIMIT = { max: 30, timeWindow: 60 * 60 * 1000 };

const itemSchema = z.object({
  product_id: z.string().min(1),
  photo_id: z.string().optional(),
  video_id: z.string().optional(),
});

const bodySchema = z
  .object({
    client_post_id: z.string().min(8).max(100),
    post_type: z.enum(['SINGLE_PRODUCT', 'CAROUSEL', 'COLLECTION_LINK']),
    targets: z.array(z.string().min(1)).min(1),
    items: z.array(itemSchema).max(10).optional(),
    collection_id: z.string().optional(),
    link_type: z.enum(['none', 'collection', 'storefront', 'product']).default('none'),
    link_product_id: z.string().optional(),
    caption: z.string().max(2200).optional(),
    // Admin post template (T-9.6): the client prefills post_type + caption
    // from it for display; the server re-resolves the caption authoritatively
    // and bumps usage_count on publish (§11.2/§11.4).
    template_id: z.string().optional(),
  })
  .strict();

type PostBody = z.infer<typeof bodySchema>;

// Cross-field rules per post_type (mirrors the composer client validation):
//   SINGLE_PRODUCT — exactly 1 item; link resolves from items/link_* fields.
//   CAROUSEL       — 2..10 items, photos only (R-10/R-16; video_id rejected).
//   COLLECTION_LINK— no items; collection_id required; link_type 'collection'.
function assertPostShape(body: PostBody): void {
  const { post_type } = body;
  if (post_type === 'COLLECTION_LINK') {
    if ((body.items ?? []).length > 0)
      throw validationError('A collection link post takes no product media');
    if (!body.collection_id) throw validationError('collection_id is required for COLLECTION_LINK');
  } else if (post_type === 'CAROUSEL') {
    const items = body.items ?? [];
    if (items.length < 2 || items.length > 10) {
      throw validationError('A carousel needs 2–10 products');
    }
    if (items.some((i) => i.video_id)) {
      throw validationError('Carousels support photos only — remove the video');
    }
  } else if ((body.items ?? []).length !== 1) {
    throw validationError('A single product post takes exactly one product');
  }
}

interface LoadedProduct {
  id: string;
  name: string | null;
  price_min: number | null;
  category: string | null;
  collectionSlug: string | null; // for product-link resolution
  photos: Array<{ id: string; url: string; is_primary: boolean }>;
  videos: Array<{ id: string; public_url: string; is_main: boolean }>;
}

export const retailersSocialFanoutRoutes: FastifyPluginAsync = async (server) => {
  server.post('/me/social/posts', { config: { rateLimit: PUBLISH_LIMIT } }, async (request) => {
    if (!isRealOwner(request)) throw forbidden('Only the shop owner can post to social media');

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid post payload');
    const body = parsed.data;
    assertPostShape(body);

    // ── Load the retailer's connected accounts (the targets) ──────────
    const accounts = await prisma.socialAccount.findMany({
      where: {
        id: { in: body.targets },
        retailer_id: request.retailerId,
        is_active: true,
      },
    });
    if (accounts.length === 0) throw validationError('No connected social accounts to post to');
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const unknownTargets = body.targets.filter((id) => !accountById.has(id));
    if (unknownTargets.length > 0) {
      throw validationError('One or more target accounts are not connected');
    }

    // ── Load the retailer + the products behind `items` ───────────────
    // Product links resolve through a collection (the public URL is
    // /{store}/{collection}/product/{id}), so each product also carries the
    // slug of its first active collection when a product link is requested.
    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: request.retailerId },
      // `plan` gates post-template visibility (T-9.6 §11.1).
      select: { public_slug: true, shop_name: true, plan: true },
    });

    const itemList = body.items ?? [];
    const productIds = [...new Set(itemList.map((i) => i.product_id))];
    const loadedProducts = new Map<string, LoadedProduct>();

    if (productIds.length > 0) {
      const needProductLink =
        body.link_type === 'product' &&
        (body.link_product_id || (itemList[0]?.product_id ?? '')) !== '';
      const rows = await prisma.product.findMany({
        where: { id: { in: productIds }, retailer_id: request.retailerId, deleted_at: null },
        select: {
          id: true,
          name: true,
          price_min: true,
          category: true,
          photos: {
            where: { retailer_id: request.retailerId },
            select: { id: true, url: true, is_primary: true },
          },
          videos: {
            where: { retailer_id: request.retailerId },
            select: { id: true, public_url: true, is_main: true },
          },
        },
      });
      const collectionSlugByProduct = new Map<string, string>();
      if (needProductLink) {
        const linkProductId = body.link_product_id ?? itemList[0]?.product_id ?? '';
        const links = await prisma.collectionProduct.findMany({
          where: {
            product_id: linkProductId,
            collection: { retailer_id: request.retailerId, deleted_at: null },
          },
          select: { product_id: true, collection: { select: { slug: true } } },
          take: 5,
        });
        for (const link of links) {
          collectionSlugByProduct.set(link.product_id, link.collection.slug);
        }
      }
      for (const row of rows) {
        loadedProducts.set(row.id, {
          id: row.id,
          name: row.name,
          price_min: row.price_min,
          category: row.category,
          collectionSlug: collectionSlugByProduct.get(row.id) ?? null,
          photos: row.photos,
          videos: row.videos,
        });
      }
      const missing = productIds.filter((id) => !loadedProducts.has(id));
      if (missing.length > 0)
        throw validationError('One or more selected products no longer exist');
    }

    // ── Validate + snapshot each item's media (photos XOR the main video) ─
    interface Snapshot {
      product_id: string;
      photo_id?: string;
      video_id?: string;
      kind: 'photo' | 'video';
      url: string;
    }
    const snapshots: Snapshot[] = [];
    for (const item of itemList) {
      const product = loadedProducts.get(item.product_id)!;
      if (item.photo_id) {
        const photo = product.photos.find((p) => p.id === item.photo_id);
        if (!photo) throw validationError('Selected photo does not belong to the product');
        snapshots.push({
          product_id: product.id,
          photo_id: photo.id,
          kind: 'photo',
          url: photo.url,
        });
      } else if (item.video_id) {
        const video = product.videos.find((v) => v.id === item.video_id);
        if (!video) throw validationError('Selected video does not belong to the product');
        snapshots.push({
          product_id: product.id,
          video_id: video.id,
          kind: 'video',
          url: video.public_url,
        });
      } else {
        // No explicit media — default: main video (Ken Burns) first, else
        // the primary photo, else any photo (mirrors the composer defaults).
        const mainVideo = product.videos.find((v) => v.is_main) ?? product.videos[0];
        const primaryPhoto = product.photos.find((p) => p.is_primary) ?? product.photos[0];
        if (body.post_type === 'SINGLE_PRODUCT' && mainVideo) {
          snapshots.push({
            product_id: product.id,
            video_id: mainVideo.id,
            kind: 'video',
            url: mainVideo.public_url,
          });
        } else if (primaryPhoto) {
          snapshots.push({
            product_id: product.id,
            photo_id: primaryPhoto.id,
            kind: 'photo',
            url: primaryPhoto.url,
          });
        } else {
          throw validationError('One or more selected products have no photo to post');
        }
      }
    }
    // R-10 guard: assertPostShape banned explicit videos in carousels, and
    // the defaulted-media path only ever picks a video for SINGLE_PRODUCT,
    // so a carousel here is photos by construction — belt & braces anyway:
    if (body.post_type === 'CAROUSEL' && snapshots.some((s) => s.kind === 'video')) {
      throw validationError('Carousels support photos only — remove the video');
    }

    // ── Resolve the link (server-owned, never a client URL — R-11) ─────
    let linkUrl: string | null = null;
    let resolvedLinkType: 'none' | 'collection' | 'storefront' | 'product' | null = null;
    if (body.post_type === 'COLLECTION_LINK') {
      const collection = await prisma.collection.findFirst({
        where: {
          id: body.collection_id,
          retailer_id: request.retailerId,
          deleted_at: null,
        },
        select: { slug: true },
      });
      if (!collection) throw validationError('Collection not found');
      linkUrl = buildCollectionUrl(retailer.public_slug, collection.slug);
      resolvedLinkType = 'collection';
    } else if (body.link_type === 'collection') {
      // Media post + collection link card
      if (!body.collection_id) throw validationError('collection_id is required');
      const collection = await prisma.collection.findFirst({
        where: { id: body.collection_id, retailer_id: request.retailerId, deleted_at: null },
        select: { slug: true },
      });
      if (!collection) throw validationError('Collection not found');
      linkUrl = buildCollectionUrl(retailer.public_slug, collection.slug);
    } else if (body.link_type === 'storefront') {
      linkUrl = buildStoreUrl(retailer.public_slug ?? '');
    } else if (body.link_type === 'product') {
      const linkProductId = body.link_product_id ?? itemList[0]?.product_id ?? '';
      const linkProduct = loadedProducts.get(linkProductId);
      if (!linkProduct) throw validationError('link_product_id is not in the post items');
      // Every product at minimum resolves to a storefront URL when it is
      // not in any collection yet — the link card still opens the shop.
      linkUrl = linkProduct.collectionSlug
        ? buildProductUrl(retailer.public_slug, linkProduct.collectionSlug, linkProduct.id)
        : buildStoreUrl(retailer.public_slug ?? '');
    }
    // link_type 'none' (the zod default) → no link card.
    resolvedLinkType = body.link_type;

    // ── Admin post template (T-9.6, §11) ──────────────────────────────
    // The client prefills post_type + caption from the template for display;
    // here the server (a) resolves the template's own caption with
    // authoritative values when the client sent none, (b) re-resolves any
    // leftover {placeholders} in a client caption (never leaves a raw token
    // in a live post), and (c) bumps usage_count once per publish below.
    let postTemplate: { caption_template: string; hashtags: string[] } | null = null;
    if (body.template_id) {
      postTemplate = await prisma.postTemplate.findFirst({
        where: {
          id: body.template_id,
          status: 'PUBLISHED',
          plans: { has: retailer.plan },
        },
        select: { caption_template: true, hashtags: true },
      });
      if (!postTemplate) throw validationError('Template not found or not available on your plan');
    }

    // ── Auto caption (server templates when the client sends none) ─────
    // Resolved through resolvePostTemplate (T-9.5) so the fan-out speaks the
    // same authoritative placeholder language as the admin post templates —
    // fail-open: a missing value never leaves a raw {token} in a live post.
    const firstProduct = itemList[0] ? loadedProducts.get(itemList[0].product_id) : null;
    const productNames = snapshots
      .map((s) => loadedProducts.get(s.product_id)?.name?.trim())
      .filter((n): n is string => Boolean(n));
    const templateCtx = {
      productNames,
      pricePaise: firstProduct?.price_min ?? undefined,
      category: firstProduct?.category ?? undefined,
      storeName: retailer.shop_name ?? undefined,
      link: linkUrl ?? undefined,
    };
    let caption = body.caption?.trim() ?? '';
    if (postTemplate) {
      if (!caption) {
        caption = resolvePostTemplate(postTemplate.caption_template, templateCtx);
        if (postTemplate.hashtags.length > 0) {
          caption += (caption ? '\n\n' : '') + postTemplate.hashtags.join(' ');
        }
      } else {
        // Retailer-edited caption passes through — only stray placeholders
        // are re-resolved (user text never gets clobbered).
        caption = resolvePostTemplate(caption, templateCtx);
      }
    } else if (!caption) {
      if (body.post_type === 'COLLECTION_LINK') {
        caption = resolvePostTemplate('Shop the new collection on WhatsApp: {link}', {
          storeName: retailer.shop_name ?? undefined,
          link: linkUrl ?? undefined,
        });
      } else if (productNames.length > 0) {
        // Token segments are conditional so a missing price/category/store
        // name doesn't leave dangling separators in the live post.
        const priceToken = firstProduct?.price_min != null ? ' — ₹{price}' : '';
        const categoryToken = firstProduct?.category?.trim() ? ' in {category}' : '';
        const storeToken = retailer.shop_name?.trim() ? ' at {store_name}' : '';
        caption = resolvePostTemplate(
          `New in: {product_names}${priceToken}${categoryToken}${storeToken}`,
          templateCtx,
        );
      } else {
        caption = 'New arrivals at our store';
      }
    }

    // Media posts carry the resolved link in the caption (matching the
    // legacy route) — FB photo/video endpoints take no link card param, so
    // the link text goes in the caption body instead.
    if (body.post_type !== 'COLLECTION_LINK' && linkUrl && !caption.includes(linkUrl)) {
      caption += (caption ? '\n\n' : '') + linkUrl;
    }

    // ── Idempotency (R-13): a retry with the same client_post_id returns
    // the first attempt's rows instead of re-publishing.
    //   • Redis duplicate (isNew=false) → always replay. A concurrent twin may
    //     still be mid-flight with no rows written yet; returning the (possibly
    //     empty) replay is the safe outcome — we must NOT fall through and
    //     double-publish. The original caller's rows appear once the winner
    //     finishes.
    //   • Redis unavailable (degraded fail-open) → the marker was never set,
    //     so a second attempt claims as new. The DB is the record of truth:
    //     if rows for this id already exist (a prior attempt published while
    //     Redis was down), replay them instead of publishing again.
    const claim = await claimSocialPostId(body.client_post_id);
    if (!claim.isNew) {
      const existing = await prisma.socialPost.findMany({
        where: { retailer_id: request.retailerId, client_post_id: body.client_post_id },
        orderBy: { created_at: 'asc' },
        take: 20,
      });
      return {
        data: { results: existing.map((p) => toResultRow(p, { deduplicated: true })) },
      };
    }
    const priorAttempt = await prisma.socialPost.findMany({
      where: { retailer_id: request.retailerId, client_post_id: body.client_post_id },
      orderBy: { created_at: 'asc' },
      take: 20,
    });
    if (priorAttempt.length > 0) {
      return {
        data: { results: priorAttempt.map((p) => toResultRow(p, { deduplicated: true })) },
      };
    }

    // ── Fan out per target ─────────────────────────────────────────────
    const results: Array<Record<string, unknown>> = [];

    const snapshotJson = snapshots.map((s) => ({ ...s }));
    for (const targetId of body.targets) {
      const account = accountById.get(targetId)!;
      try {
        const token = accountToken(account.access_token_encrypted);
        let externalPostId: string | null = null;
        let externalPostUrl: string | null = null;

        if (account.platform === 'INSTAGRAM') {
          if (body.post_type === 'COLLECTION_LINK') {
            throw new MetaApiError(
              'Instagram link posts need a photo — add product media instead',
              400,
              'INSTAGRAM_LINK_REQUIRES_IMAGE',
            );
          }
          if (body.post_type === 'CAROUSEL') {
            const { postId, permalink } = await publishInstagramCarousel(
              account.platform_account_id,
              token,
              snapshots.map((s) => s.url),
              caption,
            );
            externalPostId = postId;
            externalPostUrl = permalink;
          } else {
            // SINGLE_PRODUCT — IG photo helper is photo-only; a video item
            // falls back to the product's primary photo.
            const photo =
              snapshots[0]?.kind === 'photo'
                ? snapshots[0]
                : productFallbackPhoto(loadedProducts, snapshots[0]?.product_id);
            if (!photo)
              throw new MetaApiError('Instagram posts require a photo', 400, 'IG_PHOTO_REQUIRED');
            const { postId } = await publishInstagramPhoto(
              account.platform_account_id,
              token,
              photo.url,
              caption,
            );
            externalPostId = postId;
            externalPostUrl = `https://www.instagram.com/p/${postId}/`;
          }
        } else {
          // FACEBOOK
          if (body.post_type === 'CAROUSEL') {
            const { postId } = await publishFacebookCarousel(
              account.platform_account_id,
              token,
              snapshots.map((s) => s.url),
              caption,
              linkUrl ?? undefined,
            );
            externalPostId = postId;
            externalPostUrl = `https://www.facebook.com/${account.platform_account_id}/posts/${postId}`;
          } else if (body.post_type === 'COLLECTION_LINK') {
            const { postId } = await publishLinkPost(
              account.platform_account_id,
              token,
              linkUrl!,
              caption,
            );
            externalPostId = postId;
            externalPostUrl = `https://www.facebook.com/${account.platform_account_id}/posts/${postId}`;
          } else {
            const first = snapshots[0]!;
            if (first.kind === 'video') {
              const { postId } = await publishVideoPost(
                account.platform_account_id,
                token,
                first.url,
                caption,
              );
              externalPostId = postId;
              externalPostUrl = `https://www.facebook.com/${account.platform_account_id}/posts/${postId}`;
            } else {
              const { postId } = await publishPhotoPost(
                account.platform_account_id,
                token,
                first.url,
                caption,
              );
              externalPostId = postId;
              externalPostUrl = `https://www.facebook.com/${account.platform_account_id}/posts/${postId}`;
            }
          }
        }

        // Record the outcome. The unique index (retailer, account,
        // client_post_id) is the backstop for a concurrent double that slips
        // between the idempotency claim and this write — a P2002 here means a
        // twin already owns the row, so reconcile (load it, upgrade a FAILED
        // twin row when OUR publish actually landed) instead of crashing into a
        // second violation from the catch's FAILED-row write (which used to 500).
        const { post, deduplicated } = await createOrReconcilePost({
          retailer_id: request.retailerId,
          social_account_id: account.id,
          platform: account.platform,
          post_type: body.post_type,
          product_ids: snapshots.map((s) => s.product_id),
          collection_id: body.post_type === 'COLLECTION_LINK' ? body.collection_id : undefined,
          caption,
          media: snapshotJson as unknown as object[],
          link_url: linkUrl,
          link_type: resolvedLinkType,
          client_post_id: body.client_post_id,
          status: 'POSTED',
          external_post_id: externalPostId,
          external_post_url: externalPostUrl,
          error_message: null,
        });
        results.push({
          social_account_id: account.id,
          platform: account.platform,
          status: post.status,
          external_post_url: post.external_post_url,
          social_post_id: post.id,
          error_message: post.error_message,
          ...(deduplicated ? { deduplicated: true } : {}),
        });
      } catch (err) {
        const safeMessage = err instanceof Error ? err.message : 'Post failed';
        const { post, deduplicated } = await createOrReconcilePost({
          retailer_id: request.retailerId,
          social_account_id: account.id,
          platform: account.platform,
          post_type: body.post_type,
          product_ids: snapshots.map((s) => s.product_id),
          collection_id: body.post_type === 'COLLECTION_LINK' ? body.collection_id : undefined,
          caption: caption || '—',
          media: snapshotJson as unknown as object[],
          link_url: linkUrl,
          link_type: resolvedLinkType,
          client_post_id: body.client_post_id,
          status: 'FAILED',
          external_post_id: null,
          external_post_url: null,
          error_message: safeMessage,
        });
        results.push({
          social_account_id: account.id,
          platform: account.platform,
          status: post.status,
          external_post_url: post.external_post_url,
          social_post_id: post.id,
          error_message: post.error_message,
          ...(deduplicated ? { deduplicated: true } : {}),
        });
      }
    }

    // T-9.6: count the template use once per publish that actually went out
    // (≥1 POSTED target). Idempotent retries return earlier so they never
    // double-count; an all-failed attempt posted nothing, so it doesn't count.
    if (body.template_id && results.some((r) => r.status === 'POSTED')) {
      await prisma.postTemplate.update({
        where: { id: body.template_id },
        data: { usage_count: { increment: 1 } },
      });
    }

    // Partial success allowed. Only when EVERY target failed do we surface
    // an error status (the results still carry the per-target FAILED rows).
    if (results.every((r) => r.status === 'FAILED')) {
      const err = new MetaApiError('Social publish failed for all targets', 400, 'PUBLISH_FAILED');
      (err as unknown as { results?: unknown[] }).results = results;
      throw err;
    }
    return { data: { results } };
  });
};

// ── helpers ──────────────────────────────────────────────────────

function accountToken(encrypted: string): string {
  return decryptSecret(encrypted);
}

function productFallbackPhoto(
  products: Map<string, LoadedProduct>,
  productId: string | undefined,
): { url: string } | null {
  if (!productId) return null;
  const product = products.get(productId);
  if (!product) return null;
  const photo = product.photos.find((p) => p.is_primary) ?? product.photos[0];
  return photo ? { url: photo.url } : null;
}

/** One history row → the per-target result shape (shared by fresh publishes,
 * Redis dedupe replays and P2002 reconciliations so every path speaks the
 * same wire format). */
function toResultRow(
  p: {
    id: string;
    social_account_id: string;
    platform: string;
    status: string;
    external_post_url: string | null;
    error_message: string | null;
  },
  opts: { deduplicated: boolean },
): Record<string, unknown> {
  return {
    social_account_id: p.social_account_id,
    platform: p.platform,
    status: p.status,
    external_post_url: p.external_post_url,
    social_post_id: p.id,
    error_message: p.error_message,
    ...(opts.deduplicated ? { deduplicated: true } : {}),
  };
}

// The SocialPost create data we fan out — typed as Prisma's unchecked create
// input so the reconciling write accepts it without per-call casts.
type PostRowDraft = Parameters<typeof prisma.socialPost.create>[0]['data'];

// A draft + the platform-side outcome fields attached after publish.
type PostRowDraftWithOutcome = PostRowDraft & {
  external_post_id?: string | null;
  external_post_url?: string | null;
};

/**
 * Write one target's SocialPost row, reconciling a DB unique violation
 * (P2002 — a concurrent twin already owns this (retailer, account,
 * client_post_id) row). Reconcile instead of failing:
 *   • twin row is POSTED  → the post is already live (we or the twin put it
 *     there); surface it deduplicated, never write a second row.
 *   • twin row is FAILED + our attempt actually POSTED → the post IS live,
 *     so upgrade the row (history must not claim failure for a live post).
 *   • twin row is FAILED + we failed too → surface the existing FAILED row.
 * Returns { post, deduplicated } matching toResultRow's input shape.
 */
async function createOrReconcilePost(
  draft: PostRowDraft,
): Promise<{ post: PostRowDraftWithOutcome & { id: string }; deduplicated: boolean }> {
  try {
    const created = await prisma.socialPost.create({ data: draft });
    return { post: created as PostRowDraftWithOutcome & { id: string }, deduplicated: false };
  } catch (err) {
    const isUniqueViolation =
      typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
    if (!isUniqueViolation) throw err;
    const existing = await prisma.socialPost.findFirst({
      where: {
        retailer_id: draft.retailer_id,
        social_account_id: draft.social_account_id,
        client_post_id: draft.client_post_id,
      },
    });
    if (!existing) throw err; // vanished between create + read — surface original
    if (existing.status === 'FAILED' && draft.status === 'POSTED') {
      // Our publish landed but the twin's row says FAILED — upgrade it so the
      // live post is recorded as POSTED with the platform ids we received.
      const upgraded = await prisma.socialPost.update({
        where: { id: existing.id },
        data: {
          status: 'POSTED',
          external_post_id: draft.external_post_id ?? null,
          external_post_url: draft.external_post_url ?? null,
          error_message: null,
        },
      });
      return {
        post: upgraded as PostRowDraftWithOutcome & { id: string },
        deduplicated: true,
      };
    }
    return {
      post: existing as PostRowDraftWithOutcome & { id: string },
      deduplicated: true,
    };
  }
}
