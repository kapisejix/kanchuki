# Suits Designs — plan & analysis

**Status:** ✅ Built (2026-09-07) — migrations 093–096 written + committed, prod apply pending (T1.4, owner — never `migrate deploy` locally). Sr-dev review + cleanup pass done 2026-09-07 (§19) — 2 mobile fixes, all suites green, EAS-ready.
**Requested:** 2026-09-07 (revised same day — fully dynamic, view-more tab, sharing, watermark; decisions locked §14)
**Owner surface:** retailer mobile app + admin web + customer web (product detail + browse + public permalink)

---

## 1. What it is

A library of **design / pattern reference photos** (Suits, Blouse, Saree,
Kurti, Gala, Baju, …) that retailers and admin upload and manage like products.
Customers see them on the **product detail page, under "Related products"**, as
a "Suits Designs" strip, filtered to the garment type they are browsing, with a
**"View more"** button that opens the full related-designs browser in a new
tab/screen. Every design carries a **light Kanchuki- or retailer-logo
watermark**. Both customers and retailers can **share** a design — customers via
the system share sheet / WhatsApp / copy-link; retailers additionally straight
to their connected Facebook / Instagram.

It is **not** the catalog. A Suits Design has no price, stock, SKU, rack
location, or enquiry flow. It is a watermarked image + a category + a name.

It is **not** the existing *Unstitched Design Gallery* (`DesignReference` model,
`§9 customer-profile-req.md`) — that is admin-only, storefront-level, and
tailor-oriented. Same *shape*, different feature (see §4).

**Nothing is hardcoded.** Categories, the category↔category relations that
decide "a saree product also shows blouse designs", the watermark logo/opacity/
position, the number of thumbnails before "View more", and plan gating are all
DB rows an admin edits. No enum, no code map, no magic constants.

---

## 2. How it works

### 2.1 Retailer — manage (mobile)

1. New screen **"Suits Designs"** — entered from a DB-driven tile on the Home
   dashboard and/or a catalog header button (which entry points is an admin
   toggle, §14). Listing = catalog-style grid: retailer header, category filter
   chips (loaded from the DB), 2-col image grid, `+` FAB.
2. `+` → **Add Design**: pick photo → compress → upload **raw** to R2 → pick a
   category (chips from the DB, required) → optional name → Save. The server
   then watermarks (§2.5) and stores the final image.
3. Card → **Design detail / edit**: rename, change category, replace photo
   (re-watermarks), toggle active, delete. **"Post to social"** → opens the
   existing Social Create-Post composer (`/social/create`, BUILD-LOG §64)
   prefilled with the watermarked image → retailer fans it out to their
   connected FB / IG accounts.
4. A retailer sees + edits **their own** designs and sees (read-only) the
   **global** ones admin published.

### 2.2 Admin — manage (web)

1. New page **`/admin/suits-designs`** — clone of `/admin/background-images`
   (upload → R2, list, lightbox, delete) + category select + active toggle +
   an owner column (Global / <retailer>).
2. Admin rows default to **global** (`retailer_id = NULL`) → shown on every
   store's product pages. Admin can also deactivate any retailer row
   (moderation).
2b. **Per-plan upload cap** — a `SHOWCASE_DESIGNS` quota resource type
   (F-010 pattern, same as `STUDIO_SHOOT`). Admin sets the max designs per plan
   tier on **Admin → Plan Limits**; the retailer create endpoint rejects once
   the retailer's active design count reaches their plan's limit.
3. New page **`/admin/suits-design-categories`** — CRUD the category list
   (name, slug, sort, active) **and** each category's **related categories**
   (multi-select) — e.g. *Saree → [Saree, Blouse]*, *Kurti → [Kurti, Gala,
   Baju]*. This table is what makes "browse sarees → see saree + blouse
   designs" work, with zero code changes.
4. New section on the existing **admin theme / settings** page — watermark
   config: default logo (Kanchuki brand asset), opacity %, scale % of image
   width, corner (gravity), and the "thumbnails before View more" count.

### 2.3 Customer — product detail (web + mobile)

1. Below the existing "Related products" section, a **"<Category> Designs"**
   section renders when ≥1 design matches.
2. **Which designs:** resolve the product's category → its
   `ShowcaseDesignCategory` (match by name, case-insensitive) → expand by that
   category's `related_category_ids` → show `is_active` designs where
   `category_id IN (expanded set)` AND `(retailer_id IS NULL OR retailer_id =
   <product's retailer>)`. So a **Saree** product shows **Saree + Blouse**
   designs (because admin linked them), a **Kurti** shows Kurti + Gala + Baju,
   etc. All from DB config.
3. Shows the first *N* (admin-set, default 6) as a horizontal strip + a
   **"View more"** button.

### 2.4 Customer — "View more" browser (new tab/screen)

1. **"View more"** → opens a dedicated browser:
   - Web: `/{store}/designs?ref=<productId>` (new route, opens in a new tab).
   - Mobile: pushes `/showcase-designs/browse?ref=<productId>` (customer-facing,
     not the retailer editor).
2. Full grid of the related designs, with category chips (the expanded set) to
   filter further.
3. Tap a design → **design detail** (public): large watermarked image, store
   name, category, **Share** actions:
   - **Share** → system share sheet (`Share.share` on mobile / Web Share API on
     web) with the **public permalink** + image.
   - **WhatsApp** → `wa.me` deep link with the permalink.
   - **Copy link**.
4. **Public permalink** — store-scoped route `kanchuki.app/{store}/designs/<id>`:
   watermarked image + store name + "Visit store" CTA. This is the shareable
   artifact; it is cacheable and needs no login.

### 2.5 Watermark (server-side, on upload)

1. Client uploads the **raw** image to `showcase-designs/<owner>/raw/<cuid>.jpg`.
2. `POST …/showcase-designs` (retailer or admin) passes that `r2_key`.
3. Server: download raw → `sharp` composite a **semi-transparent logo**
   (defaults: 18% of image width, ~35% opacity, bottom-right, 24px margin — all
   admin-overridable) → upload final to `showcase-designs/<owner>/<cuid>.jpg` →
   store `image_url`/`r2_key` = final, `original_r2_key` = raw (kept, so a logo
   change can re-run the watermark).
4. **Which logo:**
   - retailer-owned design → `retailer.logo_url` (via `logo_r2_key`); if the
     retailer has no logo → the platform default.
   - global / admin design → the platform brand logo from admin watermark
     config.
5. `sharp` is already a monorepo dependency (`packages/ai`); add it to
   `apps/api` (or expose a tiny `watermark()` helper from `@kanchuki/ai`).
   `ponytail:` re-watermark of every row on a logo change is a background job,
   not inline — add when a retailer actually rebrands.

### 2.6 Retailer social share

Reuse the Social Create-Post composer end to end (BUILD-LOG §64,
`apps/mobile/app/social/create.tsx`, `POST /v1/retailers/me/social/posts`). The
design detail screen adds one entry point that opens the composer with the
design's `image_url` preloaded as the post media. No new publish UI.

**Why a real IMAGE post type (not product media):** the composer + fan-out
were product-anchored — a design is a standalone watermarked image with no
product row, so faking it as product media would lie in history. Built
(2026-09-07): `SocialPostType` enum gains `IMAGE` (migration `096`), the
fan-out accepts an `image_url` item and records an honest empty
`product_ids` array with an auto "New design…" caption, and the composer
gains a `design_id` deep-link mode that locks to IMAGE (design photo card,
caption + targets only).

