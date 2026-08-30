# AI Studio Shoot — DB-Backed Style Catalog + Admin Manager

**Date:** 2026-08-30
**Status:** Design approved — ready for implementation plan
**Feature ref:** F-032 Phase A (AI Studio Shoots) — extends #53/#54 in CLAUDE.md What's-Built index

---

## Problem

AI Studio Shoot styles live in a hardcoded constant `STUDIO_TEMPLATES`
(`packages/shared/src/constants/index.ts`) — 18 shipped + ~30 `draft:true`
legacy. Mobile (`ProductStudioModal.tsx`) and the API (`studio-shoot.ts`,
`jobs/studio-shoot.ts`) import it directly. Consequences:

- No way to publish / hide / draft a style without a code deploy.
- No per-plan gating — every retailer sees the same list.
- No sample-output thumbnails, so retailers pick blind.
- The "Fashion Models" mobile tab is 4 fixed IDM-VTON photo identities
  (`STUDIO_MODELS`), a separate code path from the scene templates.

## Goal

1. Move styles into a DB table the super-admin manages from a new admin page:
   create, edit prompt, publish / hide / draft, assign to plans, upload a
   sample-output thumbnail, reorder.
2. Per-plan visibility — admin ticks Starter / Growth / Pro per style (any
   combination). Nothing is visible to a retailer until admin publishes it
   AND assigns it to that retailer's plan.
3. Mobile picker: two tabs — **Product Only** (no person) and **Models**
   (person rendered, swapped by the product's demographic — kids / men /
   teen included, no manual model pick). Keep the `Label (/slug)` row text.
4. Retire the IDM-VTON photo-model path; the "Models" tab is prompt-based
   person-swap (mechanism already built for the demographic feature).
5. Seed the catalog with a fixed set of 29 existing styles; drop the rest.

## Non-goals

- No change to the generation engine cascade (Fal Flux Pro → Imagen 3 →
  Fal Schnell → BFL FLUX Kontext Pro), the BullMQ queue, the quota system
  (`STUDIO_SHOOT` `QuotaResourceType`), or the credits-per-image display.
- No retailer-facing style authoring — admin only.
- No i18n of style labels.
- No migration auto-apply — the owner applies migrations.

---

## Approach (chosen)

**DB table + retailer API endpoint; mobile fetches at runtime, cached.**

The `StudioStyle` table is the single source of truth. A new retailer-auth
endpoint returns the published styles the retailer's plan is allowed to see.
Mobile fetches it via react-query (last response cached for offline). The
generate-path reads the style row by slug. Admin CRUD + thumbnail upload
mirrors the existing `admin-media.ts` / `admin/background-images` library
(one of five already-established admin-managed libraries in this codebase:
background images, festival backgrounds, social templates, default
categories, default attributes).

Rejected:
- *Regenerate the constant from DB at build time* — every publish/hide
  needs a deploy, defeats the point.
- *One JSON blob in a settings row* — no per-row query/index, weak
  validation, thumbnails still need R2 rows, plan filter moves to app code.

---

## §1 — Data model

`packages/db/prisma/schema.prisma`:

```prisma
enum StudioStyleStatus {
  DRAFT       // admin bench only, never returned to retailers
  PUBLISHED   // live (subject to plan assignment)
  HIDDEN      // was live, pulled; kept for history / quick re-publish
}

enum StudioStyleTab {
  PRODUCT   // no person in frame (today's isNoModelTemplate rows)
  MODEL     // person rendered, swapped per product demographic
}

model StudioStyle {
  id               String            @id @default(cuid())
  slug             String            @unique   // "pastel_gradient" — stable, == the /command, used by the generate-path
  label            String                      // "Pastel Gradient Lounge"
  description      String
  prompt           String                      // scene prompt; colour-lock guard + tail still appended in code
  tab              StudioStyleTab
  status           StudioStyleStatus @default(DRAFT)
  plans            SubscriptionPlan[] @default([])  // which plan tiers may use this style; [] = nobody
  engine           String?                     // null = default cascade; else flux_pro | imagen_3 | imagen_3_fast | flux_schnell | bfl_kontext
  audience         String[]          @default([])   // [] = all demographics; else subset of PRODUCT_DEMOGRAPHICS
  thumbnail_url    String?                     // admin-uploaded sample OUTPUT image (R2)
  thumbnail_r2_key String?
  sort_order       Int               @default(0)
  usage_count      Int               @default(0)   // bumped in the job on success
  created_at       DateTime          @default(now())
  updated_at       DateTime          @updatedAt

  @@index([status])
  @@map("studio_styles")
}
```

