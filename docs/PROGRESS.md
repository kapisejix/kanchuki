# Progress Log

One file, update at end of each work session: what's done, what's next, what's blocked. Check `git log -1` and this file first thing each session.

---

## 2026-07-24 — Feature Completion: F-001d, F-009, F-010, F-011, F-012 + Docs Audit

### Features Built (accumulated, not previously logged in progress)

#### F-001d: Guided Bulk Onboarding (500–3000+ SKU stores)
- ✅ Perceptual-hash duplicate detection (`packages/ai/src/phash.ts` — 64-bit aHash, hamming distance, threshold=8)
- ✅ Migration `019_product_photo_phash` — `ProductPhoto.phash` column for crop-level perceptual hash
- ✅ Rack/shelf batch capture screen (`apps/mobile/app/product/bulk-onboard.tsx`) — location entered once per photo, running counter across sessions, inline "New rack" creation, link to supplier PDF import
- ✅ `flagDuplicates()` in `catalog-import.ts` — scans existing phashes, flags nearest match within threshold, non-blocking (retailer can still save)
- ✅ `default_section_id` + per-item `section_id` override in `bulkCreateProducts` — both validated to belong to the retailer, silently dropped if not

#### F-009: Retailer Account & Team Settings
- ✅ Full settings screen (`apps/mobile/app/settings/index.tsx`):
  - Profile editing: shop name, owner name, city, state, address line 1, GSTIN, pincode
  - Store logo upload (square crop, presigned URL to R2)
  - Account delete with "type DELETE" confirmation modal (soft-delete)
  - Subscription view + usage vs limits progress bars (F-010)
  - WhatsApp number config (10-digit validation, falls back to phone)
  - WhatsApp Business API config (bring-your-own Meta: phone number ID, access token, template)
  - KYC document upload (GST cert + Aadhar front/back, status display)
- ✅ Team/staff management (`apps/mobile/app/settings/staff.tsx`): invite by phone, list with role badges, remove with confirmation
- ✅ Migrations: `023_whatsapp_number`, `024_retailer_logo_kyc`

#### F-010: Quota & Limits System
- ✅ `plan_limits`, `retailer_limit_overrides`, `usage_counters`, `quota_addon_purchases` tables + `QuotaResourceType`/`QuotaPeriod` enums
- ✅ Migration `020_quota_system` (applied live)
- ✅ `apps/api/src/lib/quota.ts`: `checkQuota()` fails-open when no plan_limits row exists; `effectiveLimit()` checks overrides first; `periodStart()` for DAY/MONTH/LIFETIME
- ✅ `incrementUsage()` upsert on `(retailer_id, resource_type, period_start)` unique key
- ✅ Wired into: `products.ts` (PRODUCT_UPLOAD, BG_REMOVAL), `tag-product.ts` (AI_TAGGING_CALL, BG_REMOVAL), `tryon.ts` (TRY_ON), `catalog-import.ts` (IMAGE_CROP, AI_TAGGING_CALL, PRODUCT_UPLOAD)
- ✅ Admin plan-limits CRUD: `GET/PUT /admin/plan-limits` + web UI at `/admin/plan-limits`
- ✅ Admin per-retailer overrides: `GET/POST/DELETE /admin/retailers/:id/overrides` + web UI on retailer detail page
- ✅ Seed script: `seed-plan-limits.ts` — PRODUCT_UPLOAD (LIFETIME), AI_TAGGING_CALL (LIFETIME), TRY_ON (MONTH) for all 3 plans
- ✅ Retailer sees usage vs limit per resource in F-009's settings (color-coded progress bars at 80%/100%)

#### F-011: Custom Product Background Library
- ✅ `BackgroundImage` model + migration `027_product_background_images` (RLS enabled, admin-only)
- ✅ Admin panel screen (`/admin/background-images`): upload via presigned URL, toggle active/inactive
- ✅ `GET/POST/DELETE /admin/background-images` in admin.ts with R2 presigned upload URL
- ✅ `cleanupProductPhoto()` in `detector.ts` accepts optional `backgroundImageUrl` param — composites RGBA cutout onto it via `sharp.composite()`; falls through to white flat when unset
- ✅ Spin frame extraction passes the same background URL through for consistent frames
- ✅ `Product.background_image_id` nullable FK (null = white, unchanged behavior)

#### F-012: Encrypted Integration Settings
- ✅ `IntegrationSetting` model + `IntegrationCategory` enum: stores AES-256-GCM-encrypted credentials for third-party services
- ✅ `packages/db/src/secrets.ts`: `encryptSecret()`/`decryptSecret()` (AES-256-GCM via `node:crypto`), `getSecret()`/`setSecret()` for runtime lookup, `maskSecret()` for safe API returns
- ✅ `invalidateSecret()` to delete a stored integration key
- ✅ Admin panel screen at `/admin/integrations`: add/edit/delete integration settings, values masked in UI, toggle active/inactive
- ✅ `INTEGRATION_KEYS` constant in `@kanchuki/shared` — defines which keys are DB-manageable (excludes bootstrap keys like DATABASE_URL)

#### Other built features (not previously logged):
- ✅ 360-degree product spin view: spin frame extraction job, mobile slider UI, admin review
- ✅ Retailer product categories: `ProductCategory` model + migration, mobile CRUD UI, customer web category browse
- ✅ Customer collection pagination: cursor-based pagination on collection web pages
- ✅ Retailer logo/address/KYC fields: full schema + mobile upload UI + admin review
- ✅ WhatsApp Business API bulk-send: bring-your-own Meta credentials, collection bulk-send via template
- ✅ One-by-one WhatsApp share: contact-gated per-product share with prefilled message
- ✅ Public QR storefront profile: `Retailer.public_slug` + `/store/[slug]` contact gate → collection view
- ✅ F-001d features merged into catalog-import.ts pipeline
- ✅ F-006 wishlist known gap documented but not fixed (bare product IDs in localStorage — can't resolve names from unseen pages)

### Docs Audit (2026-07-24)
**Issue found:** PLAN.md and PRO-REQUIREMENTS.md had F-001d, F-009, F-010, F-011, F-012 all listed as 🔴 Not started / 🔲 Planned, when they were actually fully built.

**Fixed:**
- PLAN.md: Marked Month 4b as ✅ Completed with all 4 features. Updated F-001d checkbox to [x].
- PRO-REQUIREMENTS.md: Updated F-001d, F-009, F-010, F-011 status to ✅ Built with detailed implementation descriptions.
- PROGRESS.md: This entry.

**Still pending from the plan:**
- F-006B: Offline Catalog Browsing — researched, no code
- F-006 wishlist bug (bare product IDs in localStorage)
- Phase 0.5: SupportTicket routing, manager rollup reporting, staff Expo mode
- Phase 1+: Fashion DNA, Remote VTO, Auto-Personalized Collections
- F-302: L2 Ecommerce Checkout

**Next session:** First pending item to pick up.
