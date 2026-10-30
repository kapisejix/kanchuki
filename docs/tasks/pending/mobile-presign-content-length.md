# Mobile + web-admin clients send `content_length` on presign (RC-080 follow-up)

**Status (2026-10-24):** ✅ Merged — #151 and #152 (`0e85aea7`) are on `main`; the field is required on the server and the flag is deleted. Old app builds that omit `content_length` now get 422, so watch API logs for it. Still owner-side: device test of uploads on the new EAS build. Original status follows. 🟨 Code built 2026-10-22 (split from `security-audit-5-points.md` T3). Server `48e84013`; mobile compress -> size -> presign -> PUT `9b2ec714`; admin web `2909ec4f`; field required on the server `c4e38e25`, flag deleted (draft PR #152, `feat/require-upload-content-length`, stacked on #151). Unit tests pass (`client.upload.test.ts`, `upload-url-guard.test.ts`). **Not done:** owner R2 check below, device test on an EAS build, build rolled out to users. Do not merge #152 before that rollout: old builds send no `content_length` and would fail.
**Blocked on (owner):** run `packages/ai/scripts/check-r2-content-length.mjs` against R2 and confirm a matching PUT gives 200 and an oversized PUT gives 403. If R2 does not enforce it, stop: the post-upload `verifyUpload` stays the only guard and this task is not worth doing.

## Why it is not a one-line change
`uploadImageToR2` (`apps/mobile/src/lib/api/client.ts`) recompresses `image/jpeg` to <=80 KB right before the PUT. Callers take `blob.size` of the **uncompressed** file and send it as `size_bytes` before that. The signed length must equal the bytes actually PUT, so the order has to become: compress -> read the real size -> presign with `content_length` -> PUT that exact file with no second compression.

## Plan
1. In `client.ts`, split the compression step out of `uploadImageToR2` (e.g. `prepareImageForUpload(uri, contentType, opts) -> { uri, size }`) and let `uploadImageToR2` skip compression when handed an already-prepared file. Keep the `compress: false` opt-outs (pro pipeline, KYC) and the "compression failed, upload the original" fallback; in that case the size is the original's.
2. Add `content_length` to each presign helper in `src/lib/api/{products,categories,retailer,catalog-import,growth,showcase-designs}.ts`.
3. Update the call sites (about 15): `product/add.tsx` (x2), `bulk.tsx`, `bulk-onboard.tsx`, `catalog-import.tsx` (x2), `[id]/add-color.tsx` (x2), `[id]/add-photos.tsx`, `category/new.tsx`, `category/[id].tsx`, `settings/index.tsx` (logo, banner, KYC), `components/ReportProblem.tsx`, `growth/videos.tsx`, `showcase-designs/new.tsx` and `[id].tsx`. Videos and PDFs are not compressed, so their size is already exact.
4. Web admin upload helpers (background images, post templates, studio styles, watermark logo, showcase designs): send `content_length` = `file.size`. `fetch(blob)` sends exactly that many bytes.
5. After the EAS build with this has been out for a release: make `content_length` required on the server (drop `.optional()`, remove the unbound path and its warning in `r2.ts`).

## Tests / done when
- Unit test: `prepareImageForUpload` returns the size of the file that is then PUT (mock the compressor); a failed compression returns the original's size.
- Device (Expo Go / EAS build): add a product photo, set a logo and banner, upload a KYC doc, a catalog PDF and a product video. Each must succeed. In admin: upload a background image.
- Negative check on device is not needed; the API tests cover the server side.

## Risks
- Any path that touches the file between presign and PUT (a second manipulate, a retry that re-compresses) makes the PUT size differ and R2 answers 403 `SignatureDoesNotMatch`. The error text surfaces via `uploadImageToR2`'s existing detail message.
- Old builds keep working because the field is optional on the server.
