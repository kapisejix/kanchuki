# Photo Rotate + Post-Save Background Picker

**Date:** 2026-08-09
**Status:** Approved, ready for implementation plan

## Context

User asked for two things on the product detail screen (`apps/mobile/app/product/[id].tsx`):

1. Rotate the currently-viewed product photo.
2. Pick a background from the admin-curated library, with auto light/dark
   contrast based on detected garment color.

Investigation found #2 is already fully built end to end — admin uploads
backdrops with a `tone` (LIGHT/DARK, auto-computed from luminance,
admin-overridable); the add-product screen (`add.tsx`) has a manual picker;
`tag-product.ts` auto-picks a contrasting-tone backdrop when the retailer
leaves it on Auto, using the AI-detected garment color
(`classifyColorTone`). Backend (`PATCH /:id/background`) and mobile client
(`productApi.setBackground()`) both already work. The only real gap: the
product **edit** screen never exposes this picker, so a retailer can't
change background after the product is saved.

Rotate does not exist anywhere in the codebase (the `RotateCw` icon present
in `[id].tsx` is used for the unrelated "View 360°" spin viewer and the
color-detect button).

## #1 — Rotate photo

Rotation must persist server-side — photos are served from R2 and read by
the customer PWA/catalog too, not just this screen, so an on-device-only
transform would silently diverge from what's stored.

- **API** — new route `POST /v1/products/:id/photos/:photoId/rotate` in
  `apps/api/src/routes/products/products-media.ts`. No request body — each
  call rotates 90° clockwise (standard single-button mobile rotate UX, no
  direction picker). Ownership-scoped lookup identical to the existing
  `/cleanup` route (`prisma.productPhoto.findFirst({ id: photoId,
  product_id: id, retailer_id: request.retailerId })` → `notFound` if
  missing). Downloads via the existing `fetchImageBuffer(photo.url)`,
  rotates with `sharp(buf).rotate(90).jpeg().toBuffer()` (sharp is already a
  dependency, used the same way in `image-compress.ts`/`detector.ts` — no
  new package), re-uploads to the **same** `r2_key` via the existing
  `uploadBuffer()`. If `photo.width`/`photo.height` are both set, swap them
  in the DB update (90°/270° rotation swaps aspect). Returns
  `{ data: { id, url, width, height } }`. No quota charge — this isn't an
  AI or background-removal call, doesn't fit any existing
  `QuotaResourceType`, and adding one would be scope creep for a cheap CPU
  op.
- **Client** — `rotatePhoto(productId, photoId)` in
  `apps/mobile/src/lib/api/products.ts`, mirrors `cleanupPhoto()` exactly
  (`POST`, `timeoutMs: 30_000`).
- **UI** — in `[id].tsx`, a rotate icon button next to the existing "Crop &
  remove background" pill (same row, same dashed-border pill style), acting
  on `displayPhotos[selectedPhotoIndex]`. New `rotatingPhotoId` state
  mirrors the existing `cleaningPhotoId` busy-state pattern (spinner
  in-button, disabled while in flight). On success, refetch the product the
  same way the existing cleanup handler does, so the carousel picks up the
  new bytes. The rotate button is hidden for variant photos and the
  original/pre-cleanup photo, same guard as the existing cleanup button
  (`!currentPhotoIsVariant && !currentPhotoIsOriginal`) — rotating a raw
  original before cleanup is out of scope for this pass, matches the
  existing cleanup button's own scoping.

**Cache note:** the URL doesn't change (same `r2_key`), which is the exact
same non-problem the existing `/cleanup` route already has and already
ships with — no new cache-busting mechanism needed, consistent with
existing behavior.

## #2 — Background picker on the edit screen

No backend or API-client changes — `PATCH /:id/background` and
`productApi.setBackground()` already exist and are already exercised by
`add.tsx`. This is a UI-only addition to `[id].tsx`:

- Fetch `productApi.getBackgroundImages()` on mount (same call `add.tsx`
  makes; already cached client-side for 60s via `getCacheTtlMs`).
- Render the same chip row pattern as `add.tsx:1046-1067` — a "White" chip
  (`background_image_id: null`) plus one thumbnail chip per active
  background, selected state driven by local state initialized from
  `product.background_image_id`.
- On tap: call `productApi.setBackground(product.id, bgId)`, show a
  spinner on the tapped chip while in flight (new `changingBackground`
  boolean, or reuse the chip's own `bgId` as the busy key), then merge the
  response (`background_image_id`, `photo_url`) into local product state
  and refetch so the carousel shows the recomposited primary photo.
- No new feature-flag check needed: `getBackgroundImages()` already returns
  `[]` when the retailer's plan lacks `CUSTOM_BACKGROUND_LIBRARY`, so the
  row naturally disappears — identical to how `add.tsx` already handles
  this.
- Place the row near the existing "Crop & remove background" section so
  both photo-editing actions live together.

## Testing

- One new API test in `apps/api/src/routes/products/products-media.test.ts`
  (or the existing products test file covering this route) for the rotate
  endpoint: happy path (mocks `fetchImageBuffer`/`uploadBuffer`, asserts
  `sharp.rotate` called, width/height swapped when present) + 404 for a
  photo not owned by the requesting retailer. Mirrors the existing
  `/cleanup` route's test shape.
- No new test for the background picker — it's wiring an already-tested
  endpoint into a new UI location; `add.tsx`'s existing coverage already
  proves the endpoint contract.
- Mobile UI changes are unverifiable in this environment (no RN
  simulator — same standing limitation noted throughout this project's
  CLAUDE.md). Bar for "done": `tsc --noEmit` clean on `apps/mobile` and
  `apps/api`.

## Out of scope

- Rotating the raw/original (pre-cleanup) photo — matches the existing
  cleanup button's own scope boundary, not a new restriction invented for
  this feature.
- A direction/angle picker for rotate — single 90°-clockwise-per-tap only.
- Any change to the auto-contrast (F-028) logic itself — it already works
  as the user described; nothing here touches `tag-product.ts` or
  `classifyColorTone`.
- Quota/cost tracking for rotate calls.
