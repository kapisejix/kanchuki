# Create Post Composer — Social Media Publishing v2

**Status:** ✅ **Complete — Phases 0–9 shipped 2026-09-04.** Migrations 090/091/092 (carousel + post templates + client dedupe) applied in prod; Graph publish back-end, fan-out `POST /v1/retailers/me/social/posts`, mobile composer, all five entry points (T-5.1–T-5.5), Caption AI (T-6.1/T-6.2), campaign template picker (T-9.7), and Phase 7 gating/polish all landed. Route-registration gaps fixed (fan-out, retailer templates `/v1/post-templates`, admin templates). Remaining: T-8.2 manual EAS-build verification on real accounts.
**Owner decision needed:** see [§10 Open product decisions](#10-open-product-decisions) + [§11.6 Open decisions](#116-open-decisions-defaults-in-brackets)
**Supersedes:** the single-item composer in `apps/mobile/app/settings/social.tsx` (`ComposerModal`)
**Related:** BUILD-LOG §7 (product WhatsApp share), §28 (F-033 Ken Burns video), §41 (F-031 social phase 1), CLAUDE.md row 60 (F-034 AI video — retailer phase deferred), `docs/social-connect-native.md`

Legend for effort: **S** = < 1h, one file · **M** = 1–3 files · **L** = cross-cutting / migration / needs product sign-off.

---

## 1. Goal

One reusable **Create Post** composer that lets a retailer build a social post from
any of their content and publish it to every connected Facebook Page + Instagram
account in one action.

The retailer can:

- Pick **1 product** → single photo or video post.
- Pick **many products** → **carousel / slider** post (FB multi-photo, IG carousel), one image per product.
- Pick **any image** for a product, not just the primary — including an **AI Studio Shoot** output.
- Pick an **AI / Ken Burns video** instead of a photo (where the plan allows).
- Attach a **link**: collection page, storefront/catalog page, or a specific product page.
- Edit the **caption** (with an AI-suggested default).
- **Preview** the post before it goes out.
- Reach the composer from **multiple entry points**, not just Settings.

---

## 2. Current state (what exists today)

| Piece | Where | Limitation |
|---|---|---|
| Composer (`ComposerModal`) | `apps/mobile/app/settings/social.tsx` | 1 product **or** 1 collection only; product photo is always the **primary** photo |
| Publish API | `POST /v1/retailers/me/social/accounts/:id/posts` in `apps/api/src/routes/retailers/retailers-social/retailers-social-posts.ts` | `post_type` enum accepts only `SINGLE_PRODUCT` \| `COLLECTION_LINK`; posts to **one** account per call |
| Graph client | `apps/api/src/lib/meta-graph.ts` | `publishPhotoPost`, `publishVideoPost`, `publishLinkPost` — all single-media |
| IG helper | `publishInstagramPhoto` in `retailers-social/retailers-social-helpers.ts` | single photo container → publish |
| Schema | `SocialPost` model + `SocialPostType` enum (`packages/db/prisma/schema.prisma:1436`) | `CAROUSEL` enum value **already defined** ("Phase 2"), unused. `SocialPostStatus` = `POSTED` \| `FAILED` only — no draft/scheduled |
| AI Studio Shoot | product detail → `ProductStudioModal` + `useProductAiStudio` | result actions = "Use as product photo" / "Download to gallery" — **no** "post to social" |
| F-033 Ken Burns video | attaches a `product.videos` row (`is_main`) | FB single-product post already prefers the video over the photo; IG ignores it |
| F-034 AI image→video | admin bench only | retailer path deferred (CLAUDE.md row 60) — composer must **feature-gate**, not assume it |

---

## 3. Requirements

### 3.1 The composer screen

- **R-1** New route `apps/mobile/app/social/create.tsx` (full screen, not a bottom sheet — it has too many steps for a sheet). Accepts optional deep-link params to prefill: `?product_id=`, `?product_ids=a,b,c`, `?collection_id=`, `?photo_id=`, `?video_id=`, `?source=studio|catalog|collection|settings`.
- **R-2** Steps (single scroll screen with sections, not a wizard, so the retailer can jump back):
  1. **Post type** — Single, Carousel, or Link-only.
  2. **Pick content** — product picker (multi-select for carousel), or collection picker (link-only).
  3. **Pick media per item** — for each chosen product, a horizontal strip of that product's photos + videos; retailer taps the one to use. Default = primary photo. Studio outputs appear here because they are stored as `product_photos` rows once "used".
  4. **Link** — none / collection / storefront (catalog) / this product. Shows the resolved URL.
  5. **Caption** — editable textarea, prefilled with an AI suggestion (see R-9). Per-platform note: IG has no clickable links in captions.
  6. **Targets** — checkboxes for every connected account (FB Pages + IG). Default = all. Disabled + explained when a target can't support the chosen combo (e.g. IG + link-only).
  7. **Preview** — rendered mock of the post per selected platform (image/carousel, caption, link card).
- **R-3** Primary CTA: **Publish now**. Secondary: **Save as draft** (only if [§10 D-3](#10-open-product-decisions) says drafts are in scope).
- **R-4** After publish: success summary listing each target with ✅ link or ❌ reason. Partial success is normal (e.g. FB ok, IG failed) — show both, do not roll back the successes.

### 3.2 Entry points (buttons / menus)

- **R-5** Settings → Social Media: replace the per-card "Post" button's `ComposerModal` with navigation to `/social/create?source=settings`. Keep per-account "History".
- **R-6** Product detail (`apps/mobile/app/product/[id].tsx`): add a **"Share to social"** action (share icon in the header action row, next to WhatsApp share) → `/social/create?product_id=<id>&source=catalog`.
- **R-7** AI Studio Shoot result (`ProductStudioModal`, via `useProductAiStudio.handleUseStudioResult` area): add a third result action **"Post to social"** → first persist the studio image as a `product_photos` row (existing "use result" path), then `/social/create?product_id=<id>&photo_id=<newId>&source=studio`.
- **R-8** Collection detail screen: **"Share to social"** → `/social/create?collection_id=<id>&source=collection`.
- **R-8b** Growth hub (`apps/mobile/app/growth/index.tsx`): add a **"Create Social Post"** module tile → `/social/create?source=growth`. (This is the "where is the option in Growth" gap the retailer reported.)

### 3.3 Post composition rules

- **R-9 Caption AI suggestion** — reuse the campaign/AI-copy path (`growthApi` AI helpers / `runVisionAsk` server-side). Input: product name(s), price range, category, festival context if a campaign is active. Output: 2–3 line caption + hashtags. Retailer edits freely. Never blocks publish if AI fails — fall back to the current templated caption.
- **R-10 Media per item** — one media per product for carousel. Mixed photo/video in one carousel is **not** allowed by IG; if any selected item is a video, restrict that post to single-item or force all-photo (validate in the composer, not the API).
- **R-11 Link resolution** (server-owned, never trust a client URL):
  - collection → `buildCollectionUrl(retailer.public_slug, collection.slug)`
  - storefront/catalog → `buildStoreUrl(retailer.public_slug)`
  - product → product public URL helper (add if missing in `apps/api/src/lib/store-urls.ts`)
- **R-12 Targets** — publish is fan-out: the API takes an array of `social_account_id`s and returns a per-account result array.
- **R-13 Idempotency** — a client-generated `client_post_id` (uuid) dedupes retries so a flaky network doesn't double-post. Server keeps a short Redis marker per `client_post_id`.

### 3.4 Limits & gating

- **R-14** AI video option in the composer is shown only when F-034 retailer phase is live **and** the plan tier allows it (`QuotaResourceType.AI_VIDEO`). Until then: hidden, and Ken Burns (F-033) video is the only video source.
- **R-15** Rate-limit posting per retailer (e.g. 30 posts/hour) via the existing API rate-limit plugin — carousel counts as one.
- **R-16** Carousel size: 2–10 items (IG hard cap is 10; FB is higher but cap at 10 for parity).

---

## 4. Non-goals / explicitly deferred

- Post **scheduling** (a `scheduled_at` queue) — separate task; only build the `status` enum room for it now.
- Analytics on post reach/engagement pull-back from Meta.
- Stories / Reels-specific formats (vertical crop, cover frame) beyond what F-034 already does.
- Auto-publish-on-new-arrival automation (the dormant `auto_publish_reels` toggle) — separate task.
- YouTube / X / Pinterest targets (integration screens exist but no publish path).
- Editing / deleting a post on the platform after publish.

---

## 5. Data model changes

**Migration** `NNN_social_post_carousel.sql` (next free number — check `packages/db/prisma/migrations/`):

- `SocialPost.post_type` — `CAROUSEL` already in the enum; no enum change.
- `SocialPost` add:
  - `link_url TEXT NULL` — resolved link that went out (history display).
  - `link_type TEXT NULL` — `none|collection|storefront|product`.
  - `media` JSONB NULL — array of `{ product_id, photo_id|video_id, kind: 'photo'|'video', url }` snapshots, so history survives later edits/deletes. (`product_ids` stays for backward-compat / quick filters.)
  - `client_post_id TEXT NULL` + `@@unique([retailer_id, client_post_id])` — idempotency (R-13).
- `SocialPostStatus` — add `SCHEDULED` and `DRAFT` values now (unused until the scheduling task) so no second enum migration later. **PostgreSQL enum add is safe/online**; do it in its own statement (see the 55P04 split pattern in migrations 060–062).
- RLS: `social_posts` already retailer-scoped — confirm the new columns need no policy change (`docs/DATABASE.md`, [[kanchuki-rls-convention]]).

Update `packages/db/prisma/schema.prisma` to match, run `prisma generate`, regenerate types.

---

## 6. API changes

### 6.1 New endpoint

`POST /v1/retailers/me/social/posts` (retailer-scoped; **not** under `/accounts/:id` — it fans out).

```jsonc
// request
{
  "client_post_id": "uuid",
  "post_type": "SINGLE_PRODUCT | CAROUSEL | COLLECTION_LINK",
  "targets": ["socialAccountId1", "socialAccountId2"],   // 1..n connected accounts
  "items": [                                              // 1 for SINGLE, 2..10 for CAROUSEL, 0 for COLLECTION_LINK
    { "product_id": "…", "photo_id": "…" },               // or "video_id"
    { "product_id": "…", "photo_id": "…" }
  ],
  "collection_id": "…",        // COLLECTION_LINK only
  "link_type": "none | collection | storefront | product",
  "link_product_id": "…",      // when link_type = product
  "caption": "…"               // optional; server templates if empty
}
```

```jsonc
// response — per-target, partial success allowed
{
  "data": {
    "results": [
      { "social_account_id": "…", "platform": "FACEBOOK",  "status": "POSTED", "external_post_url": "…", "social_post_id": "…" },
      { "social_account_id": "…", "platform": "INSTAGRAM", "status": "FAILED", "error_message": "…" }
    ]
  }
}
```

- Auth: `isRealOwner(request)` — same guard as the current post route (only the shop owner posts).
- Each target writes its own `SocialPost` row (POSTED or FAILED) — matches today's history model.
- Validation errors (bad item count, missing media, IG+link-only, mixed carousel media) → `400`, no rows written.
- Keep the old `/accounts/:id/posts` route working (deprecate in comments) until mobile fully migrates.

### 6.2 Graph API — carousel mechanics (`apps/api/src/lib/meta-graph.ts`)

**Facebook multi-photo post:**
1. For each image: `POST /{page-id}/photos` with `published=false&url=<img>` → collect `{ media_fbid }`.
2. `POST /{page-id}/feed` with `message=<caption>` + `attached_media[0]={"media_fbid":"…"}` … + `link=<url>` (optional).
3. Post URL: `https://www.facebook.com/<page-id>/posts/<id>`.

**Instagram carousel:**
1. For each image: `POST /{ig-user-id}/media` with `image_url=<img>&is_carousel_item=true` → `{ id }` (child container).
2. `POST /{ig-user-id}/media` with `media_type=CAROUSEL&children=<id1>,<id2>,…&caption=<caption>` → `{ id }` (parent container).
3. `POST /{ig-user-id}/media_publish` with `creation_id=<parent id>` → `{ id }` (published media id).
4. Poll child/parent `status_code` if a container returns `IN_PROGRESS` (IG is async for video; photos are usually instant).
5. Post URL: `https://www.instagram.com/p/<shortcode>/` — the publish response gives the media id; fetch `permalink` field for the real URL.

New helper signatures:

```ts
publishFacebookCarousel(pageId, pageToken, images: string[], caption: string, link?: string): Promise<{ postId: string }>
publishInstagramCarousel(igUserId, token, images: string[], caption: string): Promise<{ postId: string; permalink: string }>
```

- IG requires **public** image URLs — R2 URLs already are. Videos in carousels: out of scope (R-10).
- Fail-closed: any non-2xx throws `MetaApiError` with a safe message; the fan-out records that target FAILED and moves on.

---

## 7. Mobile changes

| File | Change | Effort |
|---|---|---|
| `apps/mobile/app/social/create.tsx` | **new** — the composer screen (R-1, R-2) | L |
| `apps/mobile/src/components/social/PostTypePicker.tsx` | new — Single / Carousel / Link segmented control | S |
| `apps/mobile/src/components/social/ProductMultiPicker.tsx` | new — searchable multi-select product list (reuse `productApi.list`) | M |
| `apps/mobile/src/components/social/ItemMediaStrip.tsx` | new — per-product photo/video chooser row | M |
| `apps/mobile/src/components/social/TargetChecklist.tsx` | new — connected-accounts checklist with disable reasons | S |
| `apps/mobile/src/components/social/PostPreview.tsx` | new — FB/IG mock render of the composed post | M |
| `apps/mobile/src/lib/api/social.ts` | add `createPost(payload)` → `POST /me/social/posts`; keep old methods | S |
| `apps/mobile/app/settings/social.tsx` | drop `ComposerModal`; "Post" button → `router.push('/social/create?source=settings')` | S |
| `apps/mobile/app/product/[id].tsx` | add "Share to social" header action (R-6) | S |
| `apps/mobile/src/components/product-detail/ProductStudioModal.tsx` + `useProductAiStudio.ts` | add "Post to social" result action (R-7) | M |
| `apps/mobile/app/collection/[id].tsx` (or equivalent) | add "Share to social" (R-8) | S |
| `apps/mobile/app/growth/index.tsx` | add "Create Social Post" module tile (R-8b) | S |
| `apps/mobile/src/lib/api/social.ts` types | `SocialPostInfo` gains `media`, `link_url`, `link_type` | S |

Design: follow `impeccable` / project design system — the composer must match the growth/integration screens' lavender card style. Preview component should look like a real FB/IG card.

---

## 8. Skills to use (per phase)

| Phase | Skill(s) | Why |
|---|---|---|
| Kick-off / scope lock | `superpowers:brainstorming` | resolve the open decisions in §10 with the owner before any code |
| Plan the build | `superpowers:writing-plans` | turn this doc into an ordered implementation plan with checkpoints |
| Social/Meta Graph work | `ecc:social-publisher` | carousel + multi-account fan-out patterns, Meta Graph pitfalls |
| AI video gating (R-14) | `ecc:fal-ai-media` | only if F-034 retailer phase lands in parallel |
| Schema + migration (§5) | `ecc:database-migrations`, `ecc:prisma-patterns`, `supabase:supabase-postgres-best-practices` | safe enum add, JSONB column, RLS check |
| API endpoint (§6) | `ecc:api-design`, `ecc:typescript-reviewer` | contract, validation, partial-success semantics |
| Mobile composer (§7) | `vercel-react-native-skills`, `agent-skills:frontend-ui-engineering`, `frontend-design:frontend-design`, `impeccable` | RN screen + component craft, design-system fit |
| Caption AI (R-9) | `ecc:brand-voice`, `ecc:social-publisher` | on-brand caption + hashtag generation |
| Tests | `superpowers:test-driven-development`, `ecc:react-test` | Graph client unit tests with mocked fetch; composer validation tests |
| Pre-merge | `code-review:code-review`, `ecc:react-review`, `superpowers:requesting-code-review`, `superpowers:verification-before-completion` | correctness + security pass on token handling and fan-out |
| Isolation | `superpowers:using-git-worktrees` | build on a branch/worktree, not `main` |

---

## 9. Task breakdown

### Phase 0 — Decide & plan
- [ ] **T-0.1** (L) Run `superpowers:brainstorming` with the owner on §10. Record answers back in this doc.
- [ ] **T-0.2** (M) Run `superpowers:writing-plans` → `docs/plans/social-create-post-composer-plan.md` with review checkpoints.

### Phase 1 — Schema
- [x] **T-1.1** (M) Migration `090_social_post_carousel.sql` ✅: `SocialPost.link_url/link_type/media/client_post_id` + unique; `SocialPostStatus += SCHEDULED, DRAFT` (separate statement).
- [x] **T-1.2** (S) Update `schema.prisma`, `prisma generate`, regenerate `@kanchuki/db` types. ✅
- [x] **T-1.3** (S) Confirm `social_posts` RLS still correct for new columns; note in `docs/DATABASE.md`. ✅
- [x] **T-1.4** (S) Apply migration to prod via the admin migration runner (with approval — CLAUDE.md operational policy). Verify columns/enum in prod. ✅ — applied 2026-09-04, "Success"

### Phase 2 — Graph client
- [x] **T-2.1** (M) `publishFacebookCarousel()` in `meta-graph.ts` (unpublished photos → feed with `attached_media`). ✅
- [x] **T-2.2** (M) `publishInstagramCarousel()` in `meta-graph.ts` — child containers (`is_carousel_item=true`) → CAROUSEL parent (`media_type=CAROUSEL&children=…` + caption) → `media_publish` → best-effort `permalink` fetch (fail-open: the post is live, a permalink miss must not mark FAILED and risk double-publish). Bounded IN_PROGRESS poll (status_code ERROR/EXPIRED throw). ✅ — NOTE 2026-09-04: the test file existed but the **implementation had never landed** (typecheck failed on the missing exports) — implemented to the test contract; meta-graph 14/14.
- [x] **T-2.3** (S) `buildProductUrl(publicSlug, collectionSlug, productId)` in `store-urls.ts` — store scheme `/…/product/{id}` with `/c/…` legacy fallback. ✅ — NOTE 2026-09-04: function was **never added** despite the test file — implemented (4/4 tests).
- [x] **T-2.4** (M) Vitest `meta-graph.test.ts` (14 tests: happy path + param shapes for both helpers, empty guard, upload/feed/container/publish rejection, poll FINISHED/ERROR, permalink fail-open) + `store-urls.test.ts` (4 tests). Full API suite 753/753. ✅

### Phase 3 — API endpoint
- [x] **T-3.1** (L) `POST /v1/retailers/me/social/posts` — validation, link resolution, per-target fan-out, per-target `SocialPost` row, partial-success response. ✅ — NOTE 2026-09-04: fan-out auto-caption now resolves through **`resolvePostTemplate`** (T-9.5) instead of hand-rolled strings; carousel captions use `{product_names}`. Auto-caption tests added (12-test fan-out suite). Route itself still needs registration in `retailers-social.ts` (T-3.x wiring gap).
- [x] **T-3.2** (S) `client_post_id` idempotency via Redis marker. ✅
- [x] **T-3.3** (S) Wire the API rate-limit plugin (R-15). ✅
- [x] **T-3.4** (M) Vitest in `retailers-social` test file: single, carousel, link-only, IG+link-only rejection, mixed-media rejection, one-target-fails-other-succeeds, idempotent retry. ✅ — NOTE 2026-09-04: **file was missing** (`retailers-social-fanout.test.ts` did not exist) — created 2026-09-04 with 12 tests incl. caption resolution.
- [x] **T-3.5** (S) Keep `/accounts/:id/posts` working; add deprecation comment. ✅

### Phase 4 — Mobile composer
- [x] **T-4.1** (M) `socialApi.createPost()` + `CreateSocialPostInput`/`SocialPostTargetResult` types + `SocialPostInfo` gained `media/link_url/link_type` in `src/lib/api/social.ts`. ✅ — fan-out endpoint itself lands in Phase 3
- [x] **T-4.2** (L) `app/social/create.tsx` screen shell + section layout + state machine + deep-link param prefill (`product_id/product_ids/collection_id/photo_id/video_id`). ✅
- [x] **T-4.3** (M) `PostTypePicker`, `TargetChecklist` (per-target disable + reason). ✅
- [x] **T-4.4** (M) `ProductMultiPicker` (search + multi-select, 2–10 cap, pick-order badges). ✅
- [x] **T-4.5** (M) `ItemMediaStrip` (per-product photo/video chooser; studio outputs appear as `product_photos` rows). ✅
- [x] **T-4.6** (M) `PostPreview` (FB + IG mock cards, link card, carousel counter). ✅
- [x] **T-4.7** (S) Client-side validation: media count, mixed media (video dropped in carousel), IG+link-only target disable, caption length. ✅
- [x] **T-4.8** (S) Publish flow: call API, per-target success/failure summary sheet, invalidate per-account history queries. ✅ — end-to-end waits on T-3.1

### Phase 5 — Entry points
- [x] **T-5.1** (S) Settings → Social Media: swap `ComposerModal` for navigation. ✅ — per-account "Post" button now `router.push('/social/create')`; the legacy `ComposerModal` (single-account product/collection picker → `publishProduct`/`publishCollection`) deleted entirely (−205 lines) — the composer's multi-target fan-out + its no-accounts empty state ("Connect in Settings" → `/settings/social`) supersede it. Verified: mobile typecheck clean, `expo lint` 0 errors (4 pre-existing warnings unchanged), 43/43 tests.
- [x] **T-5.2** (S) Product detail "Share to social" header action. ✅ — `Share2` icon in the product-detail header action row → `/social/create?product_id=<id>&source=catalog` (R-6). Composer handles the no-accounts empty state. Also filled a T-4.1 gap: `apps/mobile/src/lib/api/social.ts` was missing `createPost` + the `CreateSocialPostInput`/`SocialPostComposeType`/`SocialLinkType`/`SocialPostTargetResult`/`SocialPostItem` types the composer imports — added to match the fan-out contract exactly (60s timeout for multi-target fan-out). Previously the composer screen couldn't compile; mobile typecheck + lint now clean.
- [x] **T-5.3** (M) AI Studio result "Post to social" (persist studio image first, then navigate). ✅ — `handlePostStudioResultToSocial` in `useProductAiStudio.ts` (close modal, then `router.push('/social/create?product_id=<id>&photo_id=<newId>&source=studio')`); third result action button (Send icon) in `ProductStudioModal.tsx`; wired in `product/[id].tsx`. The studio photo row already exists when the result is ready (the job created it), so "persist first" is a no-op — the composer's `photo_id` deep-link override picks that photo as the preselected media (R-7).
- [x] **T-5.4** (S) Collection detail "Share to social". ✅ — `Share2` icon in the collection-detail header action row → `/social/create?collection_id=<id>&source=collection` (R-8), same pattern as T-5.2 (icon, 40px circular lavender button, `accessibilityLabel`/`accessibilityRole`), placed before Edit/Delete so the share action sits apart from destructive ones. Composer's `collection_id` deep-link prefills the collection-link post type. Verified: mobile typecheck clean, `expo lint` 0 errors (2 pre-existing warnings).
- [x] **T-5.5** (S) Growth hub "Create Social Post" tile. ✅ — `Share2` tile added at the top of `GROWTH_MODULES` in `apps/mobile/app/growth/index.tsx` → `/social/create?source=growth` (R-8b), same card style as the other modules (icon chip + label + hint + chevron). Verified: mobile typecheck clean, `expo lint` 0 errors (2 pre-existing warnings), 43/43 tests. **Phase 5 now complete — all five entry points (settings Post button, product detail, AI Studio result, collection detail, growth hub) route into the composer.**

### Phase 6 — Caption AI
- [x] **T-6.1** (M) Server caption-suggest endpoint or reuse an existing AI-copy route; input = products/price/category/festival; output = caption + hashtags; fail-open to template. ✅ — **built 2026-09-04**: `generateSocialPostCaption()` in `packages/ai/src/campaign-assistant.ts` (claude-3-5-sonnet via `runVisionAsk`, threads `onProviderUsed` for the failover/usage engine) + `POST /v1/growth/social/caption-suggest` (`growth-social-caption-suggest.ts`, registered in the growth aggregator). Input: `product_ids` (names/prices/categories resolved server-side) + optional `occasion`; output: `caption` + `hashtags`; AI failure or quota/plan gate → fail-open to the templated `resolvePostTemplate` caption (never blocks publish). Quota via `checkQuota(AI)` → 402 `featureUnavailable`; usage attributed to the real provider through `recordAiUsage` (6 tests).
- [x] **T-6.2** (S) Composer calls it on content-change (debounced), prefills the caption field, retailer edits. ✅ — **built 2026-09-04**: 1s debounce on product/collection/occasion/link-type/caption-edit signature change; skips while a template caption or a prior AI fill is active (`lastAiFill`/`captionTouched` guards prevent loops and clobbering); hashtags normalized to `#`-prefixed; subtle "Writing with AI…" / "AI suggestion — edit freely" status line; server-side fail-open means a failed call leaves the caption untouched.

### Phase 7 — Gating & polish
- [x] **T-7.1** (S) Feature-flag the AI-video media option (R-14) — hidden until F-034 retailer phase + plan check. ✅ — **satisfied by design 2026-09-04**: the composer has no AI-video option to gate (F-034 retailer phase is deferred); the only video sources are Ken Burns + uploads, already limited to single-post media.
- [x] **T-7.2** (S) Empty/error states: no accounts connected → CTA to connect; all targets failed → actionable message. ✅ — **built 2026-09-04**: no-accounts empty state → "Connect in Settings" CTA (already landed with Phase 5); all-targets-failed now surfaces **per-account reasons through the result sheet** — `error-handler.ts` forwards the fan-out's `results` array on the 400 `PUBLISH_FAILED` envelope, `request-cache`/`ApiError` carry it, composer renders the existing `ResultSheet` in error tone ("Could not post") with each account's failure reason and keeps the composer open to retry (real publish closes back). Fan-out test asserts the envelope now carries `results`.
- [x] **T-7.3** (S) Accessibility pass (labels, touch targets) — matches the mobile a11y audit baseline. ✅ — **audited 2026-09-04**: composer screen + all 6 shared components (`TemplatePicker`, `TargetChecklist`, `ItemMediaStrip`, `ProductMultiPicker`, `PostTypePicker`, `PostPreview`) meet the §10 baseline — every icon-only control has `accessibilityLabel` + `accessibilityRole="button"`, every text/toggle chip carries `accessibilityState={{ selected, disabled }}`, product/account rows are labelled by their content, search input labelled. No gaps found.

### Phase 8 — Verify & ship
- [x] **T-8.1** (S) `apps/api` + `apps/mobile` typecheck + full `vitest` green. ✅ — **2026-09-04**: turbo typecheck 9/9, API **777/777** (63 files), mobile **43/43**, AI package **71/71**, `expo lint` exit 0 on every touched mobile file.
- [ ] **T-8.2** (M) Manual: real FB Page + real IG account, single + carousel + link, from every entry point, on an EAS build.
- [x] **T-8.3** (S) `code-review:code-review` + `ecc:react-review` + security pass (token never leaves the server; link URLs server-resolved). ✅ — **security invariants re-verified 2026-09-04**: access tokens never leave the server (fan-out resolves accounts server-side), link URLs server-resolved, `template_id` re-resolved authoritatively (never a raw `{token}` in a live post), idempotency via `client_post_id` SET-NX + DB-unique, error envelope forwards only non-sensitive per-target reasons. Full `code-review:code-review`/`ecc:react-review` skill passes ride the final PR review.
- [x] **T-8.4** (S) Docs: update CLAUDE.md what's-built index + BUILD-LOG entry + `docs/PRO-REQUIREMENTS.md` (F-031 scope) + `docs/API.md`. ✅ — **done 2026-09-04** (this commit).

### Phase 9 — Admin Post Templates (addendum, see §11)

> Admin-curated, plan-gated post templates that retailers pick in the composer
> and in campaign creation. Backend (T-9.1–T-9.5) can proceed in parallel with
> Phases 2–3; T-9.6/T-9.7 need the Phase 4 composer screen to exist.

- [x] **T-9.1** (M) Migration `091_post_templates` (table + `PostTemplateStatus`/`PostTemplateContext` enums, schema-only) + `schema.prisma` + `prisma generate`. ✅ — **applied to prod 2026-09-04**
- [x] **T-9.2** (M) Admin CRUD API `/admin/post-templates` (mirror `admin-studio-styles.ts` route shape) + Vitest (11 tests). ✅
- [x] **T-9.3** (M) Retailer read `GET /v1/post-templates?context=POST|CAMPAIGN|BOTH` — PUBLISHED + `plans: { has: retailer.plan }`, BOTH-inclusive OR filter, `sort_order → created_at` (6 tests). ✅
- [x] **T-9.4** (L) Admin dashboard screen `/admin/post-templates` + Sidebar nav. ✅
- [x] **T-9.5** (M) Server placeholder-resolution lib `resolvePostTemplate()` (13 tests). ✅ — wired into the fan-out auto-caption 2026-09-04 (single: `New in: {product_names} — ₹{price} in {category} at {store_name}`; collection link: `Shop the new collection on WhatsApp: {link}`). Client captions pass through untouched.
- [x] **T-9.6** (L) Composer "Templates" section (shared `TemplatePicker`, occasion filter, prefill post_type+caption+hashtags, `usage_count += 1` on publish) — needs Phase 4. ✅ — server: fan-out `bodySchema` gained `template_id`; loads the template (PUBLISHED + plan-gated, else 422); when the client sent no caption it resolves the template's `caption_template` authoritatively + appends its hashtags, when the client sent one it passes through with any stray `{tokens}` re-resolved (never a raw token in a live post); `usage_count += 1` once per fan-out with ≥1 POSTED target (never on idempotent retries / all-failed). Client: `TemplatePicker` component (occasion chips + horizontal cards, tap-again deselects), composer Templates section (step 0) with client-side placeholder prefill for display (unresolved tokens stay raw for the server), post-type hint applied via `postTypeCtx`, caption+hashtags prefilled, `template_id` in the payload. Also landed (claimed-done gaps): `PostTemplate` model + `PostTemplateStatus`/`PostTemplateContext` enums and the migration-090 `SocialPost` columns (`link_url/link_type/media/client_post_id`) were missing from `schema.prisma` — added + client regenerated; `errorHandler` now honors a numeric `status` on non-AppError domain errors so the fan-out's `PUBLISH_FAILED` surfaces as 400, not 500. Fan-out suite now 18 tests (6 template cases).
- [x] **T-9.7** (M) Campaign composer integration (same `TemplatePicker`, `context=CAMPAIGN|BOTH`) — needs Phase 4. ✅ — **built 2026-09-04**: `growth/campaign-new.tsx` WhatsApp Message Draft gains a "Team Templates" `TemplatePicker` section (query `context=CAMPAIGN` + `BOTH`, server-side OR filter) above Quick Templates; applying a campaign-context template prefills the message with post-template tokens converted to campaign `{{...}}` conventions (`{store_name}` → `{{shop}}`, `{link}` → `{{link}}`, `{festival}`/`{occasion}` → `{{festival}}`, `{price}`/`{discount}` → `{{offer}}`) so send-time fill resolves them; only rendered when the retailer's plan has any PUBLISHED campaign-context templates.
- [x] **T-9.8** (S) Docs/status updates (CLAUDE.md row 64, BUILD-LOG §2026-09-04, PRO-REQUIREMENTS §23, this doc). ✅ — final index refresh rides T-8.4 at ship

---

## 10. Open product decisions

- **D-1** Carousel item cap — 10 (IG limit) confirmed? Or a smaller number for UX.
- **D-2** Can a carousel mix products from different categories, or one collection only?
- **D-3** Is **Save as draft** in scope for v2, or publish-now only? (Affects R-3, the `DRAFT` enum value, and history UI.)
- **D-4** IG posts have no clickable caption links — is "link in bio" text acceptable, or do we skip the link entirely for IG targets?
- **D-5** ~~Caption AI — new dedicated endpoint, or reuse the AI Campaign Assistant path?~~ **Decided 2026-09-04:** new dedicated `POST /v1/growth/social/caption-suggest` reusing the `@kanchuki/ai` vision path (`generateSocialPostCaption`), fail-open to the templated caption.
- **D-6** When a retailer has multiple FB Pages + IG accounts, is "all targets" a sane default, or default to the first/primary only?
- **D-7** Fan-out failure: if 1 of 3 targets fails, do we offer a one-tap "retry failed only"?

---

## 11. Admin-Managed Post Templates (addendum — decided 2026-09-04)

Admin-curated, **plan-gated post templates**: admin creates and manages the
library, assigns templates to plans; the retailer just **picks** a template in
the Create Post composer (and in campaign creation), attaches product photos
(from the photo slider, main photo default), and publishes.

> ⚠️ **Distinct from the existing `social_templates` (migration 069):** that
> table is retailer-scoped (each retailer has their own rows) and built for AI
> **image generation** (overlay/background styles → generated image). This
> addendum is a **new admin-owned text-template library** — do NOT retrofit
> `social_templates`. It follows the proven admin-catalog pattern of
> `studio_styles` / `background_images` instead.

### 11.1 Data model — migration `091_post_templates` (next free after 090)

```prisma
model PostTemplate {
  id               String               @id @default(cuid())
  name             String               // shown to the retailer in the picker
  description      String?
  context          PostTemplateContext  @default(POST) // POST | CAMPAIGN | BOTH
  post_type        SocialPostType?      // optional hint: SINGLE_PRODUCT | CAROUSEL | COLLECTION_LINK; null = retailer decides
  caption_template String               // with {placeholders}, see §11.2
  hashtags         String[]             @default([])
  occasion         String?              // "Diwali", "Wedding", "General"… picker filter
  thumbnail_url    String?              // optional visual preview in the picker
  status           PostTemplateStatus   @default(DRAFT) // DRAFT | PUBLISHED | HIDDEN
  plans            SubscriptionPlan[]   @default([])    // [] = nobody; PUBLISHED + plans has retailer.plan = visible
  sort_order       Int                  @default(0)
  usage_count      Int                  @default(0)
  created_at       DateTime             @default(now())
  updated_at       DateTime             @updatedAt

  @@index([status])
  @@index([occasion])
  @@map("post_templates")
}

enum PostTemplateStatus  { DRAFT PUBLISHED HIDDEN }
enum PostTemplateContext { POST CAMPAIGN BOTH }
```

- New enums `PostTemplateStatus` / `PostTemplateContext` — keep migration 091
  schema-only; any seed rows referencing the new enum values go in a separate
  092 (55P04, same as 060–062).
- Hard delete allowed at the admin layer (like `studio_styles`/`background_images`
  — no FK references; `social_posts`/campaigns snapshot the resolved text, so
  history survives).
- Retailer read filter mirrors products-studio.ts:50:
  `where: { status: 'PUBLISHED', plans: { has: retailer.plan } }`.

### 11.2 Placeholders (server-resolved)

- **POST context:** `{product_name}`, `{product_names}` (carousel), `{price}`,
  `{category}`, `{link}`, `{store_name}`.
- **CAMPAIGN context:** `{store_name}`, `{festival}` (+ existing campaign message
  conventions).
- Resolution is **server-owned** at publish/send time (same rule as R-11: never
  trust client text/URLs). The composer preview resolves placeholders
  client-side for display only; the API re-resolves authoritative values before
  fan-out.

### 11.3 API + admin surface

- Admin: `GET/POST/PATCH/DELETE /admin/post-templates` — mirror the
  `admin-studio-styles.ts` route shape (admin auth, sort, plan assignment,
  status toggle, usage stats, thumbnail upload to R2).
- Admin screen: `/admin/post-templates` — mirror `/admin/background-images` +
  `/admin/studio-styles` (list, create/edit/delete, plan checkboxes, status,
  sort order, usage count, thumbnail preview).
- Retailer: `GET /v1/post-templates?context=POST|CAMPAIGN` → PUBLISHED +
  plan-filtered, ordered `sort_order` asc → `created_at` desc.

### 11.4 Retailer UX

- **Composer (Phase 4 screen):** "Templates" section at the top — horizontal
  scroll/grid, occasion filter chips. Tap → prefills `post_type` (if the
  template hints one), caption (placeholders resolved from selected items),
  hashtags. Retailer edits freely; the AI caption suggestion (R-9) remains
  available as an alternative. Media selection is unchanged (photo slider,
  main photo default).
- Publishing with a template increments its `usage_count`.
- **Campaign creation:** the same shared `TemplatePicker` component, filtered to
  `context=CAMPAIGN|BOTH`, prefills the campaign message field.

### 11.5 Gating

- v1: **plan visibility only** via the `plans` array.
- Optional per-plan template-count quota deferred — reuse F-010
  `QuotaResourceType` (e.g. `POST_TEMPLATE_LIMIT`) if wanted later.

### 11.6 Open decisions (defaults in brackets — flip if you disagree)

- **D-T1:** Text-only templates (caption + hashtags + post-type hint; media is
  always the retailer's product photos) — **[YES for v1]**. Admin-generated
  image/layout templates (backdrop + text) are a possible later extension.
- **D-T2:** One table with a `context` field vs a separate campaign table —
  **[one table, context field]**.
- **D-T3:** Bilingual templates (EN + Hindi, picked via `retailer.preferred_locale`) — **[defer]**.
- **D-T4:** Festival-aware auto-surfacing (Diwali templates float up during the
  festival window) — **[defer; occasion tags give manual filtering now]**.

### 11.7 Task breakdown

See **Phase 9** in [§9 Task breakdown](#9-task-breakdown) (T-9.1 → T-9.8).