Notes:
- `tab` replaces the `noModel` boolean. `PRODUCT` == today's
  `isNoModelTemplate(t)` result for the seeded row.
- `plans` is a Postgres enum array. Retailer filter:
  `where: { plans: { has: retailer.plan } }` (Prisma) / `retailer.plan = ANY(plans)` (SQL).
  No ladder semantics — Starter-only, Starter+Pro, all-three, etc. are all valid.
- `engine` is a plain nullable string validated against the existing
  `StudioEngine` union at the route layer (no new enum — the set is small
  and already lives in `lib/studio-shoot.ts`).
- `audience` values are the existing `PRODUCT_DEMOGRAPHICS` strings
  (`womens`, `mens`, `teen_girl`, `teen_boy`, `kids_girl`, `kids_boy`).

### Migration `075_studio_styles`

Written by the implementer, **applied by the owner** (Supabase SQL editor
or `prisma migrate deploy`).

1. `CREATE TYPE "StudioStyleStatus"`, `CREATE TYPE "StudioStyleTab"`.
2. `CREATE TABLE studio_styles (...)`.
3. `INSERT` the 29 seed rows (below) — `status = 'DRAFT'`, `plans = '{}'`,
   `prompt` / `description` / `audience` copied verbatim from the current
   `STUDIO_TEMPLATES` entry, `tab` set per the list, `sort_order` = list
   index, `engine = NULL`, `thumbnail_url = NULL`.

### Seed rows (29)

Slugs are the current `STUDIO_TEMPLATES[].id`. `MODEL` = person rendered.

**MODEL tab (21):**

| slug | label | audience |
|------|-------|----------|
| `blossom_atrium` | Blossom Atrium | — |
| `boutique_showroom` | Boutique Showroom | — |
| `runway` | Catwalk Runway | — |
| `copper_diamond` | Copper Diamond Backdrop | — |
| `dupatta_motion` | Dupatta in Motion | `womens` |
| `rooftop_golden` | Golden-Hour Rooftop | — |
| `gradient_hero` | Gradient Campaign Hero | — |
| `heritage_library` | Grand Heritage Library | — |
| `heritage_street` | Jaipur Heritage Street | — |
| `lakeside_deck` | Lakeside Deck View | — |
| `mall_concourse` | Modern Mall Concourse | — |
| `pastel_gradient` | Pastel Gradient Lounge | — |
| `botanical_garden` | Royal Botanical Garden | — |
| `seated_haveli_steps` | Seated Haveli Steps | `womens` |
| `studiomodel` | Studio Editorial | — |
| `teen_street` | Teen Street Style | `teen_girl`, `teen_boy` |
| `tree_tunnel` | Tree-Tunnel Avenue | — |
| `editorial_vogue` | Vogue Editorial | — |
| `male_with_car` | Male with Car | `mens`, `teen_boy` |
| `male_with_bike` | Male with Bike | `mens`, `teen_boy` |
| `kids_playing` | Kids Playing Outdoors | `kids_boy`, `kids_girl` |

**PRODUCT tab (8):**

| slug | label |
|------|-------|
| `display_hanger` | Styled Hanger |
| `studio_home` | Lifestyle Home Studio |
| `studio_minimal` | Minimal Clean Studio |
| `display_mannequin` | Mannequin Presentation |
| `studio_pro` | Professional Studio |
| `studio_beige` | Warm Beige Studio |
| `wedding_elegant` | Wedding Florals |
| `warm_luxury` | Warm Luxury |

Every other current `STUDIO_TEMPLATES` entry (and all `STUDIO_MODELS`) is
**not** seeded and its code is deleted (§5).

### `R2_PATHS`

Add to `packages/shared/src/constants/index.ts`:

```ts
studioStyleThumb: (filename: string) => `admin/studio-styles/${filename}`,
```

