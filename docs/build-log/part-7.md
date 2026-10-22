# Kanchuki — Build Log (part 7)

> Continuation of [`../BUILD-LOG.md`](../BUILD-LOG.md) — started 2026-10-22 because part 6 passed the 150k-char doc limit. Same format: newest entries appended at the bottom.

---

## 2026-10-22 - Admin upload confirm paths verified server-side (RC-075, admin half)

**Branch:** `fix/admin-upload-verify` (stacked on `fix/security-hardening-2` / PR #143, which adds `verifyUpload`'s `prefix` option). No migration, no mobile change.

| Piece | Detail |
|---|---|
| `lib/upload-guard.ts` | `verifyUpload()` gains a prefix-only mode for admin uploads (`{ prefix }`, no `retailerId`; typed as a union so a retailer call still defaults to `retailers/<id>/`). `isOwnedKey()` returns false for an empty prefix, which would otherwise own every key. |
| Studio styles | Create/PATCH verify `thumbnail_r2_key` under `admin/studio-styles/` (10 MB, JPEG/PNG/WebP) and store the server-built `thumbnail_url`; client `thumbnail_url` input removed; `thumbnail_r2_key: null` clears both. |
| Post templates | No key column (no migration), so `thumbnail_r2_key` is an input only: verified under `admin/post-templates/`, the derived URL is stored; `null` clears; client `thumbnail_url` input removed. |
| Background images | `POST /admin/background-images` takes `r2_key` instead of `image_url` (unused `thumbnail_url` dropped), verified under `admin/background-images/` (15 MB). The tone/naming step used to `fetchImageBuffer()` the client URL server-side (SSRF); it now fetches only the server-built R2 URL. |
| Admin showcase designs | Create and photo-replace run `verifyUpload` under `showcase-designs/global/raw/` (the only prefix the admin upload-url mints; 15 MB). `/suggest` keeps a key-only check on the same prefix. Previously any `showcase-designs/*` key passed, including other retailers' raw and final objects. |
| Design references | `image_url` input removed; `r2_key` verified under `admin/design-references/` and the URL derived. No upload-url route or UI exists, so nothing mints those keys yet (`ponytail:` comment in the route). |
| Watermark logo | `PUT /settings/showcase-watermark` verifies a new `logo_r2_key` under `showcase-watermark/logo/` (5 MB) before it is saved and composited onto every design; an unchanged or `null` key skips the check. |
| Admin web | `background-images`, `post-templates`, `studio-styles` pages now send the key (`r2_key` / `thumbnail_r2_key`) instead of `public_url`. Suits-designs and watermark pages already sent keys. |
| Tests | API **2309 passed, 5 skipped** (164 files), web **688/688**, API + web `tsc` clean. New: upload-guard +2, admin-showcase-designs +2 (non-image replace deleted + not watermarked; retailer raw key refused), watermark +1 (foreign key, SVG bytes), studio-styles +2, post-templates +2. The `security.test.ts` / `admin.login.test.ts` suites mock `R2_PATHS` partially, so the admin raw prefix is computed lazily, not at import. |
| Not verified | No live R2, no browser run of the three changed admin pages. Background-images and design-references have no route-level test. |