---

## 3. What already exists — reuse inventory

| Need | Reuse | File |
|---|---|---|
| CRUD route shape (list/get/post/put/delete + stats, category filter, zod) | Copy `adminDesignReferenceRoutes` | `apps/api/src/routes/admin/admin-design-references.ts` |
| DB-taxonomy pattern (admin-global list + per-retailer copies) | Mirror `DefaultProductCategory` / `ProductCategory` | `packages/db/prisma/schema.prisma:380`, `apps/web/src/app/admin/default-categories/` |
| Presigned R2 upload | Mirror `categoryApi.getUploadUrl` → `{upload_url, r2_key, public_url}` | `apps/mobile/src/lib/api/categories.ts:33` + its route |
| Client-side R2 PUT | `uploadImageToR2(uri, upload_url, contentType)` | `apps/mobile/src/lib/api/client.ts:194` |
| Client-side compress before upload | `compress-image` | `apps/mobile/src/lib/compress-image.ts` |
| Server image processing | `sharp` (already a dep) | `packages/ai/package.json:43` |
| Product-detail "related" slot + card style | render a sibling after `RelatedProductsSection` | `apps/mobile/src/components/product-detail/RelatedProducts.tsx`, used `app/product/[id].tsx:450` |
| Retailer grid listing (header, 2-col, FAB, chips) | `(tabs)/catalog.tsx` layout | `apps/mobile/app/(tabs)/catalog.tsx` |
| Admin image-CRUD page (upload→R2, list, lightbox, delete) | `/admin/background-images` | `apps/web/src/app/admin/background-images/` |
| Customer storefront design strip visual | `DesignGallery.tsx` | `apps/web/src/app/c/[slug]/components/DesignGallery.tsx` |
| Retailer social publishing (FB/IG fan-out) | Social Create-Post composer + `POST /social/posts` | `apps/mobile/app/social/create.tsx` |
| System share | `Share.share` (RN, built-in) / Web Share API | — |
| Public response cache | `withPublicCache` | `apps/api/src/lib/public-cache.ts` |
| Bottom-inset math (new screens) | `useScreenInsets()` | `apps/mobile/src/lib/safe-area.ts` |
| Plan gating | PlanFeature matrix (F-013) | `apps/api/src/lib/features.ts` |

**Net new:** 2 Prisma models + join, 1 migration, 1 watermark helper, retailer
route file, admin route file (designs) + admin route file (categories), public
route(s) + permalink page, mobile: list / add / edit / **browse** / **public
design detail** screens + API client, web: product-detail strip + browse route +
permalink page + 2 admin pages, a watermark-config block on the admin settings
page. No new dependency (`sharp` already present).

---

## 4. Data model

### New — `ShowcaseDesignCategory` (admin-global, dynamic)

```prisma
model ShowcaseDesignCategory {
  id          String  @id @default(cuid())
  name        String  @unique          // "Saree"
  slug        String  @unique          // "saree"
  sort_order  Int     @default(0)
  is_active   Boolean @default(true)

  // "a Saree product also shows Blouse designs" — admin-managed, no code map
  related_to   ShowcaseDesignCategory[] @relation("RelatedShowcaseCategories")
  related_from ShowcaseDesignCategory[] @relation("RelatedShowcaseCategories")

  designs     ShowcaseDesign[]
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  @@map("showcase_design_categories")
}
```

(Prisma models an implicit self-M2M with the two relation fields; it creates a
`_RelatedShowcaseCategories` join table. Migration seeds the initial rows +
links from the requested list: Suits, Blouse, Saree, Kurti, Gala, Baju — but
admin owns them from then on.)

### New — `ShowcaseDesign`

```prisma
model ShowcaseDesign {
  id               String  @id @default(cuid())
  retailer_id      String?  // NULL = global (admin-published, every store)
  category_id      String
  category_slug    String   // denormalised for fast public filtering
  name             String?
  image_url        String   // watermarked, R2 public URL
  r2_key           String   // watermarked object key
  original_r2_key  String?  // raw upload, kept for re-watermark
  sort_order       Int     @default(0)
  is_active        Boolean @default(true)

  created_at       DateTime @default(now())
  updated_at       DateTime @updatedAt

  retailer         Retailer?              @relation(fields: [retailer_id], references: [id], onDelete: Cascade)
  category         ShowcaseDesignCategory @relation(fields: [category_id], references: [id])

  @@index([retailer_id])
  @@index([category_slug, is_active])
  @@index([retailer_id, category_slug, is_active])
  @@map("showcase_designs")
}
```

Add back-relations to `Retailer` (`showcase_designs ShowcaseDesign[]`).

### Watermark config — no new table

Store as **one JSON blob under the existing AuditLog-as-KV settings-store
pattern** (`getSetting`/`saveSetting` in
`apps/api/src/routes/admin-settings/settings-store.ts`, same as `theme.ts`'s
`SETTING_app_theme`) — key `SETTING_showcase_watermark` with metadata
`{logo_r2_key, opacity (0–1), scale (0–1 of width), gravity ('southeast'
default), strip_count (default 6)}`. **Code defaults + admin partial PUT**, not
migration-seeded rows: an absent setting falls back to the defaults in the
watermark helper (mirrors `DEFAULT_PLATFORM_THEME`), and the admin settings
page saves over them. Do NOT use `integration_settings` (that table is
encrypted secrets) and do NOT seed config in a migration. Nothing hardcoded.

### R2 key scheme

- raw: `showcase-designs/{retailerId|"global"}/raw/{cuid}.jpg`
- final: `showcase-designs/{retailerId|"global"}/{cuid}.jpg`

---

## 5. API surface

### Retailer — `apps/api/src/routes/retailers/retailers-showcase-designs.ts`

Scoped to `request.retailerId`. Plan-gated via PlanFeature (`SHOWCASE_DESIGNS`,
admin-toggled in the matrix — §14).

| Method | Path | Notes |
|---|---|---|
| `GET`  | `/v1/retailers/me/showcase-designs?category=<slug>` | own + global rows |
| `GET`  | `/v1/retailers/me/showcase-designs/categories` | active category list + related links |
| `GET`  | `/v1/retailers/me/showcase-designs/upload-url` | presigned raw PUT |
| `POST` | `/v1/retailers/me/showcase-designs` | `{category_id, name?, raw_r2_key}` → **quota check** (plan `SHOWCASE_DESIGNS` limit vs active count → `402/429` when full) → **watermark** → create with `retailer_id = self` |
| `PUT`  | `/v1/retailers/me/showcase-designs/:id` | 403 unless owner; photo replace re-watermarks |
| `DELETE` | `/v1/retailers/me/showcase-designs/:id` | 403 unless owner; deletes both R2 objects |

### Admin

- `apps/api/src/routes/admin/admin-showcase-designs.ts` — copy
  `admin-design-references.ts`; `retailer_id` optional (default NULL = global);
  `?scope=global|retailer&retailer_id=`; `GET /stats`
  (total / active / by_category / global-vs-retailer); create runs the same
  watermark step with the platform logo.
- `apps/api/src/routes/admin/admin-showcase-design-categories.ts` — CRUD the
  category list + `PUT :id/related` `{related_ids: string[]}`.
- Watermark config: extend the existing admin-settings route.

