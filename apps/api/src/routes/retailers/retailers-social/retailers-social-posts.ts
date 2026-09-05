// retailers-social-posts.ts — publish to a connected account + post history (split from apps/api/src/routes/retailers/retailers-social.ts — body byte-identical)
import { decryptSecret, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  MetaApiError,
  publishLinkPost,
  publishPhotoPost,
  publishVideoPost,
} from '../../../lib/meta-graph.js';
import { resolvePostTemplate } from '../../../lib/post-template-placeholders.js';
import { buildCollectionUrl } from '../../../lib/store-urls.js';
import { isRealOwner } from '../../../plugins/auth.js';
import { AppError, forbidden, notFound, validationError } from '../../../plugins/error-handler.js';
import { publishInstagramPhoto } from './retailers-social-helpers.js';
export const retailersSocialPostsRoutes: FastifyPluginAsync = async (server) => {
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
        if (!body.data.product_id)
          throw validationError('product_id is required for SINGLE_PRODUCT');
        const product = await prisma.product.findFirst({
          where: { id: body.data.product_id, retailer_id: request.retailerId, deleted_at: null },
          select: {
            id: true,
            name: true,
            price_min: true,
            category: true,
            photos: { where: { is_primary: true }, take: 1 },
            videos: { where: { is_main: true }, take: 1 },
          },
        });
        if (!product) throw notFound('Product');
        const photo = product.photos[0];
        const video = product.videos[0];
        if (!photo && !video) throw validationError('This product has no photo to post');

        productIds = [product.id];
        const retailer = await prisma.retailer.findUnique({
          where: { id: request.retailerId },
          select: { shop_name: true, public_slug: true },
        });
        if (!caption) {
          // price_min is stored in paise (₹1500 = 150000); {price} is
          // formatted by resolvePostTemplate.
          const defaultTemplate = `₹{price} {product_name}{category}
              \r\n
              Shop the collection on WhatsApp: ${'https://kanchuki.app'}`;
          caption = resolvePostTemplate(defaultTemplate, {
            productName: product.name,
            pricePaise: product.price_min ?? undefined,
            category: product.category ?? undefined,
            storeName: retailer?.shop_name ?? undefined,
            link: retailer?.public_slug ? buildCollectionUrl(retailer.public_slug, '') : undefined,
          });
        }
        // F-033 Slice 2: a video (uploaded or Ken-Burns-generated) posts as
        // video — more engaging than a photo post — falling back to photo.
        if (account.platform === 'FACEBOOK') {
          const { postId } = video
            ? await publishVideoPost(account.platform_account_id, token, video.public_url, caption)
            : await publishPhotoPost(account.platform_account_id, token, photo!.url, caption);
          externalPostId = postId;
          externalPostUrl = `https://www.facebook.com/${account.platform_account_id}/posts/${postId}`;
        } else {
          // INSTAGRAM
          // For Instagram, we need an image URL
          if (!photo) throw validationError('Instagram posts require a photo');
          const { postId, permalink } = await publishInstagramPhoto(
            account.platform_account_id,
            token,
            photo!.url,
            caption,
          );
          externalPostId = postId;
          // Real permalink, fail-open — never fabricate /p/<media-id> (finding 3).
          externalPostUrl = permalink || null;
        }
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
          select: { public_slug: true, shop_name: true },
        });
        const link = buildCollectionUrl(retailer?.public_slug ?? null, collection.slug);

        if (!caption) {
          const defaultTemplate = `New collection: {product_name} — ₹{price}
              \r\n
              Shop ${collection.title} on WhatsApp: ${link}`;
          caption = resolvePostTemplate(defaultTemplate, {
            productName: collection.title,
            storeName: retailer?.shop_name ?? undefined,
            link: link,
          });
        }
        if (account.platform === 'FACEBOOK') {
          const { postId } = await publishLinkPost(
            account.platform_account_id,
            token,
            link,
            caption,
          );
          externalPostId = postId;
          externalPostUrl = `https://www.facebook.com/${account.platform_account_id}/posts/${postId}`;
        } else {
          // INSTAGRAM
          // Instagram doesn't support native link posts like Facebook
          // For Phase 2, we'll require image content for Instagram posts
          throw new MetaApiError(
            'Instagram link posts require image content - please use SINGLE_PRODUCT post type instead',
            400,
            'INSTAGRAM_LINK_REQUIRES_IMAGE',
          );
        }
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
      // Finding 4: only MetaApiError messages are curated user-safe text;
      // DB/network errors (hostnames, connection detail) must never leak into
      // the row or the response envelope.
      const safeMessage =
        err instanceof MetaApiError
          ? err.message
          : 'Something went wrong while posting. Please try again.';
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