---

## §2 — API: retailer endpoint + generate path

### New: `GET /v1/studio-styles`

- Retailer-auth (same preHandler as other `/v1/...` retailer routes).
- Resolve `retailer.plan`.
- Return rows where `status = 'PUBLISHED' AND plans has retailer.plan`,
  ordered `sort_order ASC, created_at ASC`.
- Payload per row: `slug, label, description, tab, audience, engine,
  thumbnail_url`. **`prompt` is NOT included** — server-side only.
- Registered wherever the retailer product routes are mounted.

### `apps/api/src/routes/products/products-studio.ts`

`POST /:id/photos/:photoId/studio-shoot`:

- Body: `{ template: string }` only. Drop `engine` and `model_id` from
  `StudioShootBodySchema`.
- Replace `getStudioTemplate(body.data.template)` with:
  ```ts
  const style = await prisma.studioStyle.findFirst({
    where: { slug: body.data.template, status: 'PUBLISHED' },
  });
  if (!style) throw validationError('Unknown or unavailable studio style.', 'template');
  ```
- Plan gate:
  ```ts
  const retailer = await prisma.retailer.findUniqueOrThrow({
    where: { id: request.retailerId }, select: { plan: true },
  });
  if (!style.plans.includes(retailer.plan)) {
    throw new AppError('FEATURE_UNAVAILABLE',
      'This studio style is not included in your plan.', 403);
  }
  ```
- `checkQuota(request.retailerId, 'STUDIO_SHOOT')` unchanged.
- `addStudioShootJob({ ... slug: style.slug, prompt: style.prompt,
  engine: style.engine ?? undefined, tab: style.tab, audience: style.audience,
  style_id: style.id })` — pass the resolved data so the job never re-reads
  the constant.

`GET .../studio-shoot/quota` — unchanged.

### `apps/api/src/jobs/studio-shoot.ts`

- `StudioShootJobData`: replace `template` / `model_id` with
  `slug: string; prompt: string; tab: 'PRODUCT' | 'MODEL'; engine?: StudioEngine;
  audience: string[]; style_id: string`.
- Pass `prompt` / `engine` / `tab` / `audience` into `generateStudioImage`
  (new options shape below).
- `metadata.studio` on the new `ProductPhoto`: `{ job_id, slug, engine,
  tab, source_photo_id, generated_at }` (drop `template` / `model_id`).
- `recordBflStudioUsage(retailer_id, slug)` — arg rename only.
- After success: `prisma.studioStyle.update({ where: { id: style_id },
  data: { usage_count: { increment: 1 } } })` (best-effort, `.catch`).

### `apps/api/src/lib/studio-shoot.ts`

- `generateStudioImage(inputImageUrl, opts)` — new signature:
  ```ts
  opts: {
    prompt: string;            // the style's scene prompt (was template lookup)
    tab: 'PRODUCT' | 'MODEL';
    engine?: StudioEngine;
    demographic?: Demographic | string;   // admin bench override; else inferred
    audience?: string[];       // reserved; not needed for prompt assembly
    product?: { ...unchanged... };
    onProgress?: (p) => void;
  }
  ```
- Person-swap: run the demographic person-clause injection when
  `tab === 'MODEL'` (was: `template && !isNoModelTemplate(template)`).
  `PRODUCT` → prompt used as-is + colour guard.
- **Delete:** the IDM-VTON branch (`options.engine === 'idm_vton' ||
  options.modelId`), the `getStudioModel` import + usage, `modelPrompt`
  construction, `STUDIO_MODELS`-derived logic. `generateIdmVtonTryon`
  import removed if unused elsewhere (grep first).
- Engine cascade (`flux_pro` / `imagen_3` / `imagen_3_fast` /
  `flux_schnell` → default Fal Kontext → BFL direct) unchanged; `engine`
  now arrives from the style row.
- `StudioEngine` union: drop `idm_vton`.
- Keep `downloadCompressAndUpload`, the Redis job-status helpers, and
  `isStudioShootConfigured` unchanged.

### `apps/api/src/routes/admin/admin-photo-cleanup.ts`

