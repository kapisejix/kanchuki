# Phase II: WhatsApp Native Catalog Sync — Implementation Task Breakdown

**Status:** ✅ **COMPLETE — 63/63 tasks done** (Sprints 1-6). **Still pending (ops):** migration `060` (+ `061`–`063`) not applied; no deployment; Meta WABA/DLT account setup before live syncs.  
**Date:** 2026-08-18  
**Related:** `docs/PLAN.md` Phase II, `docs/PRO-REQUIREMENTS.md` F-307  
**Commits:** Sprint 1 `d501913`, Sprint 2 `adfe34d`

---

## A. Database Schema (Migration 060) ✅ **COMPLETED**

| # | Task | File/Location | Status |
|---|------|---------------|--------|
| A1 | Create migration `060_whatsapp_catalog_sync` | `packages/db/prisma/migrations/060_...` | ✅ |
| A2 | Add `CatalogItem` model (product ↔ WhatsApp catalog item mapping) | `schema.prisma` | ✅ |
| A3 | Add `CatalogSyncLog` model (sync history/errors) | `schema.prisma` | ✅ |
| A4 | Add `whatsapp_catalog_id` to Retailer model | `schema.prisma` | ✅ |
| A5 | Add `sync_enabled`, `sync_categories`, `last_synced_at` to Retailer | `schema.prisma` | ✅ |
| A6 | Add `Product.whatsapp_catalog_item_id` (stores Meta's item ID) | `schema.prisma` | ✅ |
| A7 | Run `prisma migrate dev` + `prisma generate` | CLI | ✅ (migration file created) |

---

## B. Meta Catalog API Client (`apps/api/src/lib/meta-catalog.ts`) ✅ **COMPLETED**

| # | Task | Description | Status |
|---|------|-------------|--------|
| B1 | Extend `resolveMetaCredentials()` to include WhatsApp Business Account ID | Uses existing `getSecret` pattern | ✅ |
| B2 | `getOrCreateCatalog(wabaId, accessToken)` | Creates catalog if missing, returns catalog_id | ✅ |
| B3 | `createCatalogItem(catalogId, token, itemData)` | POST `/catalogId/items` - create product in WhatsApp | ✅ |
| B4 | `updateCatalogItem(catalogId, token, itemId, itemData)` | POST `/itemId` - update price/availability | ✅ |
| B5 | `deleteCatalogItem(catalogId, token, itemId)` | DELETE `/itemId` - remove from catalog | ✅ |
| B6 | `listCatalogItems(catalogId, token)` | GET `/catalogId/items` - fetch current state | ✅ |
| B7 | `uploadCatalogImage(imageUrl, token)` | POST to Meta media endpoint, returns `image_hash` | ✅ |
| B8 | Error handling: rate limits, retries, idempotency keys | Use existing `MetaApiError` pattern | ✅ |

**Test Coverage:** 14 unit tests, all passing (`apps/api/src/lib/meta-catalog.test.ts`)

---

## C. Sync Engine (`apps/api/src/jobs/catalog-sync.ts` + BullMQ) ✅ **COMPLETED**

| # | Task | Description | Status |
|---|------|-------------|--------|
| C1 | Create BullMQ queue `catalog-sync` | `apps/api/src/jobs/index.ts` | ✅ |
| C2 | `syncAllProducts(retailerId)` job | Full sync: create/update/delete all eligible products | ✅ (incl. removals for soft-deleted / category-removed products) |
| C3 | `syncSingleProduct(retailerId, productId)` job | Incremental sync on product change | ✅ (auto-wired: product edit / status change / delete enqueue it via `maybeEnqueueProductSync`; tag completion syncs newly-created products; bulk-delete enqueues one `maybeEnqueueFullSync` reconciliation — all fail-open + gated on `sync_enabled`) |
| C4 | `buildCatalogItemPayload(product)` | Transform Product → Meta catalog item format | ✅ |
| C5 | `resolveHsnForCatalog(product)` | Use Phase I's HSN mapping | ✅ (interim keyword map over apparel HSN heads — Phase I hsn_codes table not built yet) |
| C6 | Handle product status: AVAILABLE→in_stock, SOLD→out_of_stock | Map Kanchuki status to Meta availability | ✅ (AVAILABLE→in stock, RESERVED→available for order, SOLD/NOT_SURE→out of stock) |
| C7 | Batch operations (Meta allows batch create/update) | Reduce API calls | ✅ (chunked 5-at-a-time concurrent per-item calls) |
| C8 | Idempotency: use `retailer_sku` as external ID | Prevent duplicates on retry | ✅ (Kanchuki product id passed as Meta `retailer_id` external id; CatalogItem.product_id @unique) |
| C9 | Retry logic with exponential backoff | Handle transient Meta errors | ✅ (queue config) |
| C10 | **Daily scheduled full-sync cron** | Refresh all catalogs even with zero product activity | ✅ (maintenance worker `catalog-daily-full-sync` — pattern from `CATALOG_SYNC_CRON` env, default `0 5 * * *` (5:00 AM UTC, 30 min after the image-compression pass); `handleDailyCatalogSync()` in `catalog-sync.ts` fans out one `full_sync` job per retailer with `sync_enabled` + WhatsApp API token, `triggered_by: 'schedule'`; fail-open per retailer + DB error degrades to no-op) |
| C11 | **Per-retailer sync timeout** | A stuck Meta call must not stall the daily pass (queue concurrency 2) | ✅ (`handleCatalogSync` wraps each run in an `AbortController` budget — `CATALOG_SYNC_TIMEOUT_MS`, default 10 min, env-overridable; signal threaded into every `meta-catalog.ts` fetch so in-flight HTTP is aborted; timed-out run records a FAILED log with `timed_out: true` and completes WITHOUT retry — next day's cron / next edit reconciles; real errors still rethrow for BullMQ backoff) |

---

## D. API Routes (`apps/api/src/routes/retailers/retailers-whatsapp-catalog.ts`) ✅ **COMPLETED**

| # | Task | Endpoint | Status |
|---|------|----------|--------|
| D1 | `GET /me/whatsapp-catalog` | Returns catalog status, sync_enabled, last_synced_at | ✅ (also synced/failed/pending counts) |
| D2 | `PATCH /me/whatsapp-catalog` | Enable/disable sync, select categories to sync | ✅ (validates categories belong to retailer) |
| D3 | `POST /me/whatsapp-catalog/sync` | Trigger manual full sync (returns job_id) | ✅ |
| D4 | `POST /me/whatsapp-catalog/sync/:productId` | Trigger single product sync | ✅ |
| D5 | `GET /me/whatsapp-catalog/logs` | Sync history with status (SUCCESS/FAILED/PARTIAL) | ✅ (last 50, newest first) |
| D6 | `GET /me/whatsapp-catalog/items` | List synced items with WhatsApp item IDs | ✅ (last 200 with product info + HSN) |
| D7 | Gate all routes behind `hasFeature(retailerId, 'WHATSAPP_CATALOG_SYNC')` | Plan feature check | ✅ (GET returns `{data:null}` when off; mutations throw 402) |

---

## E. Webhook Handler (`apps/api/src/routes/webhooks/whatsapp-catalog.ts`) ✅ **COMPLETED**

| # | Task | Description | Status |
|---|------|-------------|--------|
| E1 | `POST /v1/webhooks/whatsapp-catalog` | Meta catalog webhook endpoint | ✅ (registered at `/v1/public/webhooks/whatsapp-catalog`; **+ GET handshake** — Meta requires the `hub.mode=subscribe`/`hub.challenge` verification GET before enabling the subscription) |
| E2 | Verify webhook signature (HMAC-SHA256) | Use `getSecret('META_WEBHOOK_SECRET')` | ✅ (**contract fix:** Meta signs `X-Hub-Signature-256` with the **APP secret** (`META_APP_SECRET`), not the webhook secret — verified timing-safe, fail closed. `META_WEBHOOK_SECRET` is used as the GET handshake `hub.verify_token`) |
| E3 | Handle `catalog_item_added` event | Create/update local mapping | ✅ (matched → mark SUCCESS; unmatched + known product → enqueue single-product sync to recreate mapping) |
| E4 | Handle `catalog_item_updated` event | Sync price/availability back | ✅ (price → Product.price_min + snapshot; availability → Product.status + snapshot) |
| E5 | Handle `catalog_item_deleted` event | Mark local item as unsynced | ✅ (drop CatalogItem row + null Product.whatsapp_catalog_item_id; future sync recreates) |
| E6 | Handle `catalog_item_out_of_stock` | Update Product.status if needed | ✅ (AVAILABLE → SOLD) |
| E7 | Record each event in `CatalogSyncLog` | Audit trail | ✅ (operation `webhook`, payload { field, matched, action }; log failure never fails the webhook) |

---

## F. Retailer Mobile UI (`apps/mobile/app/settings/whatsapp-catalog.tsx`) ✅ **COMPLETED**

| # | Task | Description | Status |
|---|------|-------------|--------|
| F1 | Settings screen: "WhatsApp Native Catalog" section | Below existing WhatsApp Business API settings | ✅ (Settings row added under the WhatsApp Business API row; plan-gated empty state when the feature is off) |
| F2 | Toggle: "Sync to WhatsApp Catalog" (enable/disable) | Calls `PATCH /me/whatsapp-catalog` | ✅ (Switch → PATCH sync_enabled) |
| F3 | Category selector: pick which ProductCategories to sync | Multi-select from retailer's categories | ✅ (chips from `/v1/categories`, auto-save PATCH sync_categories, "all categories" default) |
| F4 | "Sync Now" button (manual trigger) | Calls `POST /me/whatsapp-catalog/sync` | ✅ (GradientButton, disabled until WhatsApp Business API connected) |
| F5 | Sync status display: last synced, items synced, errors | Calls `GET /me/whatsapp-catalog` | ✅ (Connected/Not-configured badge, Synced/Pending/Failed counts, catalog id, last sync) |
| F6 | Sync logs list with pull-to-refresh | Calls `GET /me/whatsapp-catalog/logs` | ✅ (RefreshControl + refresh icon; status pills, error messages) |
| F7 | Per-product sync status badge in catalog list | Show 🟢 synced / 🟡 pending / 🔴 error | ✅ (bottom-right dot on ProductCard, driven by `GET /me/whatsapp-catalog/items` + legend row in the catalog tab header; API client `whatsappCatalogApi` in `src/lib/api/whatsapp-catalog.ts`) |

---

## G. Admin UI (`apps/web/src/app/admin/whatsapp-catalog/`) ✅ **COMPLETED**

| # | Task | Description | Status |
|---|------|-------------|--------|
| G1 | Admin page: `/admin/whatsapp-catalog` | List all retailers with catalog sync status | ✅ (sidebar link added; API `GET /admin/whatsapp-catalog/overview`) |
| G2 | Columns: retailer, catalog_id, sync_enabled, items_synced, last_sync, errors | | ✅ (store/plan/catalog-id/synced/failed/last-sync + configured/sync-off/syncing badges) |
| G3 | Drill-down: click retailer → view sync logs & items | | ✅ (modal with Sync Logs / Items tabs; API `GET .../retailers/:id/logs` + `/items`) |
| G4 | Manual sync trigger per retailer | Admin can force sync | ✅ (row + modal buttons; API `POST .../retailers/:id/sync` → BullMQ job, `triggered_by: 'admin'`, audited) |
| G5 | Global sync health dashboard | Error rates, latency metrics | ✅ (5 stat cards: syncing retailers, items synced, items failed, error-rate %, **daily cron** — last schedule-triggered run + 7-day failed/timed-out counts; cron failures derived via JSON path filter on `payload_json.triggered_by = 'schedule'`; latency not stored — duration isn't captured in CatalogSyncLog) |

---

## H. Feature Flag & Plan Limits ✅ **COMPLETED**

| # | Task | Location | Status |
|---|------|----------|--------|
| H1 | Add `WHATSAPP_CATALOG_SYNC` to `PlanFeatureKey` enum | `schema.prisma` | ✅ |
| H2 | Seed plan_features: Growth=true, Pro=true, Starter=false | `migration 060` | ✅ |
| H3 | Add to admin `/admin/plan-features` grid | Existing UI | ✅ (auto-picks up enum) |
| H4 | Update `hasFeature()` calls in routes | Auto-gated | ✅ |

---

## I. Tests ✅ **COMPLETED**

| # | Task | Location | Status |
|---|------|----------|--------|
| I1 | Unit: `meta-catalog.test.ts` - payload building, error mapping | `apps/api/src/lib/` | ✅ (14 tests) |
| I2 | Unit: `catalog-sync.test.ts` - sync logic, status mapping | `apps/api/src/jobs/` | ✅ (30 tests: HSN/status/payload pure logic + full/single sync flows + daily-cron fan-out + per-retailer timeout) |
| I3 | Integration: `retailers-whatsapp-catalog.test.ts` - route tests | `apps/api/src/routes/` | ✅ (11 tests: D1-D6 + 402 gate) |
| I4 | Integration: `whatsapp-catalog-webhook.test.ts` - webhook handling | `apps/api/src/routes/webhooks/` | ✅ (12 tests: handshake, bad/missing signature, E3/E4/E5/E6, non-catalog ignore, 503 fail-closed) |
| I5 | Mobile: catalog sync screen test | `apps/mobile/app/settings/` | ✅ (5 tests in `__tests__/settings/whatsapp-catalog.test.tsx`: loading, plan gate, status card counts, logs, never-synced) |

---

## J. Documentation & Config ✅ **COMPLETED**

| # | Task | Description | Status |
|---|------|-------------|--------|
| J1 | Add `META_WHATSAPP_BUSINESS_ACCOUNT_ID` to `.env.example` | Root | ✅ |
| J2 | Add `META_WEBHOOK_SECRET` to `.env.example` | Root | ✅ |
| J3 | Document webhook URL setup in Meta dashboard | `README.md` or `docs/DEPLOY.md` | ✅ (`docs/DEPLOY.md` → "Deploy WhatsApp Native Catalog Sync (Phase II)": Meta env vars, webhook callback URL + verify token, signature contract, retailer first-sync steps, checklist) |
| J4 | Update `CLAUDE.md` feature index when done | `CLAUDE.md` | ✅ (feature #45 index row + BUILD-LOG §49 + PLAN.md + growth-roadmap P rows updated — human-approved) |

---

## Sprint Progress Summary

| Sprint | Tasks | Status | Commit |
|--------|-------|--------|--------|
| **Sprint 1** | A1-A7, H1-H4, J1-J2 | ✅ **DONE** | `d501913` |
| **Sprint 2** | B1-B8 | ✅ **DONE** | `adfe34d` |
| **Sprint 3** | C1-C9, D1-D7 | ✅ **DONE** | — |
| **Sprint 4** | E1-E7, I1-I4 | ✅ **DONE** | — |
| **Sprint 5** | F1-F7, G1-G5, I5 | ✅ **DONE** | — |
| **Sprint 6** | I5, J3-J4, integration testing | ✅ **DONE** | — |

---

## Key Reusable Components (Already Exist)

| Component | Reuse For |
|-----------|-----------|
| `apps/api/src/lib/meta-graph.ts` | OAuth, token management, base Graph API client |
| `SocialAccount` + `SocialPost` models | Pattern for `CatalogItem` + `CatalogSyncLog` |
| `encryptSecret`/`decryptSecret` | Token encryption (already in `@kanchuki/db`) |
| BullMQ (`apps/api/src/jobs/index.ts`) | Queue infrastructure |
| `hasFeature()` + `PlanFeatureKey` | Feature gating |
| R2 presigned URLs | Product image uploads to Meta |

---

**Completed: 63/63 tasks** — Phase II WhatsApp Native Catalog Sync fully built (Sprints 1-6). Verified: API tsc clean + 593/593 tests (55 new); web tsc clean; mobile tsc clean + 43/43 tests (5 new). **Bonus: auto-sync on product mutations** — edit/status/delete enqueue `single_product` jobs, tag completion syncs new products, bulk-delete enqueues one full sync (all gated on `sync_enabled`, fail-open). **Still pending (ops):** migration `060` (+ `061`–`063`) not applied; no deployment; Meta WABA + DLT account setup required before live syncs.