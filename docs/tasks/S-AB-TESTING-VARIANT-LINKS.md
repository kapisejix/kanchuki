# Task S: A/B Testing — Auto-Built Per-Variant Collection Links (Hidden-Collection Status)

**Status:** ✅ **Built** 2026-08-18 (BUILD-LOG §49). Full A/B variant collection infrastructure: `HIDDEN` enum added to `CollectionStatus`, auto-generated per-variant collections on campaign create/edit, variant collection links returned in send response, public storefront excludes `HIDDEN` from listing but allows direct-link access, campaign stores `variant_a_collection_id`/`variant_b_collection_id` FKs.

---

## Gap Summary

| Sub-Feature | Status | Blocker / Notes |
|---|---|---|
| Auto-generated per-variant collection links | ✅ Built | `syncVariantCollections()` in `growth-campaigns.ts` — creates/updates two `HIDDEN` collections on campaign create/edit. |
| Hidden-collection status (new `Collection.status` value) | ✅ Built | `HIDDEN` enum value added to `CollectionStatus` in `schema.prisma` (line 45). Migration `064_ab_variant_collections` applied. |
| Variant link generation on campaign send | ✅ Built | Send response includes `variant_collection_links: { a, b }` with `?variant=a|b` query params. |
| Variant link cleanup / expiry | ✅ Built | `cleanup_ttl_days` column on `Campaign` model; variant collections archived when no longer needed.

---

## Current Implementation (Built)

- **A/B test model** — `Campaign` with `ab_test: true`, `variant_a_products`, `variant_b_products` (JSON arrays of product IDs), `ab_split_pct` (default 50), `ab_stagger_minutes` (send stagger).
- **Send logic** — `POST /v1/growth/campaigns/{id}/send` splits audience, sends variant A to first %, variant B to remainder after stagger.
- **Variant stats** — Per-variant `sent_count`, `open_count`, `enquiry_count` tracked on `CampaignSend`.
- **Significance test** — Two-proportion z-test on open rates; winner callout on analytics screen (`apps/mobile/app/(tabs)/analytics.tsx` → A/B Tests tab).
- **Analytics screen** — Shows per-variant metrics + z-test p-value + winner badge.

---

## Required Work

### 1. Add `HIDDEN` Status to Collection Model

**File:** `apps/api/src/models/Collection.ts` (or Prisma schema)

```prisma
enum CollectionStatus {
  DRAFT
  ACTIVE
  ARCHIVED
  HIDDEN  // NEW — A/B variant collections, direct-link only
}
```

**Migration:** Add `HIDDEN` to the enum (PostgreSQL: `ALTER TYPE "CollectionStatus" ADD VALUE 'HIDDEN';`).

**Behavior:**
- `HIDDEN` collections are **excluded** from:
  - Public storefront `/collections` listing
  - Retailer's own "My Collections" active view (show in separate "A/B Variants" section)
  - Search/indexing
- `HIDDEN` collections **are accessible** via direct link: `kanchuki.app/{store}/collections/{id}?variant=true`
- `HIDDEN` collections **do not** appear in WhatsApp native catalog sync.

### 2. Auto-Generate Variant Collections on A/B Campaign Creation

**Trigger:** When retailer creates/edits a campaign with `ab_test: true` and saves.

**Flow:**
1. System creates two `Collection` records:
   - `variant_a_collection`: name = `"{Campaign Name} — Variant A"`, status = `HIDDEN`, products = `variant_a_products`
   - `variant_b_collection`: name = `"{Campaign Name} — Variant B"`, status = `HIDDEN`, products = `variant_b_products`
2. Both collections linked to campaign via new fields: `campaign.variant_a_collection_id`, `campaign.variant_b_collection_id`.
3. Collection links generated: `https://kanchuki.app/{store}/collections/{collection_id}?variant=a|b`

**API Changes:**
- `POST /v1/growth/campaigns` + `PATCH /v1/growth/campaigns/{id}` — when `ab_test=true` and variant product sets provided, auto-create/update variant collections.
- Return `variant_a_link`, `variant_b_link` in campaign response.

### 3. Send Logic Uses Variant Collection Links

**Current:** Send uses campaign-level collection link.

**New:** `POST /v1/growth/campaigns/{id}/send`:
- Variant A sends → uses `variant_a_collection` link
- Variant B sends → uses `variant_b_collection` link
- Links include `?variant=a` or `?variant=b` query param for analytics attribution.

### 4. Variant Collection Management & Cleanup

**Retailer UI:**
- New section in Collections screen: **"A/B Variants"** (shows `HIDDEN` collections linked to campaigns).
- Actions: View link, Copy link, Delete (only if campaign not sent / test not running).

**Auto-Cleanup (Configurable):**
- After campaign `completed_at` + `cleanup_ttl_days` (default 30), variant collections auto-transition to `ARCHIVED`.
- Admin setting: `AB_VARIANT_CLEANUP_TTL_DAYS` (retailer-level or global).

---

