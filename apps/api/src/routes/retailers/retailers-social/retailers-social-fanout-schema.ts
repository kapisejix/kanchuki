// retailers-social-fanout-schema.ts — the fan-out request contract.
//
// Split out of retailers-social-fanout.ts (2026-09-17) when that module crossed
// the 800-line route-size guard. Behaviour is unchanged: this is the same
// schemas and cross-field rules, moved so the route module is readable in one
// sitting. `assertPostShape` is the single place that decides whether a body is
// a publishable shape, and it throws before any row is written.
import { z } from 'zod';
import { validationError } from '../../../plugins/error-handler.js';

// R-15: 30 publish requests per retailer per hour (each fan-out request is one
// unit regardless of target count). The DB is the record of truth; this route
// rate limit is the coarse throttle on top of the global IP limiter.
export const PUBLISH_LIMIT = { max: 30, timeWindow: 60 * 60 * 1000 };

const itemSchema = z.object({
  product_id: z.string().min(1).optional(),
  photo_id: z.string().optional(),
  video_id: z.string().optional(),
  // IMAGE posts carry the watermarked design's public URL instead of a
  // product ref (no photo/video lookup).
  image_url: z.string().url().optional(),
});

export const bodySchema = z
  .object({
    client_post_id: z.string().min(8).max(100),
    post_type: z.enum(['SINGLE_PRODUCT', 'CAROUSEL', 'COLLECTION_LINK', 'IMAGE']),
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

export type PostBody = z.infer<typeof bodySchema>;

// Cross-field rules per post_type (mirrors the composer client validation):
//   SINGLE_PRODUCT — exactly 1 product item; link resolves from items/link_*.
//   CAROUSEL       — 2..10 product items, photos only (R-10/R-16; video_id
//                    rejected).
//   COLLECTION_LINK— no items; collection_id required; link_type 'collection'.
//   IMAGE          — exactly 1 item carrying image_url, never a product ref.
export function assertPostShape(body: PostBody): void {
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
    if (items.some((i) => !i.product_id)) {
      throw validationError('Carousels need product photos — a design image can only post alone');
    }
  } else if (post_type === 'IMAGE') {
    const items = body.items ?? [];
    const imageItem = items[0];
    if (items.length !== 1 || !imageItem?.image_url) {
      throw validationError('An image post takes exactly one image URL');
    }
    if (imageItem.product_id || imageItem.photo_id || imageItem.video_id) {
      throw validationError('An image post takes a standalone image — no product media');
    }
  } else {
    const items = body.items ?? [];
    const productItem = items[0];
    if (items.length !== 1 || !productItem?.product_id) {
      throw validationError('A single product post takes exactly one product');
    }
    if (productItem.image_url) {
      throw validationError('A product post takes product media — not a standalone image');
    }
  }
}
