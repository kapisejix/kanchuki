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

## #1 — Rotate photo (revised per user follow-up)

User clarified: rotate must work on the **original uploaded photo**
specifically (not just the cleaned/composited primary), offer 4 degree
stops (90/180/270/360), and ideally be available **before** the photo is
even saved — i.e. in the add-product preview step, not only after the
product exists. This splits into two genuinely different mechanisms
because the photo lives in two different places at those two points in
time.

### 1a. Pre-save rotate (add-product preview step, `apps/mobile/app/product/add.tsx`)

At this point the photo is a local device URI — `photo` state, set after
`takePictureAsync()`, shown full-screen in the existing `step === 'preview'`
block (`add.tsx:966-994`) alongside "Retake" / "Use Photo →". It hasn't
been uploaded yet, so this is pure client-side work — no server involved,
no new dependency: `expo-image-manipulator` is already used for the exact
same rotate primitive in `apps/mobile/src/lib/compress-image.ts`.

- Keep the freshly-captured URI untouched in a ref (`rawPhotoUriRef`).
  Track `previewRotation` state, one of `0/90/180/270`, cycling forward on
  each tap of a new "Rotate" button and wrapping `270 → 0` (the user's
  "360" is the same pixels as "0" — the fourth tap visually completes the
  circle back to the original orientation, called out to the user as such
  rather than silently treated as a no-op label).
- Each tap recomputes from `rawPhotoUriRef.current` fresh — i.e.
  `ImageManipulator.manipulateAsync(rawPhotoUriRef.current, [{ rotate:
  nextDegrees }], { format: JPEG })` — rather than compounding rotations on
  top of an already-rotated file. This is free to do correctly on-device
  (single extra arg), so there's no reason to accept the accumulated JPEG
  re-encode loss that repeated relative rotation would cause.
- Result replaces the `photo` state shown in the preview and is what flows
  into "Use Photo →" → the edit step → upload, unchanged from today's
  pipeline (compression, upload-url, POST photo all operate on whatever
  `photo` currently is).
- Scope: only the single main preview photo (`step === 'preview'`). The
  Pro-mode multi-shot flow (`extraFrames`, `proUploads`) is a different
  screen with different state shape — out of scope for this pass, flagged
  as a follow-up if wanted.

### 1b. Post-save rotate — primary AND original (`apps/mobile/app/product/[id].tsx`)

Once a product exists, both the current primary photo (`photo.r2_key`) and
the preserved pre-cleanup original (`metadata.original_r2_key`, exposed to
the client as `photo.original_url` — see `products-crud.ts:210-224`) live
in R2, so rotating either requires a server round trip.

- **API** — `POST /v1/products/:id/photos/:photoId/rotate` in
  `apps/api/src/routes/products/products-media.ts`, body
  `{ target?: 'primary' | 'original' }` (default `'primary'`). Each call
  rotates 90° clockwise **relative to whatever is currently stored** at the
  target key — a single relative-rotate action, same as 1a's fourth tap
  conceptually, just invoked once per tap instead of recomputed from a
  pristine reference. (Deliberate asymmetry with 1a, called out explicitly
  rather than left implicit: server-side, snapshotting a rotation-free
  "pristine" copy purely to make repeated rotates lossless would need a new
  sibling-key-preservation mechanism — the same shape as
  `preserveOriginalPhoto()` but for a second, unrelated purpose. Four
  lossy JPEG re-encodes to complete a full circle on a garment photo is not
  a real quality problem worth that mechanism; ship the simple version,
  revisit only if a retailer actually complains about visible degradation.)
  - Ownership-scoped lookup identical to `/cleanup`
    (`prisma.productPhoto.findFirst({ id: photoId, product_id: id,
    retailer_id: request.retailerId })` → `notFound` if missing).
  - `target: 'original'` — requires `metadata.original_r2_key` to be set;
    `validationError` ("no original photo to rotate — this photo was never
    background-cleaned") if not. Downloads those bytes
    (`fetchImageBuffer`), rotates with `sharp(buf).rotate(90).jpeg()`,
    re-uploads to that same sibling key via `uploadBuffer()`. No DB
    column change (the original isn't tracked by width/height — only its
    r2_key, inside `metadata`). Response resolves the display URL the same
    way `GET /:id` does, via `photoUrlToDisplay()`
    (`products-helpers.ts`) — reused, not reimplemented.
  - `target: 'primary'` (default) — as originally designed: downloads
    `photo.url`, rotates the same way, re-uploads to `photo.r2_key`. If
    `photo.width`/`photo.height` are both set, swaps them in the DB update
    (90°/270° rotation swaps aspect).
  - Returns `{ data: { id, target, url, width?, height? } }`. No quota
    charge — not an AI or background-removal call, doesn't fit any
    existing `QuotaResourceType`, and adding one would be scope creep for
    a cheap CPU op.
- **Client** — `rotatePhoto(productId, photoId, target?: 'primary' |
  'original')` in `apps/mobile/src/lib/api/products.ts`, mirrors
  `cleanupPhoto()` (`POST`, `timeoutMs: 30_000`).
- **UI** — in `[id].tsx`, a rotate icon button next to the existing "Crop &
  remove background" pill, now shown for **both** the primary and the
  original carousel slides (the previous draft of this spec excluded the
  original slide — superseded by this revision). Target is derived from
  `currentPhotoIsOriginal`. New `rotatingPhotoId` state mirrors the
  existing `cleaningPhotoId` busy-state pattern. A small client-only label
  next to the button cycles 90°/180°/270°/0° per tap (reset each time the
  viewed photo changes) purely for user feedback — not persisted, since the
  server has no absolute-rotation column to read it back from.
  On success, reuse the existing `photoCacheBust` map (`[id].tsx:268`,
  already built for exactly this "same URL, new bytes" situation) keyed by
  `currentPhoto.id` — no new cache-busting mechanism needed for either
  slide, since the original slide's synthetic id (`${p.id}-original`) is
  already a valid `photoCacheBust` key today.

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

- API tests for the rotate route (new or extended
  `products-media.test.ts`): `target: 'primary'` happy path (mocks
  `fetchImageBuffer`/`uploadBuffer`, asserts `sharp().rotate(90)` called,
  width/height swapped when present), `target: 'original'` happy path
  (rotates the sibling key, no width/height touched),
  `target: 'original'` with no `metadata.original_r2_key` → 422, and 404
  for a photo not owned by the requesting retailer. Mirrors the existing
  `/cleanup` route's test shape.
- No new test for the background picker — it's wiring an already-tested
  endpoint into a new UI location; `add.tsx`'s existing coverage already
  proves the endpoint contract.
- Mobile UI (both the pre-save preview rotate and the post-save
  primary/original rotate + background picker) is unverifiable in this
  environment (no RN simulator — same standing limitation noted throughout
  this project's CLAUDE.md). Bar for "done": `tsc --noEmit` clean on
  `apps/mobile` and `apps/api`.

## Out of scope

- Rotating Pro-mode multi-shot preview frames (`extraFrames`/`proUploads`
  in `add.tsx`) before save — only the single main preview photo gets the
  pre-save rotate control this pass.
- A server-side pristine/lossless rotation mechanism — explicitly
  considered and rejected for this pass (see 1b rationale above); the
  simple relative-rotate is the shipped version.
- Any change to the auto-contrast (F-028) logic itself — it already works
  as the user described; nothing here touches `tag-product.ts` or
  `classifyColorTone`.
- Quota/cost tracking for rotate calls.