The `/photo-cleanup/studio-shoot` bench route: keep the `prompt` free-text
override and `demographic` override. Replace `getStudioTemplate` +
`template` handling with an optional `slug` that looks up `StudioStyle`
(any status — bench can test drafts). If `slug` given and found, use its
`prompt` / `engine` / `tab`; else require `prompt`. Drop `model_id`.

---

## §3 — Admin

### `apps/api/src/routes/admin/admin-studio-styles.ts`

`server.addHook('preHandler', adminAuthPreHandler)` — mirrors `admin-media.ts`.

- `GET /admin/studio-styles` — all rows (DRAFT / PUBLISHED / HIDDEN),
  ordered `sort_order ASC`. Full payload incl. `prompt`.
- `POST /admin/studio-styles/thumbnail-url` — presigned PUT to R2 using
  `R2_PATHS.studioStyleThumb`, `content_type` ∈ jpeg/png/webp. Returns
  `{ upload_url, r2_key, public_url, expires_in }`. Verbatim shape of
  `POST /admin/background-images/upload-url`.
- `POST /admin/studio-styles` — create. Zod body:
  `slug` (`/^[a-z0-9_]{2,40}$/`, unique — 409 on dup),
  `label` (1–100), `description` (1–300), `prompt` (1–4000),
  `tab` (`PRODUCT` | `MODEL`),
  `status` (enum, default `DRAFT`),
  `plans` (array of `STARTER` | `GROWTH` | `PRO`, default `[]`),
  `engine` (nullable enum of the `StudioEngine` set),
  `audience` (array of `PRODUCT_DEMOGRAPHICS`, default `[]`),
  `thumbnail_url` / `thumbnail_r2_key` (optional),
  `sort_order` (int, default `0`).
  Audit log `CREATE` / `StudioStyle`.
- `PATCH /admin/studio-styles/:id` — every field optional; `slug`
  immutable after create (reject if present and different). Audit log
  `UPDATE` with `{ before, after }` (same shape as `admin-media.ts`).
- `DELETE /admin/studio-styles/:id` — hard delete + best-effort R2 thumb
  delete (`deleteObject` on `thumbnail_r2_key`) + audit `DELETE`.
  No FK from `ProductPhoto` (studio provenance is in `metadata` JSON), so
  delete is safe — past generations keep their metadata.

Route registered in `apps/api/src/routes/admin/index.ts` beside
`adminMediaRoutes`.

### `apps/web/src/app/admin/studio-styles/page.tsx`

Client component, mirrors `plan-features/page.tsx` + `background-images`:

- Loads `GET /v1/admin/studio-styles`.
- Two sections, **Product Only** and **Models**, each a table of that
  tab's rows sorted by `sort_order`.
- Row columns: thumbnail (48px; click → full-size lightbox; "Upload"
  button when null → presign + PUT + PATCH `thumbnail_url`), `label` +
  `slug` (mono, dimmed), `status` control (segmented DRAFT / PUBLISHED /
  HIDDEN), three plan checkboxes (Starter / Growth / Pro) writing `plans`,
  `engine` `<select>` (— default — / the 5 engines), `sort_order` number
  input, Save button (PATCH the row), Delete (confirm).
- Save is per-row (same optimistic cell pattern as `plan-features`),
  status banner on success/failure.
- "New Style" collapsible form above the tables: all fields, `tab` toggle,
  a large `prompt` textarea (placeholder references the
  `docs/tasks/AI Models and Scenes.html` formula style), thumbnail upload,
  plan checkboxes. POST → prepend to the list.
- Sidebar: add `{ href: '/admin/studio-styles', label: 'Studio Styles',
  icon: ... }` beside "Background Images" in
  `apps/web/src/app/admin/components/Sidebar.tsx`.

---

## §4 — Mobile

### `apps/mobile/src/lib/api/products.ts`

Add `getStudioStyles()` → `GET /v1/studio-styles`, typed
`{ data: StudioStylePublic[] }` where `StudioStylePublic = { slug, label,
description, tab: 'PRODUCT' | 'MODEL', audience: string[], engine: string | null,
thumbnail_url: string | null }`. (Type lives in `apps/mobile` or
`@kanchuki/shared` alongside `Demographic`.)

### `apps/mobile/src/hooks/useProductAiStudio.ts`

