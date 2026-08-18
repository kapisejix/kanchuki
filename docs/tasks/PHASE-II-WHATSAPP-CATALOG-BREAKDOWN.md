# Phase II: WhatsApp Native Catalog Sync — Implementation Task Breakdown

**Status:** Planned (not yet implemented)  
**Date:** 2026-08-18  
**Related:** `docs/PLAN.md` Phase II, `docs/PRO-REQUIREMENTS.md` F-307

---

## A. Database Schema (Migration 060)

| # | Task | File/Location |
|---|------|---------------|
| A1 | Create migration `060_whatsapp_catalog_sync` | `packages/db/prisma/migrations/060_...` |
| A2 | Add `CatalogItem` model (product ↔ WhatsApp catalog item mapping) | `schema.prisma` |
| A3 | Add `CatalogSyncLog` model (sync history/errors) | `schema.prisma` |
| A4 | Add `whatsapp_catalog_id` to Retailer model | `schema.prisma` |
| A5 | Add `sync_enabled`, `sync_categories`, `last_synced_at` to Retailer | `schema.prisma` |
| A6 | Add `Product.whatsapp_catalog_item_id` (stores Meta's item ID) | `schema.prisma` |
| A7 | Run `prisma migrate dev` + `prisma generate` | CLI |

---

## B. Meta Catalog API Client (`apps/api/src/lib/meta-catalog.ts`)

| # | Task | Description |
|---|------|-------------|
| B1 | Extend `resolveMetaCredentials()` to include WhatsApp Business Account ID | Uses existing `getSecret` pattern |
| B2 | `getOrCreateCatalog(wabaId, accessToken)` | Creates catalog if missing, returns catalog_id |
| B3 | `createCatalogItem(catalogId, token, itemData)` | POST `/catalogId/items` - create product in WhatsApp |
| B4 | `updateCatalogItem(catalogId, token, itemId, itemData)` | POST `/itemId` - update price/availability |
| B5 | `deleteCatalogItem(catalogId, token, itemId)` | DELETE `/itemId` - remove from catalog |
| B6 | `listCatalogItems(catalogId, token)` | GET `/catalogId/items` - fetch current state |
| B7 | `uploadCatalogImage(imageUrl, token)` | POST to Meta media endpoint, returns `image_hash` |
| B8 | Error handling: rate limits, retries, idempotency keys | Use existing `MetaApiError` pattern |

---

## C. Sync Engine (`apps/api/src/jobs/catalog-sync.ts` + BullMQ)

| # | Task | Description |
|---|------|-------------|
| C1 | Create BullMQ queue `catalog-sync` | `apps/api/src/jobs/index.ts` |
| C2 | `syncAllProducts(retailerId)` job | Full sync: create/update/delete all eligible products |
| C3 | `syncSingleProduct(retailerId, productId)` job | Incremental sync on product change |
| C4 | `buildCatalogItemPayload(product)` | Transform Product → Meta catalog item format |
| C5 | `resolveHsnForCatalog(product)` | Use Phase I's HSN mapping |
| C6 | Handle product status: AVAILABLE→in_stock, SOLD→out_of_stock | Map Kanchuki status to Meta availability |
| C7 | Batch operations (Meta allows batch create/update) | Reduce API calls |
| C8 | Idempotency: use `retailer_sku` as external ID | Prevent duplicates on retry |
| C9 | Retry logic with exponential backoff | Handle transient Meta errors |

---

## D. API Routes (`apps/api/src/routes/retailers/retailers-whatsapp-catalog.ts`)

| # | Task | Endpoint |
|---|------|----------|
| D1 | `GET /me/whatsapp-catalog` | Returns catalog status, sync_enabled, last_synced_at |
| D2 | `PATCH /me/whatsapp-catalog` | Enable/disable sync, select categories to sync |
| D3 | `POST /me/whatsapp-catalog/sync` | Trigger manual full sync (returns job_id) |
| D4 | `POST /me/whatsapp-catalog/sync/:productId` | Trigger single product sync |
| D5 | `GET /me/whatsapp-catalog/logs` | Sync history with status (SUCCESS/FAILED/PARTIAL) |
| D6 | `GET /me/whatsapp-catalog/items` | List synced items with WhatsApp item IDs |
| D7 | Gate all routes behind `hasFeature(retailerId, 'WHATSAPP_CATALOG_SYNC')` | Plan feature check |

---

## E. Webhook Handler (`apps/api/src/routes/webhooks/whatsapp-catalog.ts`)

| # | Task | Description |
|---|------|-------------|
| E1 | `POST /v1/webhooks/whatsapp-catalog` | Meta catalog webhook endpoint |
| E2 | Verify webhook signature (HMAC-SHA256) | Use `getSecret('META_WEBHOOK_SECRET')` |
| E3 | Handle `catalog_item_added` event | Create/update local mapping |
| E4 | Handle `catalog_item_updated` event | Sync price/availability back |
| E5 | Handle `catalog_item_deleted` event | Mark local item as unsynced |
| E6 | Handle `catalog_item_out_of_stock` | Update Product.status if needed |
| E7 | Record each event in `CatalogSyncLog` | Audit trail |

---

## F. Retailer Mobile UI (`apps/mobile/app/settings/whatsapp-catalog.tsx`)

| # | Task | Description |
|---|------|-------------|
| F1 | Settings screen: "WhatsApp Native Catalog" section | Below existing WhatsApp Business API settings |
| F2 | Toggle: "Sync to WhatsApp Catalog" (enable/disable) | Calls `PATCH /me/whatsapp-catalog` |
| F3 | Category selector: pick which ProductCategories to sync | Multi-select from retailer's categories |
| F4 | "Sync Now" button (manual trigger) | Calls `POST /me/whatsapp-catalog/sync` |
| F5 | Sync status display: last synced, items synced, errors | Calls `GET /me/whatsapp-catalog` |
| F6 | Sync logs list with pull-to-refresh | Calls `GET /me/whatsapp-catalog/logs` |
| F7 | Per-product sync status badge in catalog list | Show 🟢 synced / 🟡 pending / 🔴 error |

---

## G. Admin UI (`apps/web/src/app/admin/whatsapp-catalog/`)

| # | Task | Description |
|---|------|-------------|
| G1 | Admin page: `/admin/whatsapp-catalog` | List all retailers with catalog sync status |
| G2 | Columns: retailer, catalog_id, sync_enabled, items_synced, last_sync, errors | |
| G3 | Drill-down: click retailer → view sync logs & items | |
| G4 | Manual sync trigger per retailer | Admin can force sync |
| G5 | Global sync health dashboard | Error rates, latency metrics |

---

## H. Feature Flag & Plan Limits

| # | Task | Location |
|---|------|----------|
| H1 | Add `WHATSAPP_CATALOG_SYNC` to `PlanFeatureKey` enum | `schema.prisma` |
| H2 | Seed plan_features: Growth=true, Pro=true, Starter=false | `seed.ts` |
| H3 | Add to admin `/admin/plan-features` grid | Existing UI |
| H4 | Update `hasFeature()` calls in routes | Auto-gated |

---

## I. Tests

| # | Task | Location |
|---|------|----------|
| I1 | Unit: `meta-catalog.test.ts` - payload building, error mapping | `apps/api/src/lib/` |
| I2 | Unit: `catalog-sync.test.ts` - sync logic, status mapping | `apps/api/src/jobs/` |
| I3 | Integration: `retailers-whatsapp-catalog.test.ts` - route tests | `apps/api/src/routes/` |
| I4 | Integration: `whatsapp-catalog-webhook.test.ts` - webhook handling | `apps/api/src/routes/webhooks/` |
| I5 | Mobile: catalog sync screen test | `apps/mobile/app/settings/` |

---

## J. Documentation & Config

| # | Task | Description |
|---|------|-------------|
| J1 | Add `META_WHATSAPP_BUSINESS_ACCOUNT_ID` to `.env.example` | Root |
| J2 | Add `META_WEBHOOK_SECRET` to `.env.example` | Root |
| J3 | Document webhook URL setup in Meta dashboard | `README.md` or `docs/DEPLOY.md` |
| J4 | Update `CLAUDE.md` feature index when done | `CLAUDE.md` |

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

## Suggested Execution Order

| Sprint | Tasks | Dependencies |
|--------|-------|--------------|
| **Sprint 1** | A1-A7, H1-H4, J1-J2 | Database first |
| **Sprint 2** | B1-B8 | Requires A2 (CatalogItem model) |
| **Sprint 3** | C1-C9, D1-D7 | Requires B |
| **Sprint 4** | E1-E7, I1-I4 | Webhook + tests |
| **Sprint 5** | F1-F7, G1-G5 | UI on top of API |
| **Sprint 6** | I5, J3-J4, integration testing | End-to-end |

---

**Total: ~55 tasks** across 10 categories. Each task is 1-4 hours of work. Can be parallelized within sprints.