# Photo Rotate + Post-Save Background Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a retailer rotate a product photo (both the pre-cleanup original and the current primary) in 90° steps, from both the pre-save add-product preview and the post-save product-detail screen, and pick a background from the admin library on the post-save screen (the endpoint already exists — this wires an already-working API into a UI location that never called it).

**Architecture:** Two independent mechanisms for rotate, split by where the photo bytes live at the time: pure client-side `expo-image-manipulator` before save (photo is still a local device URI), and one new thin server route (`sharp`-backed, via a new `rotateImage()` utility in `@kanchuki/ai`) after save (photo lives in R2). The background picker is UI-only — `PATCH /:id/background` and `productApi.setBackground()` already exist and work, `add.tsx` already proves the contract.

**Tech Stack:** Fastify + Prisma + sharp (apps/api, packages/ai), React Native + Expo (`expo-image-manipulator`, already a dependency) + React Query (apps/mobile), Vitest.

## Global Constraints

- No quota charge for rotate — not an AI or `BG_REMOVAL` call, doesn't fit any existing `QuotaResourceType` (spec, #1b).
- Rotate is always a fixed 90° clockwise step per action — no direction/angle picker (spec, "Out of scope").
- Server-side rotate is relative to whatever bytes are currently stored at the target key — no pristine-snapshot/lossless mechanism (spec, #1b rationale). Client-side (pre-save) rotate recomputes fresh from the untouched captured URI each tap — no compounding loss there, since it's free to do correctly on-device (spec, #1a).
- Background picker gates itself via `getBackgroundImages()` returning `[]` when the retailer's plan lacks `CUSTOM_BACKGROUND_LIBRARY` — no new feature-flag check needed anywhere (spec, #2).
- Mobile UI changes are unverifiable in this environment (no RN simulator). Bar for "done" on every mobile task: `pnpm --filter mobile exec tsc --noEmit` clean.

---

## Task 1: `rotateImage()` utility (`packages/ai`)

**Files:**
- Create: `packages/ai/src/image-rotate.ts`
- Create: `packages/ai/src/image-rotate.test.ts`
- Modify: `packages/ai/src/index.ts` (add barrel export)

**Interfaces:**
- Produces: `rotateImage(input: Buffer, degrees: number): Promise<{ buffer: Buffer; width: number; height: number }>` — exported from `@kanchuki/ai` (via the barrel), consumed by Task 2's API route.

- [x] **Step 1: Write the failing test**

Create `packages/ai/src/image-rotate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { rotateImage } from './image-rotate.js'

function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer()
}

describe('rotateImage', () => {
  it('rotates 90° and swaps width/height', async () => {
    const src = await makeJpeg(100, 60)
    const result = await rotateImage(src, 90)
    expect(result.width).toBe(60)
    expect(result.height).toBe(100)
    const meta = await sharp(result.buffer).metadata()
    expect(meta.width).toBe(60)
    expect(meta.height).toBe(100)
  })

  it('rotates 180° and keeps width/height unchanged', async () => {
    const src = await makeJpeg(100, 60)
    const result = await rotateImage(src, 180)
    expect(result.width).toBe(100)
    expect(result.height).toBe(60)
  })

  it('rotates 270° and swaps width/height', async () => {
    const src = await makeJpeg(100, 60)
    const result = await rotateImage(src, 270)
    expect(result.width).toBe(60)
    expect(result.height).toBe(100)
  })

  it('rotate 0 returns a valid same-dimension JPEG', async () => {
    const src = await makeJpeg(100, 60)
    const result = await rotateImage(src, 0)
    expect(result.width).toBe(100)
    expect(result.height).toBe(60)
    const meta = await sharp(result.buffer).metadata()
    expect(meta.format).toBe('jpeg')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kanchuki/ai exec vitest run src/image-rotate.test.ts`
Expected: FAIL — `Cannot find module './image-rotate.js'`

- [x] **Step 3: Write minimal implementation**

Create `packages/ai/src/image-rotate.ts`:

```ts
/**
 * Rotates an image buffer by a multiple of 90 degrees, re-encoding as JPEG.
 * Used both for the post-save product-photo rotate route (apps/api) and
 * nowhere else client-side — the pre-save add-product flow rotates locally
 * via expo-image-manipulator instead, since that photo hasn't reached R2 yet.
 */

// Lazy import — same reason as image-compress.ts/detector.ts: sharp's native
// dlopen can crash on Windows+pnpm when loaded eagerly.
let _sharp: any = null
async function getSharp() {
  if (!_sharp) {
    const mod = await import('sharp')
    _sharp = mod.default ?? mod
  }
  return _sharp
}

export async function rotateImage(
  input: Buffer,
  degrees: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const s = await getSharp()
  const { data, info } = await s(input)
    .rotate(degrees)
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })
  return { buffer: data, width: info.width, height: info.height }
}
```

- [x] **Step 4: Export from the package barrel**

Modify `packages/ai/src/index.ts` — add one line to the existing list of `export *` statements:

```ts
export * from './image-rotate.js';
```

- [x] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @kanchuki/ai exec vitest run src/image-rotate.test.ts`
Expected: PASS (4 tests)

- [x] **Step 6: Commit**

```bash
git add packages/ai/src/image-rotate.ts packages/ai/src/image-rotate.test.ts packages/ai/src/index.ts
git commit -m "feat(ai): add rotateImage() sharp utility"
```

---

## Task 2: Backend rotate route (`apps/api`)

**Files:**
- Modify: `apps/api/src/routes/products/products-media.ts`
- Modify: `apps/api/src/routes/products.test.ts` (extends existing mock scaffolding)

**Interfaces:**
- Consumes: `rotateImage(buffer, degrees)` from Task 1; `photoUrlToDisplay(photo)` (already exported from `./products-helpers.js`); `fetchImageBuffer`/`uploadBuffer` (already imported in this file from `@kanchuki/ai`).
- Produces: `POST /v1/products/:id/photos/:photoId/rotate` — body `{ target?: 'primary' | 'original' }` (default `'primary'`), response `{ data: { id: string; target: 'primary' | 'original'; url: string; width?: number; height?: number } }`. Consumed by Task 3's mobile client.

- [x] **Step 1: Write the failing tests**

Modify `apps/api/src/routes/products.test.ts`. First extend the existing hoisted-mocks block (around line 6-27) to add photo-level mocks and a presigned-URL mock:

```ts
const {
  mockProductFindFirst,
  mockProductFindMany,
  mockProductUpdate,
  mockProductDelete,
  mockPhotoFindFirst,
  mockPhotoUpdate,
  mockFetchImageBuffer,
  mockUploadBuffer,
  mockRotateImage,
  mockGetDownloadPresignedUrl,
  MockPrismaClientKnownRequestError,
} = vi.hoisted(() => {
  class MockPrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    mockProductFindFirst: vi.fn(),
    mockProductFindMany: vi.fn(),
    mockProductUpdate: vi.fn(),
    mockProductDelete: vi.fn(),
    mockPhotoFindFirst: vi.fn(),
    mockPhotoUpdate: vi.fn(),
    mockFetchImageBuffer: vi.fn(),
    mockUploadBuffer: vi.fn(),
    mockRotateImage: vi.fn(),
    mockGetDownloadPresignedUrl: vi.fn(),
    MockPrismaClientKnownRequestError,
  };
});
```

Then update the `@kanchuki/db` mock's `prisma` object (around line 31-41) to add `productPhoto`:

```ts
vi.mock('@kanchuki/db', () => ({
  vaultDelete: vi.fn(),
  prisma: {
    product: {
      findFirst: mockProductFindFirst,
      findMany: mockProductFindMany,
      update: mockProductUpdate,
      delete: mockProductDelete,
      count: vi.fn(),
    },
    productPhoto: {
      findFirst: mockPhotoFindFirst,
      update: mockPhotoUpdate,
    },
    retailer: { findUniqueOrThrow: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  getPurgePrisma: () => ({
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    product: { delete: mockProductDelete },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  }),
  Prisma: { PrismaClientKnownRequestError: MockPrismaClientKnownRequestError },
}));
```

And replace the `@kanchuki/ai` mock (around line 52-62) to wire the hoisted fns in and add `rotateImage`:

```ts
vi.mock('@kanchuki/ai', () => ({
  cleanupProductPhoto: vi.fn(),
  fetchImageBuffer: mockFetchImageBuffer,
  getDownloadPresignedUrl: mockGetDownloadPresignedUrl,
  getUploadPresignedUrl: vi.fn(),
  publicUrl: vi.fn(),
  uploadBuffer: mockUploadBuffer,
  rotateImage: mockRotateImage,
  MATCH_SIMILARITY_THRESHOLD: 0.9,
  MIN_CONFIDENCE_FOR_MATCHING: 0.5,
  detectColor: vi.fn(),
}));
```

Now append a new `describe` block at the end of the file:

```ts
describe('POST /products/:id/photos/:photoId/rotate', () => {
  it('rotates the primary photo 90°, swaps stored width/height', async () => {
    mockPhotoFindFirst.mockResolvedValue({
      id: 'photo_1',
      product_id: 'prod_1',
      retailer_id: RETAILER_ID,
      url: 'https://cdn.example.com/p.jpg',
      r2_key: 'products/prod_1/p.jpg',
      width: 800,
      height: 600,
      metadata: null,
    });
    mockFetchImageBuffer.mockResolvedValue(Buffer.from('raw'));
    mockRotateImage.mockResolvedValue({ buffer: Buffer.from('rotated'), width: 600, height: 800 });
    mockUploadBuffer.mockResolvedValue(undefined);
    mockPhotoUpdate.mockResolvedValue({});

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/rotate',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toMatchObject({ id: 'photo_1', target: 'primary', width: 600, height: 800 });
    expect(mockRotateImage).toHaveBeenCalledWith(Buffer.from('raw'), 90);
    expect(mockUploadBuffer).toHaveBeenCalledWith('products/prod_1/p.jpg', Buffer.from('rotated'), 'image/jpeg');
    expect(mockPhotoUpdate).toHaveBeenCalledWith({
      where: { id: 'photo_1' },
      data: { width: 600, height: 800 },
    });
  });

  it('rotates the preserved original, leaving primary width/height untouched', async () => {
    mockPhotoFindFirst.mockResolvedValue({
      id: 'photo_1',
      product_id: 'prod_1',
      retailer_id: RETAILER_ID,
      url: 'https://cdn.example.com/p.jpg',
      r2_key: 'products/prod_1/p.jpg',
      width: 800,
      height: 600,
      metadata: { original_r2_key: 'products/prod_1/p-original.jpg' },
    });
    mockGetDownloadPresignedUrl.mockResolvedValue('https://signed.example.com/original.jpg');
    mockFetchImageBuffer.mockResolvedValue(Buffer.from('raw-original'));
    mockRotateImage.mockResolvedValue({ buffer: Buffer.from('rotated-original'), width: 600, height: 800 });
    mockUploadBuffer.mockResolvedValue(undefined);

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/rotate',
      payload: { target: 'original' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toMatchObject({ id: 'photo_1', target: 'original', url: 'https://signed.example.com/original.jpg' });
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      'products/prod_1/p-original.jpg',
      Buffer.from('rotated-original'),
      'image/jpeg',
    );
    expect(mockPhotoUpdate).not.toHaveBeenCalled();
  });

  it('422s when target=original has no preserved original', async () => {
    mockPhotoFindFirst.mockResolvedValue({
      id: 'photo_1',
      product_id: 'prod_1',
      retailer_id: RETAILER_ID,
      url: 'https://cdn.example.com/p.jpg',
      r2_key: 'products/prod_1/p.jpg',
      width: 800,
      height: 600,
      metadata: null,
    });

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/rotate',
      payload: { target: 'original' },
    });

    expect(res.statusCode).toBe(422);
  });

  it('404s for a photo not owned by the requesting retailer', async () => {
    mockPhotoFindFirst.mockResolvedValue(null);

    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod_1/photos/photo_1/rotate',
      payload: {},
    });

    expect(res.statusCode).toBe(404);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kanchuki/api exec vitest run src/routes/products.test.ts -t "rotate"`
Expected: FAIL — all 4 new tests get 404 (route doesn't exist yet)

- [x] **Step 3: Implement the route**

Modify `apps/api/src/routes/products/products-media.ts`. First, update the two import blocks at the top of the file:

```ts
import {
  cleanupProductPhoto,
  fetchImageBuffer,
  getUploadPresignedUrl,
  publicUrl,
  rotateImage,
  uploadBuffer,
} from '@kanchuki/ai';
```

```ts
import {
  ALLOWED_MIME_TYPES,
  ALLOWED_SPIN_VIDEO_MIME_TYPES,
  type AllowedMime,
  MAX_SPIN_VIDEO_BYTES,
  photoUrlToDisplay,
} from './products-helpers.js';
```

Then add the new route, right after the existing `/:id/photos/:photoId/cleanup` route (after its closing `});` around line 148):

```ts
  // ─── POST /products/:id/photos/:photoId/rotate ─────────────────────
  // Rotates 90° clockwise, relative to whatever is currently stored at the
  // target key — not a lossless/pristine-tracked rotation (see design spec
  // docs/superpowers/specs/2026-08-09-photo-rotate-and-background-picker-design.md
  // for why that tradeoff was deliberate). target='original' rotates the
  // preserved pre-cleanup upload (metadata.original_r2_key, written by
  // preserveOriginalPhoto() in lib/photo-cleanup.ts); target='primary'
  // (default) rotates the current photo.r2_key. No quota charge — cheap CPU
  // op, not an AI/BG_REMOVAL call.
  server.post('/:id/photos/:photoId/rotate', async (request, reply) => {
    const { id, photoId } = request.params as { id: string; photoId: string };

    const photo = await prisma.productPhoto.findFirst({
      where: { id: photoId, product_id: id, retailer_id: request.retailerId },
    });
    if (!photo) throw notFound('Product photo');

    const body = z
      .object({ target: z.enum(['primary', 'original']).optional() })
      .safeParse(request.body ?? {});
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const target = body.data.target ?? 'primary';

    if (target === 'original') {
      const meta = (photo.metadata as Record<string, unknown> | null) ?? {};
      const originalR2Key = meta.original_r2_key;
      if (typeof originalR2Key !== 'string') {
        throw validationError(
          'No original photo to rotate — this photo was never background-cleaned',
        );
      }
      try {
        const sourceUrl = await photoUrlToDisplay({ url: '', r2_key: originalR2Key });
        const raw = await fetchImageBuffer(sourceUrl ?? '');
        const rotated = await rotateImage(raw, 90);
        await uploadBuffer(originalR2Key, rotated.buffer, 'image/jpeg');
        const url = await photoUrlToDisplay({ url: '', r2_key: originalR2Key });
        return reply.status(200).send({ data: { id: photo.id, target, url: url ?? '' } });
      } catch (err) {
        console.error('Photo rotate failed:', err);
        throw validationError('Photo storage is not configured. Please contact support.');
      }
    }

    try {
      const raw = await fetchImageBuffer(photo.url);
      const rotated = await rotateImage(raw, 90);
      await uploadBuffer(photo.r2_key, rotated.buffer, 'image/jpeg');
      const url = (await photoUrlToDisplay({ url: photo.url, r2_key: photo.r2_key })) ?? photo.url;

      let width: number | undefined;
      let height: number | undefined;
      if (photo.width != null && photo.height != null) {
        width = rotated.width;
        height = rotated.height;
        await prisma.productPhoto.update({ where: { id: photoId }, data: { width, height } });
      }

      return reply.status(200).send({ data: { id: photo.id, target, url, width, height } });
    } catch (err) {
      console.error('Photo rotate failed:', err);
      throw validationError('Photo storage is not configured. Please contact support.');
    }
  });