- `handleStartStudioShoot(slug: string)` — drop the `options` arg.
  `productApi.startStudioShoot(product.id, photo.id, slug)` — drop its
  `options` param too.
- `studioTab` state type `'product' | 'models'` (was `'scenes' | 'models'`).

### `apps/mobile/src/components/product-detail/ProductStudioModal.tsx`

- Remove `import { STUDIO_TEMPLATES, STUDIO_MODELS } from '@kanchuki/shared'`.
- `useQuery(['studio-styles'], () => productApi.getStudioStyles())`.
  Loading → spinner in the picker body; error/empty → "No styles available
  on your plan yet."
- Tabs: **Product Only** (`tab === 'PRODUCT'`) and **Models**
  (`tab === 'MODEL'`).
- Models list filtered by demographic:
  ```ts
  const demo = demographicForCategory(product.category, product.name)
  const modelStyles = styles.filter(s =>
    s.tab === 'MODEL' && (s.audience.length === 0 || s.audience.includes(demo)))
  ```
- Row content: thumbnail from `thumbnail_url` (Wand2 placeholder when
  null), `label`, and a mono sub-label `(/${slug})` — the
  `Label (/pastel_gradient)` format requested. `description` below.
- Delete the entire `STUDIO_MODELS` branch and `LOCAL_STUDIO_THUMBNAILS`
  map.
- `onStartShoot(selectedSlug)` — no options.
- Generate button, quota banner, progress / ready / failed views —
  unchanged.

### `apps/mobile/app/product/[id].tsx`

`<ProductStudioModal>` prop wiring: drop anything model-tab specific that
referenced `STUDIO_MODELS`; `onStartShoot={studio.handleStartStudioShoot}`
signature is now `(slug) => void`.

---

## §5 — Shared constant cleanup, tests, docs

### `packages/shared/src/constants/index.ts`

- **Delete:** `STUDIO_TEMPLATES`, `STUDIO_MODELS`, `getStudioTemplate`,
  `getStudioModel`, `isNoModelTemplate`, `studioTemplatesFor`,
  `StudioTemplateId`, `StudioModelId`.
- **Keep:** `PRODUCT_DEMOGRAPHICS`, `Demographic`, `demographicForCategory`,
  `STUDIO_CREDITS_PER_IMAGE`, any `resolveDemographic` helpers used elsewhere.
- Add `R2_PATHS.studioStyleThumb`.
- Grep for every importer of the deleted symbols and update
  (`scripts/studio-shoot-demo.mjs`, `apps/api/src/lib/studio-shoot.test.ts`,
  `apps/api/src/routes/products-studio.test.ts`, any others).

### Tests

- New `apps/api/src/routes/admin-studio-styles.test.ts`: create (slug
  regex, 409 dup), patch (status transitions, plans array, slug immutable),
  delete, thumbnail-url presign shape, admin-auth required.
- Update `apps/api/src/routes/products-studio.test.ts`: seed a
  `StudioStyle` in the test DB / mock; assert slug lookup, `403
  FEATURE_UNAVAILABLE` when `retailer.plan ∉ plans`, `202` when allowed,
  unknown slug → validation error.
- Update `apps/api/src/lib/studio-shoot.test.ts`: `generateStudioImage`
  new signature — `prompt` used verbatim, person-swap only when
  `tab === 'MODEL'`, no `STUDIO_MODELS` reference, `idm_vton` gone.
- Run per CLAUDE.md after auth/checkout-adjacent changes:
  `npx vitest run src/routes/security.test.ts`,
  `npx vitest run src/routes/admin.login.test.ts`.
- `npx tsc --noEmit` in `apps/api` and `apps/mobile` → clean.

### Docs (same session as the implementation commit)

- `CLAUDE.md` — What's-Built index: new row "AI Studio Shoot — DB-backed
  style catalog + admin manager + per-plan assignment + Product/Models
  mobile tabs; IDM-VTON retired". Update #54 row (demographic step 6
  superseded by this).
- `docs/BUILD-LOG.md` — full entry with the file table.
- `docs/tasks/ai-studio-shoot-models-scenes.md` — mark step 6 done via
  this spec; note `STUDIO_TEMPLATES` / `STUDIO_MODELS` removed.