### Public — `apps/api/src/routes/public/public-showcase-designs.ts` (or extend `public-designs.ts`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/v1/public/showcase-designs?product_id=<id>` | resolve product category → showcase category → expand `related` → `is_active` rows, `(global OR product's retailer)`, `limit` = strip count; `withPublicCache`, `s-maxage=300` |
| `GET` | `/v1/public/showcase-designs?store=<slug>&category=<slug>` | the "View more" browser feed (paginated) |
| `GET` | `/v1/public/showcase-designs/:id` | permalink data — image, store name/slug, category |

### Security

- Retailer writes: ownership check (`retailer_id === request.retailerId`).
- Admin routes: existing admin auth plugin.
- Public: only `is_active`; only global + the queried product's/store's
  retailer; never leaks other retailers' designs.
- **RLS — none on the new tables** (repo reality, verified 2026-09-07): the
  `kanchuki.retailer_id` GUC policy text originally here describes a setting
  that does not exist anywhere in migrations or app code. The codebase's RLS
  convention is deny-all on **admin-catalog tables only** (020/027/035/050,
  Supabase era); every table added since the Railway move (069, 089, 090, 091)
  ships with no RLS and no GRANTs (default privileges cover `kanchuki_app`),
  relying on app-layer tenant scoping through the privileged app role.
  `showcase_designs` follows that: Prisma queries always add
  `retailer_id = <self> OR retailer_id = NULL` (global rows), enforced in the
  route layer, not by row policies.
- Watermark helper validates content-type + max dimensions before compositing
  (defence against decompression bombs).

---

## 6. Storage & lifecycle

- **Create:** client compress → upload raw → `POST {raw_r2_key}` → server
  download raw → `sharp` composite logo → upload final → row stores final +
  keeps raw as `original_r2_key`.
- **Replace photo:** new raw upload → re-watermark → new final key → delete old
  final + old raw.
- **Delete row:** delete final + raw R2 objects, then the row (best-effort on
  R2, same as product-photo delete).
- **Logo/opacity change (admin):** background re-watermark from
  `original_r2_key` — deferred job, not inline (`ponytail:` add when a rebrand
  actually happens).
- **Size cap:** reuse `compress-image` client-side; server also caps output.

---

## 7. Mobile

### Retailer screens

| File | Purpose |
|---|---|
| `app/showcase-designs/index.tsx` | grid listing — catalog-style header, DB category chips, 2-col `FlatList`, `+` FAB, `useScreenInsets` bottom clearance |
| `app/showcase-designs/new.tsx` | add — photo picker → compress → raw upload → category chips (DB) → name → Save (modal) |
| `app/showcase-designs/[id].tsx` | edit/detail — image, replace photo, category, name, active toggle, delete, **"Post to social"** → `/social/create` prefilled |

### Customer screens

| File | Purpose |
|---|---|
| `app/showcase-designs/browse.tsx` | "View more" target — related-designs grid + category chips, public feed, tap → design detail |
| `app/showcase-designs/view/[id].tsx` | public design detail — big image, store name, **Share** (system sheet) / WhatsApp / copy link |
| `src/components/product-detail/ShowcaseDesigns.tsx` | the strip on product detail — N thumbs + "View more" → `browse`; rendered after `<RelatedProductsSection>` in `app/product/[id].tsx` |

### API client — `src/lib/api/showcase-designs.ts`

`listMine(cat?)`, `categories()`, `getUploadUrl(ct, size)`, `create(d)`,
`update(id, d)`, `remove(id)`, `publicForProduct(productId)`,
`publicBrowse(store, cat, cursor)`, `publicOne(id)`. Re-export from
`src/lib/api/index.ts`.

### Routing

`app/_layout.tsx` — `showcase-designs/index`, `showcase-designs/new` (modal),
`showcase-designs/[id]` under `isAuthed`; `showcase-designs/browse`,
`showcase-designs/view/[id]` reachable while logged-out (customer).

### Entry point (admin-toggled)