```

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kanchuki/api exec vitest run src/routes/products.test.ts`
Expected: PASS — all tests in the file, including the 4 new ones (the full file run, not just `-t rotate`, confirms the mock changes didn't break the pre-existing describe blocks)

- [x] **Step 5: Commit**

```bash
git add apps/api/src/routes/products/products-media.ts apps/api/src/routes/products.test.ts
git commit -m "feat(api): add POST /products/:id/photos/:photoId/rotate"
```

---

## Task 3: Mobile API client (`apps/mobile`)

**Files:**
- Modify: `apps/mobile/src/lib/api/products.ts`

**Interfaces:**
- Consumes: `POST /v1/products/:id/photos/:photoId/rotate` from Task 2.
- Produces: `productApi.rotatePhoto(productId: string, photoId: string, target?: 'primary' | 'original'): Promise<{ data: { id: string; target: 'primary' | 'original'; url: string; width?: number; height?: number } }>`. Consumed by Task 4.

- [ ] **Step 1: Add the client method**

Modify `apps/mobile/src/lib/api/products.ts` — add right after the existing `setBackground` method (around line 126):

```ts
  rotatePhoto: (productId: string, photoId: string, target: 'primary' | 'original' = 'primary') =>
    request<{
      data: { id: string; target: 'primary' | 'original'; url: string; width?: number; height?: number };
    }>(`/v1/products/${productId}/photos/${photoId}/rotate`, {
      method: 'POST',
      body: JSON.stringify({ target }),
      timeoutMs: 30_000,
    }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter mobile exec tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/lib/api/products.ts
git commit -m "feat(mobile): add productApi.rotatePhoto client"
```

---

## Task 4: Post-save UI — rotate button (`apps/mobile/app/product/[id].tsx`)

**Files:**
- Modify: `apps/mobile/app/product/[id].tsx`

**Interfaces:**
- Consumes: `productApi.rotatePhoto()` from Task 3; existing `currentPhoto`, `currentPhotoIsOriginal`, `displayPhotos`, `selectedPhotoIndex`, `photoCacheBust`/`setPhotoCacheBust`, `showError`, `queryClient` (all already defined in this file).
- Produces: nothing consumed elsewhere — leaf UI change.

- [ ] **Step 1: Add busy-state and rotation-label state**

Modify `apps/mobile/app/product/[id].tsx` — add next to the existing `cleaningPhotoId` state (around line 94-95):

```ts
  const [cleaningPhotoId, setCleaningPhotoId] = useState<string | null>(null)
  const [rotatingPhotoId, setRotatingPhotoId] = useState<string | null>(null)
  const [rotationLabels, setRotationLabels] = useState<Record<string, 90 | 180 | 270 | 360>>({})
  const [photoCacheBust, setPhotoCacheBust] = useState<Record<string, number>>({})
```

- [ ] **Step 2: Add the rotate handler**

Modify `apps/mobile/app/product/[id].tsx` — add right after the existing `handleCleanupPhoto` function (around line 602):

```ts
  const handleRotatePhoto = async (photo: { id: string }, isOriginal: boolean) => {
    if (!product) return
    setRotatingPhotoId(photo.id)
    try {
      // photo.id for the original slide is the synthetic `${realId}-original`
      // (see displayPhotos above) — strip the suffix for the API call, which
      // takes the real ProductPhoto id plus a target selector.
      const realId = isOriginal ? photo.id.replace(/-original$/, '') : photo.id
      await productApi.rotatePhoto(product.id, realId, isOriginal ? 'original' : 'primary')
      setPhotoCacheBust((prev) => ({ ...prev, [photo.id]: Date.now() }))
      setRotationLabels((prev) => {
        const current = prev[photo.id] ?? 360
        const next = current === 360 ? 90 : ((current + 90) as 90 | 180 | 270 | 360)
        return { ...prev, [photo.id]: next }
      })
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
    } catch (err) {
      showError(err, 'Failed to rotate photo')
    } finally {
      setRotatingPhotoId(null)
    }
  }
```

- [ ] **Step 3: Add the rotate button to the UI**

Modify `apps/mobile/app/product/[id].tsx` — replace the existing "Manual crop + white-background cleanup" block (lines 1073-1091) with a two-button row that keeps the cleanup button (still hidden for the original slide, unchanged) and adds a rotate button shown for both the primary and original slides:

```tsx
      {/* Manual crop + white-background cleanup for the currently viewed photo,
          plus rotate — rotate works on both the primary and the original slide,
          cleanup only makes sense on the primary. */}
      {displayPhotos[selectedPhotoIndex] && !currentPhotoIsVariant && (
        <View className="mx-4 mt-2 flex-row gap-2">
          {!currentPhotoIsOriginal && (
            <AnimatedPressable
              onPress={() => void handleCleanupPhoto(displayPhotos[selectedPhotoIndex]!.id)}
              disabled={cleaningPhotoId !== null}
              className="flex-1 flex-row items-center justify-center gap-1.5 border border-dashed border-ink-300 rounded-xl py-2"
            >
              {cleaningPhotoId === displayPhotos[selectedPhotoIndex]?.id ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (
                <Wand2 size={14} color={primaryColor} />
              )}
              <Text className="text-ink-700 text-xs font-medium">
                {cleaningPhotoId === displayPhotos[selectedPhotoIndex]?.id
                  ? 'Cleaning up...'
                  : 'Crop & remove background'}
              </Text>
            </AnimatedPressable>
          )}
          <AnimatedPressable
            onPress={() =>
              void handleRotatePhoto(displayPhotos[selectedPhotoIndex]!, currentPhotoIsOriginal)
            }
            disabled={rotatingPhotoId !== null}
            className="flex-1 flex-row items-center justify-center gap-1.5 border border-dashed border-ink-300 rounded-xl py-2"
            accessibilityLabel="Rotate photo 90 degrees"
            accessibilityRole="button"
          >
            {rotatingPhotoId === displayPhotos[selectedPhotoIndex]?.id ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <RotateCw size={14} color={primaryColor} />
            )}
            <Text className="text-ink-700 text-xs font-medium">
              {rotatingPhotoId === displayPhotos[selectedPhotoIndex]?.id
                ? 'Rotating...'
                : rotationLabels[displayPhotos[selectedPhotoIndex]!.id]
                  ? `Rotate (${rotationLabels[displayPhotos[selectedPhotoIndex]!.id]}°)`
                  : 'Rotate'}
            </Text>
          </AnimatedPressable>
        </View>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter mobile exec tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/product/\[id\].tsx
git commit -m "feat(mobile): rotate button on product detail — primary + original photo"
```

---

## Task 5: Post-save UI — background picker (`apps/mobile/app/product/[id].tsx`)

**Files:**
- Modify: `apps/mobile/app/product/[id].tsx`
- Modify: `apps/mobile/src/components/product-detail/types.ts`

**Interfaces:**
- Consumes: `productApi.getBackgroundImages()` and `productApi.setBackground()` (both already exist in `apps/mobile/src/lib/api/products.ts:112-126`, no changes needed).
- Produces: nothing consumed elsewhere — leaf UI change.

- [ ] **Step 1: Add `background_image_id` to the Product type**

Modify `apps/mobile/src/components/product-detail/types.ts` — add one field to `Product` (it's already returned by `GET /products/:id`, a plain scalar column on the model, just never typed on the client):

```ts
export type Product = {
  id: string
  name: string | null
  sku: string | null
  description: string | null
  subtype: string | null
  category: string | null
  category_id: string | null
  background_image_id: string | null
  product_type: string | null
```

- [ ] **Step 2: Fetch the background library + track selection state**

Modify `apps/mobile/app/product/[id].tsx` — add state next to `rotationLabels` from Task 4:

```ts
  const [backgroundImages, setBackgroundImages] = useState<
    { id: string; name: string; image_url: string; thumbnail_url: string | null }[]
  >([])
  const [editedBackgroundId, setEditedBackgroundId] = useState<string | null>(null)
  const [backgroundSaving, setBackgroundSaving] = useState(false)

  useEffect(() => {
    productApi
      .getBackgroundImages()
      .then((res) => setBackgroundImages(res.data))
      .catch(() => {}) // ponytail: best-effort — picker just stays empty (white-only)
  }, [])
```

Then, in the existing field-hydration `useEffect` (the one that sets `price`/`location`/`notes`/etc., around line 445-478), add one line alongside the other `setEdited*` calls:

```ts
    setEditedCategoryId(product.category_id)
    setEditedBackgroundId(product.background_image_id)
    setEditedName(product.name ?? '')
```

- [ ] **Step 3: Add the change-background handler**

Modify `apps/mobile/app/product/[id].tsx` — add right after `handleRotatePhoto` from Task 4:

```ts
  const handleSetBackground = async (backgroundId: string | null) => {
    if (!product || backgroundSaving) return
    setBackgroundSaving(true)
    try {
      const res = await productApi.setBackground(product.id, backgroundId)
      setEditedBackgroundId(res.data.background_image_id)
      setPhotoCacheBust((prev) => {
        const primary = product.photos.find((p) => p.is_primary)
        return primary ? { ...prev, [primary.id]: Date.now() } : prev
      })
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
    } catch (err) {
      showError(err, 'Failed to change background')
    } finally {
      setBackgroundSaving(false)
    }
  }
```

- [ ] **Step 4: Add the picker UI**

Modify `apps/mobile/app/product/[id].tsx` — add right after the two-button rotate/cleanup row built in Task 4 Step 3:

```tsx
      {backgroundImages.length > 0 && (
        <View className="mx-4 mt-3 bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Background
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              <AnimatedPressable
                onPress={() => void handleSetBackground(null)}
                disabled={backgroundSaving}
                className={`w-16 h-16 rounded-xl items-center justify-center border-2 bg-white ${
                  editedBackgroundId === null ? 'border-ink-600' : 'border-sand-200'
                }`}
              >
                <Text className="text-[10px] text-sand-500">Auto</Text>
              </AnimatedPressable>
              {backgroundImages.map((bg) => (
                <AnimatedPressable
                  key={bg.id}
                  onPress={() => void handleSetBackground(bg.id)}
                  disabled={backgroundSaving}
                  className={`w-16 h-16 rounded-xl overflow-hidden border-2 ${
                    editedBackgroundId === bg.id ? 'border-ink-600' : 'border-sand-200'
                  }`}
                >
                  <Image
                    source={{ uri: bg.thumbnail_url ?? bg.image_url }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                </AnimatedPressable>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter mobile exec tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/product/\[id\].tsx apps/mobile/src/components/product-detail/types.ts
git commit -m "feat(mobile): background picker on product detail screen"
```

---

## Task 6: Pre-save UI — rotate in add-product preview (`apps/mobile/app/product/add.tsx`)

**Files:**
- Modify: `apps/mobile/app/product/add.tsx`

**Interfaces:**
- Consumes: `ImageManipulator` (already imported in this file, line 17).
- Produces: nothing consumed elsewhere — leaf UI change, purely local state feeding the existing `photo` state that the rest of the add-product pipeline already reads.

- [ ] **Step 1: Track the untouched captured URI and rotation step**

Modify `apps/mobile/app/product/add.tsx` — add next to the existing `photo` state (around line 85):

```ts
  const [photo, setPhoto] = useState<string | null>(null)
  // The pristine, never-rotated capture — rotate always recomputes from this,
  // not from the currently-displayed `photo`, so 4 taps back to "360°" isn't
  // a 4x lossy re-encode (see spec §1a for why this differs from the
  // post-save server-side rotate, which does accept that tradeoff).
  const rawPhotoUriRef = useRef<string | null>(null)
  const [previewRotation, setPreviewRotation] = useState<90 | 180 | 270 | 360 | null>(null)
```

- [ ] **Step 2: Seed the ref whenever a fresh photo is captured**

Modify `apps/mobile/app/product/add.tsx` — in `processPhoto` (around line 182-198), reset the ref and rotation on every fresh capture:

```ts
  const processPhoto = async (uri: string) => {
    try {
      // Compress to target < 500KB
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      )
      // This is the single-photo flow — a stale pro-path result must not
      // leak into the save (handleSave prefers proUploads[0] when set).
      setProUploads([])
      rawPhotoUriRef.current = compressed.uri
      setPreviewRotation(null)
      setPhoto(compressed.uri)
      setStep('preview')
    } catch (err) {
      showError(err, 'Could not process that photo. Try again.', 'Photo Error')
    }
  }
```

- [ ] **Step 3: Add the rotate handler**

Modify `apps/mobile/app/product/add.tsx` — add right after `processPhoto`:

```ts
  const handleRotatePreviewPhoto = async () => {
    if (!rawPhotoUriRef.current) return
    const next = previewRotation === null ? 90 : previewRotation === 360 ? 90 : ((previewRotation + 90) as 90 | 180 | 270 | 360)
    try {
      if (next === 360) {
        // Full circle — same pixels as the untouched capture, no re-encode needed.
        setPhoto(rawPhotoUriRef.current)
      } else {
        const rotated = await ImageManipulator.manipulateAsync(
          rawPhotoUriRef.current,
          [{ rotate: next }],
          { format: ImageManipulator.SaveFormat.JPEG },
        )
        setPhoto(rotated.uri)
      }
      setPreviewRotation(next)
    } catch (err) {
      showError(err, 'Could not rotate photo', 'Photo Error')
    }
  }
```

- [ ] **Step 4: Add the rotate button to the preview step**

Modify `apps/mobile/app/product/add.tsx` — the preview step block (around line 966-994). Replace the two-button `Retake`/`Use Photo →` row with a three-button row:

```tsx
  if (step === 'preview') {
    return (
      <View className="flex-1 bg-black">
        {photo && (
          <Image
            source={{ uri: photo }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
          />
        )}
        <View className="absolute bottom-12 left-0 right-0 flex-row gap-3 px-6">
          <AnimatedPressable
            onPress={() => {
              setPhoto(null)
              setExtraFrames([])
              setProUploads([])
              setStep('camera')
            }}
            className="flex-1 bg-white/20 py-4 rounded-2xl items-center"
          >
            <Text className="text-white font-semibold">Retake</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => void handleRotatePreviewPhoto()}
            className="flex-1 bg-white/20 py-4 rounded-2xl items-center"
            accessibilityLabel="Rotate photo 90 degrees"
            accessibilityRole="button"
          >
            <Text className="text-white font-semibold">
              {previewRotation ? `Rotate (${previewRotation}°)` : 'Rotate'}
            </Text>
          </AnimatedPressable>
          <View className="flex-1">
            <GradientButton label='Use Photo →' onPress={() => setStep('edit')} />
          </View>
        </View>
      </View>
    )
  }
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter mobile exec tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/product/add.tsx
git commit -m "feat(mobile): rotate photo before save in add-product preview"
```