- `docs/PRO-REQUIREMENTS.md` — F-032 section: styles now DB-managed,
  per-plan.
- `docs/PLAN.md` — reflect the status.
- `docs/DATABASE.md` — add the `studio_styles` table.

---

## Data flow

```
Admin page  ──PATCH /v1/admin/studio-styles/:id──►  studio_styles row
   (status PUBLISHED, plans [STARTER,PRO], thumbnail, engine)

Retailer app
   GET /v1/studio-styles ──►  rows WHERE status=PUBLISHED AND plans has plan
                              (no prompt field)
   picker: tab=PRODUCT | tab=MODEL(filtered by demographicForCategory)
   tap Generate(slug)
     │
     ▼
   POST /products/:id/photos/:photoId/studio-shoot { template: slug }
     ├─ studio_styles.findFirst(slug, status=PUBLISHED)  → 422 if missing
     ├─ retailer.plan ∈ style.plans                       → 403 if not
     ├─ checkQuota(STUDIO_SHOOT)                           → 402 if over
     └─ addStudioShootJob({ slug, prompt, engine, tab, audience, style_id })
           │
           ▼  BullMQ STUDIO_SHOOT queue
     generateStudioImage(url, { prompt, tab, engine, demographic, product })
        tab=MODEL → inject demographic person clause
        tab=PRODUCT → prompt as-is
        + sceneGuard + colourEnforcement  → engine cascade
           │
           ▼
     new ProductPhoto (metadata.studio = { slug, engine, tab, ... })
     studio_styles.usage_count += 1
     incrementUsage(STUDIO_SHOOT)
     Redis job status → mobile poll → picker shows result
```

## Error handling

| Case | Response |
|------|----------|
| Slug not found or not PUBLISHED | `422` validation error, "Unknown or unavailable studio style." |
| `retailer.plan ∉ style.plans` | `403 FEATURE_UNAVAILABLE`, "This studio style is not included in your plan." |
| Over `STUDIO_SHOOT` quota | `402 PLAN_LIMIT_EXCEEDED` (unchanged) |
| No AI key configured | `503` (unchanged, `isStudioShootConfigured`) |
| Generation fails / times out | job writes `failed` status + safe message (unchanged) |
| Admin create: dup slug | `409` |
| Admin create: bad slug format | `422` |
| Retailer offline | react-query serves last cached `/v1/studio-styles`; empty → "No styles available" |
| Retailer picker while a style is unpublished mid-session | next generate call 422s; picker refetches on modal reopen |

## Testing strategy

- Unit: `generateStudioImage` prompt assembly for both tabs + each
  demographic; admin route CRUD + validation; retailer endpoint plan
  filter.
- Integration: `products-studio.test.ts` full POST path with a seeded
  style at each plan combo.
- Regression: `security.test.ts`, `admin.login.test.ts`, `tsc` both apps.
- Manual (owner, post-deploy): apply migration → admin page loads 29
  DRAFT rows → publish + assign a few → mobile picker shows exactly the
  assigned ones per plan → generate on a Product-only style and a Model
  style for a womens / mens / kids product → thumbnail upload round-trips.

## Rollout

1. Implementer lands code + migration file on a branch, PR to `main`.
2. Owner applies `075_studio_styles` (Supabase SQL editor / `migrate deploy`).
3. Railway auto-deploys `main`.
4. Until the owner publishes styles in the admin page, the mobile picker
   is **empty** (by design — "admin decides"). Owner curates, assigns
   plans, uploads thumbnails.
5. Mobile clients pick up the new picker on next app update; ship the
   mobile update in the same release train as the API (the hardcoded
   `STUDIO_TEMPLATES` is deleted).

## Risks

- **Old mobile builds** call `POST .../studio-shoot { template: <old-id> }`.
  Old ids == new slugs for the 29 kept styles, so a still-published style
  keeps working; a dropped style 422s with a clear message. Acceptable.
- **Empty picker window** between deploy and admin curation — expected,
  documented for the owner.
- **`plans` enum array in Prisma** — supported (`SubscriptionPlan[]`);
  filter uses `where: { plans: { has: retailer.plan } }`.