## Database Changes

| Table | Column | Type | Notes |
|---|---|---|---|
| `Collection` | `status` | `CollectionStatus` | Add `HIDDEN` enum value |
| `Campaign` | `variant_a_collection_id` | `UUID` | FK → `Collection.id` |
| `Campaign` | `variant_b_collection_id` | `UUID` | FK → `Collection.id` |
| `Campaign` | `cleanup_ttl_days` | `INTEGER` | Default 30, nullable |

> Migration needed: `ALTER TYPE "CollectionStatus" ADD VALUE 'HIDDEN';` + two FK columns on `Campaign`.

---

## API Endpoints Affected

| Endpoint | Change |
|---|---|
| `POST /v1/growth/campaigns` | Auto-create variant collections when `ab_test=true` |
| `PATCH /v1/growth/campaigns/{id}` | Update variant collections on variant product set change |
| `POST /v1/growth/campaigns/{id}/send` | Use variant collection links for sends |
| `GET /v1/growth/collections` | Exclude `HIDDEN` by default; add `?include_hidden=true` for retailer view |
| `GET /v1/public/collections/{id}` | Allow access if `status=HIDDEN` (direct link only) |

---

## Mobile UI Changes

**Collections Screen (`apps/mobile/app/(tabs)/collections.tsx`):**
- Add segmented control: **Active** | **Draft** | **A/B Variants**
- "A/B Variants" tab shows `HIDDEN` collections with campaign name, variant label (A/B), link copy button.

**Campaign Create/Edit Screen:**
- When A/B test enabled, show preview of variant collection links (read-only).
- "Copy Variant A Link" / "Copy Variant B Link" buttons.

**Analytics Screen (A/B Tests tab):**
- Already shows variant stats — add "Open Variant A Collection" / "Open Variant B Collection" deep links.

---

## Public PWA Changes

**Collection Page (`apps/web/src/app/[store]/collections/[id]/page.tsx`):**
- Accept `?variant=a|b` query param.
- Track variant in analytics event: `collection_viewed` + `ab_variant: "a"|"b"`.
- No UI difference — same collection render, just attribution.

---

## Acceptance Criteria

- [x] `HIDDEN` enum value added to `CollectionStatus`; migration applied.
- [x] Creating an A/B campaign auto-generates two `HIDDEN` variant collections with correct product sets.
- [x] Variant collection links generated and returned in campaign response.
- [x] Campaign send uses variant-specific links for each audience split.
- [x] `HIDDEN` collections excluded from public storefront `/collections` listing.
- [x] `HIDDEN` collections excluded from WhatsApp native catalog sync.
- [x] Retailer Collections screen has "A/B Variants" tab showing variant collections with copy-link actions.
- [x] PWA collection page accepts `?variant=a|b` and attributes views correctly.
- [x] Auto-cleanup: variant collections transition to `ARCHIVED` after `cleanup_ttl_days` (default 30) post-campaign-completion.
- [x] All existing A/B test stats (z-test, winner callout) continue to work unchanged.

---

## Effort Estimate

| Sub-Task | Effort | Priority |
|---|---|---|
| `HIDDEN` enum + migration + model updates | Low | **P0** |
| Auto-create variant collections on campaign create/edit | Medium | **P0** |
| Send logic: use variant collection links | Low | **P0** |
| Public storefront: exclude HIDDEN from listing | Low | **P0** |
| WhatsApp catalog sync: exclude HIDDEN | Low | **P1** |
| Mobile UI: A/B Variants tab + link copy | Medium | **P1** |
| PWA variant attribution (`?variant=` param) | Low | **P1** |
| Auto-cleanup job (BullMQ) + TTL config | Low-Medium | **P2** |

**Total:** ~2–3 weeks (core P0 work ~1 week; UI + cleanup ~1–2 weeks).

---

## Dependencies

- Existing A/B test infrastructure (`Campaign.ab_test`, `variant_a_products`, `variant_b_products`, send stagger, z-test) must be stable.
- Collection model / API / mobile screens already exist — extending, not rewriting.
- BullMQ job queue available for cleanup job (used by WhatsApp catalog sync).
- `CampaignSend` already tracks per-variant stats — no schema change needed there.

---

## References

- Main roadmap: `docs/INDIA-RETAILER-GROWTH.md` (Feature S, line 359–368)
- Build log: `docs/BUILD-LOG.md` §47
- Campaign model: `apps/api/src/models/Campaign.ts`
- Collection model: `apps/api/src/models/Collection.ts`
- Campaign send route: `apps/api/src/routes/growth/campaigns.ts` (POST `/send`)
- Analytics screen (A/B tab): `apps/mobile/app/(tabs)/analytics.tsx`
- Collections screen: `apps/mobile/app/(tabs)/collections.tsx`
- PWA collection page: `apps/web/src/app/[store]/collections/[id]/page.tsx`
- WhatsApp catalog sync: `apps/api/src/jobs/catalog-sync.ts` (exclude HIDDEN status)