DB flag decides: Home-dashboard tile (`app/(tabs)/index.tsx` "Catalog &
Products") and/or `(tabs)/catalog.tsx` header button. Not a new bottom tab.

---

## 8. Web

- `apps/web/src/app/c/[slug]/components/ShowcaseDesigns.tsx` — strip under
  Related products on the product page; "View more" → new tab.
- `apps/web/src/app/{store}/designs/page.tsx` — the browser (grid + chips,
  paginated feed).
- `apps/web/src/app/{store}/designs/[id]/page.tsx` — public permalink
  (`kanchuki.app/{store}/designs/<id>`): watermarked image, store name, "Visit
  store", Web Share API + WhatsApp + copy link. SSR + cacheable.
- `apps/web/src/app/admin/suits-designs/page.tsx` — clone background-images.
- `apps/web/src/app/admin/suits-design-categories/page.tsx` — category + related
  CRUD.
- Watermark-config block on the existing admin settings/theme page.

---

## 9. Categories (dynamic — seeded, then admin-owned)

Migration seeds from the requested list and links the obvious relations; admin
edits everything afterwards:

| name | slug | related (seed) |
|---|---|---|
| Suits | suits | Suits, Gala, Baju |
| Blouse | blouse | Blouse, Gala, Baju |
| Saree | saree | Saree, Blouse |
| Kurti | kurti | Kurti, Gala, Baju |
| Gala | gala | Gala |
| Baju | baju | Baju |

No enum, no const array in code — the API reads these rows.

---

## 10. Migration — THREE files, `093`/`094`/`095` (not one `093`)

**Why the split (locking decision 2026-09-07):** PostgreSQL 55P04 forbids
*using* a freshly `ADD VALUE`-ed enum member in the same transaction that added
it. The migration runner wraps each file in one transaction (repo proof:
PROGRESS.md 2026-08-18 — growth's `055` and the original single-file `060` both
failed this way; the known-good splits are 056/057 and 060/061/062). Seeds that
reference `SHOWCASE_DESIGNS` therefore cannot live with the `ALTER TYPE`.

1. **`093_showcase_designs/migration.sql`** — `CREATE TABLE
   showcase_design_categories` + implicit self-M2M join table
   (`_RelatedShowcaseCategories`) + `CREATE TABLE showcase_designs` + indexes +
   FKs (`retailer_id → retailers ON DELETE CASCADE`, `category_id →
   showcase_design_categories` RESTRICT). **No RLS** (§5). Seed the 6
   categories + their related links (§9).
2. **`094_showcase_designs_enums/migration.sql`** — `ALTER TYPE
   "PlanFeatureKey" ADD VALUE 'SHOWCASE_DESIGNS'` + `ALTER TYPE
   "QuotaResourceType" ADD VALUE 'SHOWCASE_DESIGNS'`, alone (nothing uses
   them here).
3. **`095_showcase_designs_plan_rows/migration.sql`** — `PlanFeature` rows
   (default on for all plans; admin can restrict in the matrix) **and**
   `SHOWCASE_DESIGNS` `plan_limits` rows, period `LIFETIME` (F-010 table;
   Starter 20 / Growth 60 / Pro 200 — admin edits on Plan Limits).
   Runs after 094 so the enum values are committed.
4. Watermark-config **defaults live in code** (settings-store KV + fallback,
   §4), not in a migration.
5. Prisma: add models + `Retailer` back-relation + 2 enum values;
   `prisma generate`.

Apply all three via the admin migration runner in order (project rule: no local
`migrate deploy`).

---

## 11. Build phases

1. **Schema + migrations 093–095** — 2 models + self-M2M join + category
   seeds (093), enum adds alone (094 — Postgres 55P04: a fresh enum value
   can't be used in the transaction that added it, see §10), plan-feature +
   plan-limit seeds (095). No RLS (§5), no watermark-config migration seeds
   (§4 — settings KV + code defaults). Generate; verify in prod.
2. **Watermark helper** — `watermark(srcBuf, logoBuf, {opacity,scale,gravity})`
   in `@kanchuki/ai` (or `apps/api/src/lib/`). One `assert`-based self-check
   (output is a valid JPEG, larger canvas untouched, alpha composited).
3. **API** — retailer routes, admin design routes, admin category routes,
   public routes + permalink data, register all. Tests: ownership 403; public
   query expands related categories + hides other retailers; watermark runs on
   create.
4. **Mobile retailer** — API client, list / add / edit screens, entry tile,
   routing. `tsc` + `vitest`.
5. **Mobile customer** — product-detail strip + "View more" browse screen +
   public design detail with Share. Category-resolution helper + self-check.
6. **Retailer social** — "Post to social" entry from design detail →
   `/social/create` prefilled.
7. **Web** — product-detail strip, browse route, public permalink page, 2 admin
   pages, watermark-config block.
8. **Docs** — BUILD-LOG entry, flip this file to Built, CLAUDE.md index row.

Phases 1–5 deliver the retailer + customer mobile experience. 6 is social. 7 is
web. Each phase independently shippable.

---

## 12. What it looks like

### Retailer — Suits Designs listing (mobile)

```
+--------------------------------------+
| RA  Hi, Radha Clothing Store!        |
|     CHANDIGARH - 12 DESIGNS          |
+--------------------------------------+
| [All] [Suits] [Blouse] [Saree] ...   |  <- chips from DB
|  +--------+   +--------+             |
|  | image  |   | image  |             |
|  | (WM)   |   | (WM)   |             |  <- watermarked
|  | Boat   |   | V-Neck |             |
|  | Suits  |   | Gala   |             |
|  +--------+   +--------+       (+)   |  <- FAB
+--------------------------------------+
```

### Retailer — Add Design (mobile, modal)

```
+--------------------------------------+
| X            New Design        Save  |
+--------------------------------------+
|         +--------------+             |
|         |  tap to add  |             |
|         |    photo     |             |
|         +--------------+             |
|  Category *   (chips from DB)        |
|  [Suits] [Blouse] [Saree] [Kurti]    |
|  [Gala]  [Baju]                      |
|  Name (optional)                     |
|  [ Anarkali floor-length          ]  |
|  i  A light Kanchuki/store watermark |
|     is added automatically.          |
+--------------------------------------+
```

### Retailer — Design detail (mobile)

```
+--------------------------------------+
| <        Boat Neck Suit         del  |
+--------------------------------------+
|      +----------------------+        |
|      |   watermarked image  |        |
|      +----------------------+        |
|  Category [Suits v]   Active [x]     |
|  [ Replace photo ]                   |
|  [ Post to Facebook / Instagram ]  --+--> /social/create prefilled
+--------------------------------------+
```

### Customer — product detail (mobile + web)

```
  ... product photos, price, sizes, Enquire ...

  +-- More Ladies Suit -----------------+   <- existing RelatedProductsSection
  |  [img] [img] [img] [img]  ->        |
  +------------------------------------+

  +-- Suits Designs --------- View more +   <- NEW strip (N from DB)
  |  [WM] [WM] [WM] [WM] [WM] [WM]  ->  |
  |  Boat V-Neck Anarkali ...           |
  +------------------------------------+
```

### Customer — "View more" browser (new tab/screen)

```
+--------------------------------------+
| <     Saree Designs                  |
+--------------------------------------+
| [Saree] [Blouse]        (related)    |
|  +--------+  +--------+  +--------+   |
|  | WM img |  | WM img |  | WM img |   |
|  +--------+  +--------+  +--------+   |
|  +--------+  +--------+  +--------+   |
|  | WM img |  | WM img |  | WM img |   |
|  +--------+  +--------+  +--------+   |
+--------------------------------------+
   tap -> public design detail
```

### Customer — public design detail + share

```
+--------------------------------------+
|      +----------------------+        |
|      |   watermarked image  |        |
|      +----------------------+        |
|  Boat Neck - Saree                   |
|  from Radha Clothing Store           |
|                                      |
|  [ Share ]  [ WhatsApp ]  [ Copy ]   |
|  [ Visit store -> ]                  |
+--------------------------------------+
  Share -> system share sheet with
  kanchuki.app/<store>/designs/<id> + image
```

### Admin — /admin/suits-design-categories (web)

```
Suits Design Categories                [ + Add category ]

+----------+--------+------+----------------------+---------+
| Name     | Slug   | Sort | Related              | Active  |
+----------+--------+------+----------------------+---------+
| Saree    | saree  |  30  | Saree, Blouse   [edit]|  yes    |
| Kurti    | kurti  |  40  | Kurti, Gala, Baju [e] |  yes    |
+----------+--------+------+----------------------+---------+
```

### Admin — watermark config (on settings page)

```
Suits Designs - Watermark
  Default logo   [ Kanchuki-logo.png  ][ upload ]
  Opacity        [====o-----] 0.35
  Scale (width%) [===o------] 18%
  Corner         [ Bottom-right v ]
  Strip count    [ 6 ]  (thumbs before "View more")

Plan Limits (Admin -> Plan Limits)
  Showcase designs / retailer   Starter [ 20 ]  Growth [ 60 ]  Pro [ 200 ]
```

---

## 13. Effort

| Phase | Rough size |
|---|---|
| 1 Schema + migration + seeds | 0.75 day |
| 2 Watermark helper | 0.5 day |
| 3 API (4 route files + public + quota check + tests) | 1.75 days |
| 4 Mobile retailer (3 screens + client + entry) | 1.5 days |
| 5 Mobile customer (strip + browse + public detail + share) | 1.5 days |
| 6 Retailer social entry | 0.25 day |
| 7 Web (strip + browse + permalink + 2 admin pages + config) | 2 days |
| 8 Docs | 0.25 day |
| **Total** | **~8.5 days** |

---

## 14. Decisions (locked 2026-09-07)

1. **Plan gating** — `SHOWCASE_DESIGNS` PlanFeature on for all plans; admin can
   restrict in the matrix.
2. **Upload cap — plan-based, admin-set.** `SHOWCASE_DESIGNS` `QuotaResourceType`
   (F-010, same pattern as `STUDIO_SHOOT`). Admin sets the per-plan-tier max on
   Admin → Plan Limits. The retailer create endpoint counts the retailer's
   active designs and rejects (`402`) once the limit is reached; the mobile Add
   screen shows "X of Y designs used" and disables `+` at the cap.
3. **Watermark** — no retailer opt-out. Retailer's own designs get the
   retailer logo (`retailer.logo_url`), falling back to the Kanchuki logo;
   admin/global designs always get the Kanchuki logo.
4. **Permalink** — store-scoped: `kanchuki.app/{store}/designs/<id>`.
5. **Section title / "View more" label** — the resolved category name
   ("Saree Designs", "Kurti Designs"). "Suits Designs" stays the internal
   feature name + the retailer menu label.
6. **Customer design detail** — share-only (system sheet / WhatsApp / copy) +
   "Visit store". No enquiry button (later one-liner if wanted).
7. **Categories are admin-global only.** Retailers pick from the list; they
   cannot create their own design categories (matches `DefaultProductCategory`).

---

## 15. What is dynamic (nothing hardcoded)

| Thing | Where it lives | Who edits |
|---|---|---|
| Design category list (name, slug, sort, active) | `showcase_design_categories` | admin |
| Category → related-categories ("saree shows blouse too") | `_RelatedShowcaseCategories` self-M2M | admin |
| Product category → design category | matched by **name** at query time (+ related expansion) | follows the product taxonomy admin already edits |
| Watermark logo (Kanchuki default) | `SETTING_showcase_watermark` KV blob (fallback: helper default) | admin |
| Watermark opacity / scale / corner | `SETTING_showcase_watermark` KV blob (fallback: helper default) | admin |
| Per-retailer watermark logo | `retailer.logo_url` | retailer |
| Thumbnails before "View more" | `SETTING_showcase_watermark` KV blob (fallback: helper default) | admin |
| Feature availability per plan | `PlanFeature` matrix (F-013) | admin |
| Per-plan design upload cap | `SHOWCASE_DESIGNS` quota limits, per plan tier (F-010) | admin |
| Retailer entry points (home tile / catalog button) | admin toggle | admin |

## 16. Ponytail cuts (still applied)

- **No AI tagging / photo cleanup / ghost-mannequin** on designs — raw image +
  watermark only.
- **No cart / checkout** on designs — share + "Visit store" only.
- **New tables, copied CRUD** — reuse the `DesignReference` + `DefaultProductCategory`
  route patterns, not the tables.
- **Reuse the Social Create-Post composer** for retailer social share — zero
  new publishing code.
- **Re-watermark on logo change is a deferred background job**, not inline.
- **Category match by name**, not a separate product↔design join table — the
  related-category self-M2M covers the "also show blouse" need.

---

## 17. Task board — build one task, test, then next

**Rules of execution**
- Do tasks in order. A task is done only when its **Test** passes and a
  `code-review` pass is clean.
- Every coding task: invoke `superpowers:test-driven-development` first (write
  the failing test / self-check), then implement, then
  `superpowers:verification-before-completion`, then `code-review` (`/code-review`
  or `code-review:code-review`).
- Commit per task (or per small task group) with `caveman:caveman-commit`.
- Migrations apply via the admin runner only — never local `migrate deploy`
  (CLAUDE.md operational policy).
- `CLAUDE.md` index edit (T8.1) needs explicit human approval.

Legend — **S:** skills to invoke · **F:** files · **T:** test/verify · **D:** done when

### Phase 1 — Schema & migration

- [x] **T1.1 Prisma models**
  S: `ecc:prisma-patterns`
  F: `packages/db/prisma/schema.prisma` — `ShowcaseDesignCategory` (self-M2M
  `RelatedShowcaseCategories`), `ShowcaseDesign`, `Retailer.showcase_designs`
  back-relation
  T: `pnpm --filter @kanchuki/db exec prisma validate` + `prisma format` clean
  D: models compile, relation names resolve

- [x] **T1.2 Migration 093 SQL** ✅ (2026-09-07 — written, schema-verified)
  S: `ecc:database-migrations`
  F: `packages/db/prisma/migrations/093_showcase_designs/migration.sql` — 2
  tables + implicit join table + 3 indexes + FKs
  (`retailer_id → retailers ON DELETE CASCADE`, `category_id` RESTRICT).
  **No RLS, no GRANTs** (§5 — matches post-Railway convention: 069/089/090/091;
  default privileges cover the app role).
  T: `prisma validate` clean; `prisma migrate diff --from-empty
  --to-schema-datamodel` shows the hand-written DDL matches the models
  (columns, index names, FK names, join table) ✅
  D: migration file matches the model

- [x] **T1.3 Seeds** ✅ (2026-09-07)
  S: `ecc:database-migrations`
  F: 093 seeds the 6 categories + related links (§9); **094** adds the two
  `ALTER TYPE ... ADD VALUE` statements alone (55P04 split, §10); **095**
  seeds the `PlanFeature` `SHOWCASE_DESIGNS` rows (all plans on) + the
  `SHOWCASE_DESIGNS` `plan_limits` rows (LIFETIME; Starter 20 / Growth 60 /
  Pro 200). Watermark config is NOT migration-seeded (§4 — settings KV with
  code defaults)
  T: row counts asserted on a scratch DB at apply time
  D: fresh DB has categories, plan rows, quota rows; 094 committed before 095

- [ ] **T1.4 Generate + apply + verify** — 🔴 OWNER (admin runner, no prod
    writes by the agent)
  S: `use-railway` (only to read deploy state — no `railway up`)
  F: `packages/db` client regen
  T: `prisma generate` clean; apply **093 → 094 → 095** via admin migration
  runner; then in prod: `\d showcase_designs`, `\d showcase_design_categories`,
  `SELECT` the 6 category rows + 3 plan-feature + 3 plan-limit rows,
  `SELECT enum_range(NULL::"PlanFeatureKey")` contains SHOWCASE_DESIGNS
  D: tables + enum values + seeds confirmed in prod, `_prisma_migrations` has
  093/094/095

### Phase 2 — Watermark helper

- [x] **T2.1 `watermark()` helper** ✅ (2026-09-07)
  S: `superpowers:test-driven-development`
  F: `packages/ai/src/watermark.ts` — `watermark(srcBuf, logoBuf, {opacity,
  scale, gravity})` via `sharp` composite (lazy import — native dlopen crash
  guard, same as image-rotate.ts); validate input (header-only metadata read
  first → reject non-images + decompression bombs: max 50MP / 12k dimension,
  `maxPixels` test hook); alpha-multiplied fade (raw RGBA pass); baseline JPEG
  output (mozjpeg off). Exported from `@kanchuki/ai`
  T: `packages/ai` `vitest` 5/5 — output is a valid baseline JPEG with source
  dims, bottom-right corner is visibly lighter after a white logo @ opacity
  (alpha composited), alternate gravity moves the logo, oversized input
  rejected via `maxPixels`, garbage/empty buffers rejected
  D: helper + its test green; exported from `@kanchuki/ai`

- [x] **T2.2 Logo resolution helper** ✅ (2026-09-07)
  S: (investigator step done — `retailer.logo_r2_key` lives on the Retailer
  model; the platform-logo/settings reader is `getSetting` in
  `routes/admin-settings/settings-store.ts`)
  F: `apps/api/src/lib/showcase-watermark.ts` —
  `resolveWatermark(ownerRetailerId | null)` → `{logoBuf, opacity, scale,
  gravity, strip_count, logo_source}` (retailer logo → platform key from the
  `SETTING_showcase_watermark` KV blob → built-in Kanchuki asset from
  `apps/web/public/kanchuki-logo.png`, resolved via `import.meta.url` — the
  API Dockerfile `COPY . .`s the repo root). Pure helpers
  `mergeShowcaseWatermark` (defaults + clamp: `DEFAULT_SHOWCASE_WATERMARK`
  opacity 0.35 / scale 0.18 / gravity southeast / strip_count 6) and
  `pickWatermarkLogoKey` are unit-tested separately
  T: `vitest` 12/12 (mocked `@kanchuki/ai` downloadBuffer + prisma) — global
  + no key → builtin; global + platform key → platform; retailer with logo →
  retailer key; retailer without → platform key → builtin; config blob merge
  + clamps; `getShowcaseWatermarkConfig` reads the audit-log KV setting
  D: helper + test green

> Config note: the watermark defaults (logo key, opacity 0.35, scale 0.18,
> gravity southeast, strip count 6) come from this helper when the
> `SETTING_showcase_watermark` KV blob is absent (§4) — the admin settings
> page PUTs the blob over them.

### Phase 3 — API

- [x] **T3.1 Quota + shared guards**
  S: `caveman:cavecrew-investigator` (find the F-010 quota helper used by
  `STUDIO_SHOOT`), `ecc:backend-patterns`
  F: `apps/api/src/lib/showcase-quota.ts` —
  `assertShowcaseQuota(retailerId)` (active `ShowcaseDesign` count vs plan
  `SHOWCASE_DESIGNS` limit → throw `402`), `getShowcaseUsage(retailerId)` →
  `{used, limit}`
  T: `vitest` — under limit passes, at limit throws 402, unlimited plan passes
  D: helper + test green

- [x] **T3.2 Retailer routes**
  S: `ecc:api-design`, `superpowers:test-driven-development`
  F: `apps/api/src/routes/retailers/retailers-showcase-designs.ts` — `GET`
  list (mine+global, `?category`), `GET /categories`, `GET /upload-url`
  (presigned raw PUT), `POST` (`assertShowcaseQuota` → `resolveWatermark` →
  `watermark` → upload final → create `retailer_id=self`, keep
  `original_r2_key`), `PUT /:id` (owner 403, photo replace re-watermarks +
  deletes old objects), `DELETE /:id` (owner 403, deletes final+raw R2 +
  row) + register
  T: `vitest` — ownership 403 on PUT/DELETE of a global/other row; quota 402
  at cap; POST persists watermarked url + original_r2_key; `GET` returns
  mine+global only
  D: route file + tests green, registered

- [x] **T3.3 Admin design routes**
  S: `ecc:api-design`
  F: `apps/api/src/routes/admin/admin-showcase-designs.ts` (copy
  `admin-design-references.ts`) — CRUD, `?scope=global|retailer&retailer_id`,
  `GET /stats` (total/active/by_category/global-vs-retailer), create
  watermarks with the platform logo; register in `admin.ts` + admin index
  T: `vitest` — create defaults `retailer_id=null`; stats shape; delete
  removes R2 objects
  D: routes + tests green, registered

- [x] **T3.4 Admin category routes**
  S: `ecc:api-design`
  F: `apps/api/src/routes/admin/admin-showcase-design-categories.ts` — CRUD
  (name/slug/sort/active) + `PUT /:id/related {related_ids: string[]}`;
  register
  T: `vitest` — create/rename/deactivate; setting related links round-trips;
  slug uniqueness enforced
  D: routes + tests green, registered

- [x] **T3.5 Public routes**
  S: `ecc:api-design`, `ecc:security-review` (no cross-retailer leak)
  F: `apps/api/src/routes/public/public-showcase-designs.ts` —
  `GET ?product_id` (resolve product `category` name → `ShowcaseDesignCategory`
  → expand `related` → `is_active`, `(retailer_id IS NULL OR = product's
  retailer)`, `limit = showcase.strip.count`), `GET ?store&category` (paginated
  browse feed), `GET /:id` (permalink: image, store name/slug, category);
  all `withPublicCache`, `s-maxage=300`; register
  T: `vitest` — saree product returns saree+blouse (seeded relation), never
  another retailer's rows, inactive hidden, limit honoured; permalink 404 for
  inactive
  D: routes + tests green, registered

- [x] **T3.6 API review gate**
  S: `code-review:code-review`, `ecc:security-review`
  T: review clean on RLS reliance + ownership + public leak + R2 cleanup +
  quota bypass; full `apps/api` `vitest` green; `tsc` + Biome clean
  D: no unresolved findings

### Phase 4 — Mobile retailer

- [x] **T4.1 API client**
  S: `caveman:cavecrew-investigator` (match `categories.ts` client style)
  F: `apps/mobile/src/lib/api/showcase-designs.ts` + re-export in
  `src/lib/api/index.ts` — `listMine`, `categories`, `getUploadUrl`,
  `create`, `update`, `remove`, `usage`
  T: `tsc` clean
  D: client compiles, exported

- [x] **T4.2 Listing screen**
  S: `vercel-react-native-skills`, `impeccable`
  F: `apps/mobile/app/showcase-designs/index.tsx` — catalog-style header +
  DB category chips + 2-col `FlatList` + `+` FAB (disabled at cap) + "X of Y
  used" badge; `useScreenInsets` bottom clearance
  T: mobile `tsc` + `vitest`; renders grid, chips filter, FAB disabled state
  D: screen matches catalog listing look, green

- [x] **T4.3 Add screen**
  S: `vercel-react-native-skills`, `impeccable`
  F: `apps/mobile/app/showcase-designs/new.tsx` (modal) — `expo-image-picker`
  → `compress-image` → `getUploadUrl` → `uploadImageToR2` (raw) → DB category
  chips (required) → name → Save → `create({category_id, name, raw_r2_key})`
  T: `tsc` + `vitest`; manual: add a design, appears watermarked in the list
  D: create flow works end to end

- [x] **T4.4 Edit/detail screen**
  S: `vercel-react-native-skills`, `impeccable`
  F: `apps/mobile/app/showcase-designs/[id].tsx` — image, replace photo
  (re-watermark), category, name, active toggle, delete (confirm)
  T: `tsc` + `vitest`; manual: rename / recategorise / replace / delete
  D: all edit paths work

- [x] **T4.5 Routing + entry point**
  S: `caveman:cavecrew-builder`
  F: `apps/mobile/app/_layout.tsx` (register 3 routes under `isAuthed`),
  `apps/mobile/app/(tabs)/index.tsx` (entry tile in "Catalog & Products",
  shown per the admin entry-point toggle)
  T: `tsc`; manual: tile → listing; hardware back behaves
  D: reachable from the dashboard

- [x] **T4.6 Mobile retailer review gate**
  S: `ecc:react-review`, `code-review:code-review`
  T: review clean; mobile `vitest` full green; `tsc` + Biome clean
  D: no unresolved findings

### Phase 5 — Mobile customer

- [x] **T5.1 Category-resolution helper** — ⚠️ SUPERSEDED, not built. The
  public `?product_id` route resolves the product→showcase category (name
  match + related expansion) server-side and returns `{ slug, name, related }`
  in the payload, so a client-side `apps/mobile/src/lib/showcase-category.ts`
  is unnecessary. `ShowcaseDesigns.tsx` reads `res.data.category.name`
  directly. No file, no test — intentional (Sr-dev review 2026-09-07, §19).

- [x] **T5.2 Product-detail strip**
  S: `vercel-react-native-skills`, `impeccable`
  F: `apps/mobile/src/components/product-detail/ShowcaseDesigns.tsx` — fetch
  `publicForProduct(productId)`, N thumbs + "View more" → `browse`; render in
  `app/product/[id].tsx` right after `<RelatedProductsSection>`; hidden when
  empty
  T: `tsc` + `vitest`; manual on a product with/without matching designs
  D: strip shows, "View more" navigates

- [x] **T5.3 Browse screen**
  S: `vercel-react-native-skills`, `impeccable`
  F: `apps/mobile/app/showcase-designs/browse.tsx` — related-designs grid +
  related-category chips, paginated public feed, reachable logged-out
  T: `tsc` + `vitest`; manual: scroll/paginate, chip filter
  D: browse works from a product

- [x] **T5.4 Public design detail + share**
  S: `vercel-react-native-skills`, `impeccable`
  F: `apps/mobile/app/showcase-designs/view/[id].tsx` — big watermarked
  image, store name, **Share** (`Share.share` with the
  `{store}/designs/{id}` URL), **WhatsApp** (`wa.me` deep link), **Copy
  link**, **Visit store**
  T: `tsc` + `vitest`; manual: share sheet opens with URL, WhatsApp deep link
  D: all three share paths work

- [x] **T5.5 Routing (logged-out)**
  S: `caveman:cavecrew-builder`
  F: `apps/mobile/app/_layout.tsx` — `showcase-designs/browse` +
  `showcase-designs/view/[id]` reachable while logged out
  T: `tsc`; manual from a shared link / product
  D: routes resolve without a session

- [x] **T5.6 Mobile customer review gate**
  S: `ecc:react-review`, `code-review:code-review`
  T: review clean; mobile `vitest` full green; `tsc` + Biome clean
  D: no unresolved findings

### Phase 6 — Retailer social entry

- [x] **T6.1 Composer prefill contract**
  S: `caveman:cavecrew-investigator`
  F: read `apps/mobile/app/social/create.tsx` — how media is preloaded (param
  / store)
  T: note the exact param shape
  D: contract known — the composer only understood product media; a design is a
  standalone watermarked image. Decided: add a real IMAGE post type end to end
  (enum 096, fan-out image_url item, IMAGE shape/caption rules, `design_id`
  deep-link mode) instead of faking product media. API fanout 869/869,
  mobile 59/59, web 91/91.

- [x] **T6.2 "Post to social" entry**
  S: `vercel-react-native-skills`
  F: `apps/mobile/app/showcase-designs/[id].tsx` — button → `router.push`
  `/social/create?design_id=`; composer resolves the design via
  `showcaseDesignsApi.listMine()`, locks to IMAGE mode (watermarked photo card,
  caption + targets only), and fans out `{ image_url }` to FB/IG
  T: `tsc`; API fanout IMAGE tests (FB + IG + caption + shape) green;
    manual: composer opens with the design image as media
  D: retailer can fan a design out to FB/IG via the existing composer

### Phase 7 — Web

- [x] **T7.1 Product-detail strip (web)** ✅ (2026-09-07)
  S: `vercel-react-best-practices`, `impeccable`
  F: `apps/web/src/app/c/[slug]/components/ShowcaseDesigns.tsx` — strip under
  Related products; "View more" opens `{store}/designs` in a new tab. Hosted
  in `ProductDetailSheet` right after the Related suits block; fed by a new
  query-passthrough proxy `apps/web/src/app/api/showcase-designs/route.ts`
  (`?product_id=` strip shape). Hidden when no designs match, when the fetch
  fails, or on legacy `/c/` pages with no public_slug (no `/{store}/designs`
  route exists behind them — store-scoped surface, mirrors mobile). Thumbs
  deep-link to the store-scoped permalink route
  T: web `tsc` + `vitest` — ShowcaseDesigns.test 4/4 (renders category-titled
    strip + thumbs, View-more href `/{store}/designs?ref=<id>` + `target=
    _blank`, hidden on empty/legacy/failed fetch); full web suite 95/95
  D: strip renders, link opens new tab

- [x] **T7.2 Browse route** ✅ (2026-09-07)
  S: `vercel-react-best-practices`, `ecc:nextjs-turbopack`
  F: `apps/web/src/app/{store}/designs/page.tsx` (SSR: store resolve →
  notFound, metadata, initial feed) + client `DesignsBrowse.tsx` (chips from
  the feed's categories + API `related`, 2-col grid, refetch via the
  `/api/showcase-designs` proxy on chip tap). `?ref=` accepted as provenance.
  Shared `types.ts` + `lib.ts` (`fetchStoreProfile`) for the designs surface
  T: `tsc` + `vitest` — DesignsBrowse.test 3/3 (grid + chips + empty state);
    full web suite 102/102
  D: browse page works

- [x] **T7.3 Public permalink page** ✅ (2026-09-07)
  S: `vercel-react-best-practices`, `ecc:seo`
  F: `apps/web/src/app/{store}/designs/[id]/page.tsx` — SSR watermarked
  image + store name + "Visit store"; OG/Twitter meta (image = the design's
  watermarked R2 file); client `DesignShareActions.tsx` (Web Share API w/
  copy fallback, WhatsApp wa.me, copy link); cross-store leak guard (owner
  slug must equal URL store, else 404); 404 on inactive (public API 404s);
  `revalidate: 300` on the design fetch
  T: `tsc` + `vitest` — page.test 4/4 (owner render, global-under-store
    render, foreign-store 404, unpublished 404)
  D: `kanchuki.app/{store}/designs/{id}` shareable

- [x] **T7.4 Admin — designs page**
  S: `vercel-react-best-practices`, `impeccable`
  F: `apps/web/src/app/admin/suits-designs/page.tsx` (clone
  `admin/background-images/`) — upload → R2 raw → POST, list, lightbox,
  delete, category select, active toggle, owner column
  T: `tsc` + `vitest` — page.test 6/6 (list render + owner badges + category
    option, scope chips refetch, upload presign→PUT→create w/ chosen category,
    no-category refusal pre-network, optimistic active toggle PATCH, delete w/
    confirm + '{}' body); sidebar link wired; web suite 108/108
  D: admin can manage global designs

- [x] **T7.5 Admin — categories page**
  S: `vercel-react-best-practices`, `impeccable`
  F: `apps/web/src/app/admin/suits-design-categories/page.tsx` — list + CRUD
  + related-category multi-select
  T: `tsc` + `vitest`; manual: add category, set related, verify a product
  strip changes
  D: category + relations manageable from the UI

- [x] **T7.6 Admin — watermark config + Plan Limits row**
  S: `caveman:cavecrew-investigator` (find the admin settings + Plan Limits
  pages), `vercel-react-best-practices`
  F: watermark block on the existing admin settings/theme page (logo upload,
  opacity, scale, corner, strip count); `SHOWCASE_DESIGNS` row on
  `apps/web/src/app/admin/plan-limits/`
  T: `tsc` + `vitest`; manual: change opacity → new upload reflects it;
  change a plan limit → retailer cap updates
  D: config editable, takes effect

- [x] **T7.7 Web review gate**
  S: `ecc:react-review`, `code-review:code-review`, `ecc:seo` (permalink)
  T: review clean; web `vitest` full green; `tsc` + Biome clean
  D: no unresolved findings

### Phase 8 — Docs & ship

- [x] **T8.1 Docs**
  S: (manual)
  F: `docs/BUILD-LOG.md` (full entry), this file `Status: → Built`,
  `CLAUDE.md` "What's Built" index row (**needs human approval**)
  T: links resolve; index row matches BUILD-LOG
  D: docs track the commits (CLAUDE.md rule #10/#11)

- [x] **T8.2 Full-suite gate** (re-run 2026-09-07 after §19 cleanup)
  S: `superpowers:verification-before-completion`
  T + result:
    - `@kanchuki/ai` — `watermark.test.ts` **5/5**
    - `@kanchuki/api` showcase suites (9 files) **117/117**:
      `lib/showcase-quota` · `lib/showcase-watermark` · `routes/admin-settings-watermark`
      · `admin/admin-showcase-designs` · `admin/admin-showcase-design-categories`
      · `public/public-showcase-designs` · `retailers/retailers-showcase-designs`
      · `retailers-social/retailers-social-fanout` · `jobs/rewatermark-showcase-designs`
    - `@kanchuki/web` showcase suites (6 files) **29/29**:
      `c/[slug]/…/ShowcaseDesigns` (4) · `[store]/designs/[id]/page` (4)
      · `[store]/designs/DesignsBrowse` (3) · `admin/settings/theme/ShowcaseWatermarkSettings` (5)
      · `admin/suits-designs/page` (7) · `admin/suits-design-categories/page` (6)
    - `@kanchuki/mobile` full **59/59** (no showcase-specific unit tests — see §19)
    - `tsc --noEmit` **clean** on api / web / mobile / ai
    - Biome **clean** on api + web showcase files; `next lint` (web) clean;
      `expo lint` (mobile) — no issue on any showcase file (1 pre-existing repo
      error in `ProductGridPicker.tsx`, unrelated, not an `eas build` gate)
  D: everything green ✅ except prod migration apply (T1.4, owner)

- [ ] **T8.3 Ship**
  S: `caveman:caveman-commit`, `superpowers:finishing-a-development-branch`
  T: commits per phase pushed; PR opened; deploy (push to main → Railway)
  D: live; T5/T7 manual smoke on prod

---

## 18. Skills index (who does what)

| Skill | Used in |
|---|---|
| `superpowers:executing-plans` | drives this whole task board, phase by phase |
| `superpowers:test-driven-development` | every coding task — failing test / self-check first |
| `superpowers:verification-before-completion` | end of every task + T8.2 |
| `code-review:code-review` (`/code-review`) | review gate at end of each phase (T3.6, T4.6, T5.6, T7.7) |
| `ecc:prisma-patterns` | T1.1 |
| `ecc:database-migrations`, `supabase:supabase-postgres-best-practices` | T1.2, T1.3 |
| `use-railway` | T1.4 (read deploy state only — never `railway up`) |
| `ecc:api-design`, `ecc:backend-patterns` | T3.1–T3.5 |
| `ecc:security-review` | T3.5, T3.6 (RLS reliance, cross-retailer leak, ownership, quota bypass) |
| `caveman:cavecrew-investigator` | T2.2, T3.1, T4.1, T6.1, T7.6 (locate existing patterns/contracts) |
| `caveman:cavecrew-builder` | T4.5, T5.5 (small mechanical route wiring) |
| `vercel-react-native-skills` | T4.2–T4.4, T5.2–T5.4, T6.2 |
| `vercel-react-best-practices`, `ecc:nextjs-turbopack` | T7.1–T7.6 |
| `ecc:seo` | T7.3 (permalink OG/meta), T7.7 |
| `impeccable` | every new screen/page — match catalog + admin look |
| `ecc:react-review` | T4.6, T5.6, T7.7 |
| `caveman:caveman-commit` | commit per phase, T8.3 |
| `superpowers:finishing-a-development-branch` | T8.3 |

> First step when development starts: invoke `superpowers:executing-plans` with
> this file, create a todo per unchecked task, and work Phase 1 → Phase 8. Do
> not start a task until the previous one's Test + review gate are green.

---

## 19. Sr-dev review + cleanup pass (2026-09-07)

Full read of every file in the feature except the watermark helpers
(`packages/ai/src/watermark.ts`, `apps/api/src/lib/showcase-watermark.ts`,
`apps/api/src/routes/admin-settings/showcase-watermark.ts`,
`apps/api/src/jobs/rewatermark-showcase-designs.ts`) — left untouched per the
owner's "don't rewrite watermark". Scope: dead/extra code, what's left to build.

### Fixed (2 mobile changes, no rewrites)

1. **Dead file read.** `app/showcase-designs/new.tsx` + `[id].tsx` did
   `const blob = await readLocalImage(uri)` purely to pass `blob.size` into
   `showcaseDesignsApi.getUploadUrl(ct, size)` — a param the client already
   discarded (`_sizeBytes`) and the `/upload-url` route never accepts (it takes
   `content_type` + `filename`). `uploadImageToR2` reads + compresses the file
   itself. Removed the read + the size arg; `getUploadUrl` is now
   `(contentType: string)`.

2. **Broken customer native share.** `app/showcase-designs/view/[id].tsx`
   `handleShare` handed a remote R2 `https://` URL to `expo-sharing`
   `shareAsync` — which only accepts local `file://` URIs. On a device it
   threw, `catch {}` swallowed it, and the `Share.share` fallback was
   unreachable behind `Sharing.isAvailableAsync()`. The native path now calls
   RN's built-in `Share.share({ message })` with the permalink in the body
   (same pattern as `app/store-profile.tsx`); `navigator.share` still handles
   web. `expo-sharing` import dropped from this screen (still a repo dep —
   used by `store-profile.tsx` + `useProductAiStudio.ts`).

### Left as-is on purpose (not debt)

- **Browse pagination is a stub** — `next_cursor` is always `null`, the public
  route caps at `BROWSE_PAGE_SIZE = 24`. Fine until a store exceeds 24 active
  designs; add a real cursor then. Consumers (`browse.tsx`, `DesignsBrowse.tsx`)
  never read `next_cursor`.
- **`?ref=<productId>` provenance** is wired on web (`/{store}/designs?ref=`)
  but the mobile browse screen ignores it (takes `?store` / `?category`).
  Provenance only — no functional effect either way.
- **rewatermark-showcase-designs job (165 LOC)** is heavier than §2.5's
  "`ponytail:` add when a retailer actually rebrands" note, but it is built,
  wired to the admin watermark-config PUT (stamp-affecting fields only), and
  tested (5/5). Ripping it out now = churn.
- **`countActiveShowcaseDesigns` exported** from `showcase-quota.ts` for its
  test; harmless.
- **`getShowcaseUsage` returns `remaining: Infinity`** for unlimited plans,
  which JSON-serialises to `null`. Mobile keys off `unlimited` / `limit`, so
  no visible bug — cosmetic.
- **`createHash(...)` filename minting** in `admin-showcase-designs.ts` +
  `admin-settings/showcase-watermark.ts` where the retailer route uses
  `createId()`. Both are collision-safe enough; not worth a change.
- **`[id].tsx` seeds edit-form state via `setState` during render** (guarded by
  `seeded`). Works; a `useEffect` keyed on `design?.id` would be idiomatic.
  Left — no loop, no bug.

### What's left for development

| Item | Owner | Blocking? |
|---|---|---|
| **T1.4** — apply migrations 093 → 094 → 095 → 096 via the admin runner in prod, verify tables/enums/seed rows | owner | **YES** — `hasFeature` fails closed, so Suits Designs is OFF on every plan until 095's `plan_features` rows exist |
| **T8.3** — commit per phase already pushed; open PR; deploy (push to main → Railway); T5/T7 manual smoke on prod | owner | to ship |
| Browse cursor pagination | later | no — YAGNI < 24 designs/store |
| Mobile unit tests for the showcase screens/client | later | no — `tsc` + API/web suites cover the contracts; T5.1 helper was correctly not built |

### EAS compile readiness

Ready. `tsc --noEmit` clean on mobile, `vitest` 59/59, `expo lint` clean on
every showcase file, no native config (`app.json`) change from this feature's
mobile work, no new dependency (`expo-clipboard` was the only add — already in
`package.json` + lockfile + `node_modules`). `eas build` does not run
`expo lint`, so the one pre-existing repo lint error
(`src/components/social/ProductGridPicker.tsx`, from commit `23fc2eb3`) is not
a build blocker.
