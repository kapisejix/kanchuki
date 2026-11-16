# Google Business Profile reviews + place-id capture + "Complete your profile" checklist

**Status (2026-10-26): 🟨 Built — Parts A and C live in code; Part B built but DARK** (no `plan_features` row, API not marked approved, no Google OAuth client or `business.manage` access yet). Migrations 140–143 written, not applied. Nothing verified against real Google; no device test. Detail: `docs/build-log/part-7.md` §2026-10-26, CLAUDE.md rows 108–109, RC-100/RC-101. **Update 2026-11-16:** `GOOGLE_BUSINESS_PROFILE` is now a toggle in Admin → Plan Features ("Google Business Reviews", PR #296; it was missing from the web grid and the API allowlist). Migrations 140–143 are applied (2026-11-02, see CLAUDE.md row 108/109). Still OFF and unverified: no `plan_features` row, Google API access not approved, no OAuth client or env vars, nothing run against real Google. Leave the toggle OFF until Google approves.
**Supersedes the design in:** `docs/tasks/pending/google-business-profile-autopost.md` (F-022) for *reviews*. F-022 *auto-posting* (`localPosts`) stays parked — see §B.9.
**Touches auth boundaries** (`apps/api/src/plugins/auth.ts`, admin gate) → needs human review per SECURITY.md §12–18 / CLAUDE.md §8.4.
**Operational policy:** I write SQL files; the owner applies them. No deploy, no prod env changes, no Google console actions by the agent.

---

## 0. What the code actually does today (verified 2026-10-26)

| # | Fact | Where |
|---|---|---|
| 1 | `google_place_id` has ONE writer: `PATCH /v1/retailers/me/reviews/google-place`. Body schema is `{type:['string','null']}` — **no format check, no length cap, no trim**. | `apps/api/src/routes/retailers/retailers-ratings.ts:220` |
| 2 | Its mobile client `ratingsApi.updateGooglePlaceId` is called by **no screen**. So in production the column is almost certainly empty. Owner confirms with the SQL in §E. | `apps/mobile/src/lib/api/growth.ts:1317` |
| 3 | The ratings screen's "Google & JustDial Review Link" card has its `onPress` **commented out** (`/* Linking.openURL(...) */`) — a dead button, shown only when a place id exists. | `apps/mobile/app/growth/ratings.tsx:238-262` |
| 4 | `google_place_id` only builds a **customer-facing write-a-review link** (`search.google.com/local/writereview?placeid=`). `buildGoogleReviewUrl` is copy-pasted in two files. Public review routing returns `action:'none'` when the id is empty — so the whole "send happy customers to Google" flow is dark. | `retailers-ratings.ts:18`, `public/public-reviews.ts:130-142` |
| 5 | A **token-paste GMB integration is live in the API**: `POST/DELETE /me/integrations/gmb`, `/gmb/test`, `/gmb/post`; `GET /me/integrations` returns `gmb.configured = !!gmb_account_id`. This is the RC-057 shape. | `retailers-integrations.ts:136, 179-308` |
| 6 | **That code calls the wrong Google API.** It hits `mybusinessbusinessinformation.googleapis.com/v1/locations/{id}/localPosts`. The Business Information API has no `localPosts`; Posts and Reviews live in the legacy **`mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/…`** API (account id is part of the path; the code drops it). `/test` and `/post` could never have succeeded, yet `POST /gmb` stores arbitrary ids and `GET` then says `configured:true` with no Google call. | same file; Google ref: v4 `accounts.locations.reviews`, `…localPosts` (scope `https://www.googleapis.com/auth/business.manage`) |
| 7 | Mobile: **no screen navigates to** `/growth/integrations/gmb` (pinned by `__tests__/unbuilt-integrations-hidden.test.ts`), but the screen file `gmb.tsx`, its `_layout.tsx:229` registration and `growthApi.configureGmb/testGmb/disconnectGmb` still exist (dead code). | `apps/mobile/app/growth/integrations/gmb.tsx` |
| 8 | Legacy columns on `retailers`: `gmb_account_id, gmb_location_id, gmb_access_token, gmb_refresh_token, gmb_token_expiry, gmb_configured_at` (tokens encrypted via `encryptSecret`). Possibly populated by anyone who hit the API directly. Owner SQL in §E. | `schema.prisma:269-282` |
| 9 | Secrets: `encryptSecret/decryptSecret` are **synchronous** AES-256-GCM (`ENCRYPTION_MASTER_KEY`). F-031 pattern = `createOAuthState/consumeOAuthState` (Redis) → code exchange → `encryptSecret` → `SocialAccount.access_token_encrypted`, never returned. Reuse the pattern, not the Facebook-specific code. | `packages/db/src/secrets.ts:22`, `retailers-social-connect.ts` |
| 10 | Access control is deny-by-default (`MANAGER_ALLOWED_ROUTES` etc.). A new route is **owner-only unless listed**; `isRealOwner(request)` (false for staff, catalog-delegate **and** support-delegate) is the in-handler check (RC-068). Support `MAINTENANCE` scope can `PUT /v1/retailers/me` and **read** `whatsapp-api`; it can NOT edit WhatsApp creds, connect social, or reach billing. | `auth.ts:172-374` |
| 11 | `POST /me/tickets` has `MAX_OPEN_TICKETS = 5` and a free-text `note ≥ 10 chars`; **no structured field**. A checklist with 6 "Ask team" items would hit the cap on the 6th and lock the retailer out of ordinary support. | `retailers-tickets.ts:12-52` |
| 12 | `PlanFeatureKey`/`QuotaResourceType` are Postgres enums. Adding a key = enum migration, **then** (separate file, PG 55P04) seed rows. Feature keys fail CLOSED. Pattern: migrations 128 → 129. | `migrations/128_*`, `129_*` |
| 13 | **Side finding (not in scope, flag for an RC):** `PATCH /me/whatsapp-api` writes `whatsapp_api_access_token` to the column **without `encryptSecret`** (`retailers-whatsapp.ts:62`) while gmb/fb_ads/google_ads tokens are encrypted. Read path not yet checked. | `retailers-whatsapp.ts:58-66` |
| 14 | `ReferralPayoutAccount` (F-038, RazorpayX) is the only retailer "payment" record that exists. Retailer checkout/Razorpay Route was removed 2026-08-31 (SECURITY.md §11). Subscription billing is Kanchuki's own account. | `schema.prisma:1813`, SECURITY.md §11 |
| 15 | Last migration on disk: `139_review_account_identity` (written, **not applied**). Next free number: **140**. | `packages/db/prisma/migrations/` |
| 16 | `apps/mobile/src/lib/maps-link.ts` already parses lat/lng from a pasted Google Maps link (client-side, follows short links). It does **not** yield a place id (share links carry a hex feature id, not `ChIJ…`). | `maps-link.ts` |

### Google facts this design depends on (from Google's reference pages / web search; re-check at build time)

- Nobody can create a review for a customer via any API. The Business Profile API lets a **location manager** *list* reviews and *create/update/delete the reply*. `PUT …/reviews/{id}/reply` needs scope `business.manage` and a **verified** location.
- The v4 API was still documented (reference refreshed 2025-07-25); third-party notes (Sept 2026) say posts + reviews still run on it. Forum claims of deprecation are unsourced — **check Google's deprecation page before task B2.**
- **Access is gated:** a Cloud project must submit Google's *Basic API Access* form; until approved the project's quota shows **0 QPM** and calls fail. Approved ≈ 300 QPM.
- `business.manage` is a **sensitive scope**. An *External* consent screen in "Testing" mode issues refresh tokens that **expire in 7 days**; production needs consent-screen verification. An *Internal* consent screen (Google Workspace org account) needs no verification — see §E.

---

## 1. Scope and non-goals

**In:** (A) capture the place id; (B) read a retailer's Google reviews into the Kanchuki ratings screen and let the retailer reply, via a Kanchuki-team-managed Google identity; (C) a "Complete your profile" dashboard block.
**Out:** posting reviews for customers (impossible, and no endpoint will exist — pinned by a test); F-022 `localPosts` auto-post (§B.9); AI-drafted replies; multi-location retailers (one link per retailer); Google Ads / FB Ads paste-credential screens (§C.4); fixing the plaintext WhatsApp token (side finding #13 → own RC).

---

## PART A — Place-id capture  (3 tasks, one sitting each)

### Design

- **Where:** inside the existing onboarding **step 2 (Location)** as an optional card with a "Skip for now" link — *not* a new step. `onboarding_step` is persisted and `TOTAL_STEPS = 5` is compared everywhere; inserting a step re-numbers every in-flight retailer. The same component is a row in **Settings → Profile** ("Google Business Profile").
- **One shared component** `GooglePlaceField` (mobile) used by both.
- **Three ways in, one validated outcome:**
  1. **Search** (primary): retailer types shop name (prefilled from `shop_name` + `city`), taps a result → id saved. Server-side Places API (New) Text Search, biased to the retailer's saved `latitude/longitude` from step 2.
  2. **Paste a Google Maps / Place link or a raw Place ID**: regex extraction (`ChIJ…` token or `place_id:`/`query_place_id=` param).
  3. **Clear** (null).
- Short `maps.app.goo.gl` links are NOT resolved server-side (SSRF). They yield no place id → UI says "couldn't find the ID in that link — search by name instead".
- **Format:** `^[A-Za-z0-9_-]{20,255}$` (Google documents place ids as opaque strings; keep the regex loose, the real check is the lookup below).
- **Verify before save** when `GOOGLE_PLACES_API_KEY` is set: Place Details with field mask `id,displayName` only (cheapest SKU); reject ids Google doesn't know (a garbage id would put a dead "review us on Google" link in front of every happy customer). Key unset → search/verify disabled in UI with "Not available yet", API returns `501 NOT_CONFIGURED`. **Nothing fake-succeeds.**
- Google's Places terms exempt `place_id` from caching limits — confirm at build.

### A1 — Shared parser + hardened PATCH  *(API + shared, tests)*
1. `packages/shared`: `extractPlaceId(input: string): string | null` and `isPlaceId()`; move the duplicated `buildGoogleReviewUrl` here; both API files import it.
2. `PATCH /reviews/google-place`: zod body (`trim`, regex, `null` allowed), accepts a pasted link or id and stores only the extracted id; owner-only (not in any staff list — add a test that manager/salesperson/support get 403); `AuditLog` row (`action:'update'`, `resource_type:'Retailer'`, metadata `{google_place_id: 'set'|'cleared'}`).
3. Tests: valid id, url with `ChIJ`, url with `query_place_id=`, short link → 422, 300-char junk → 422, empty string → null, staff 403, support-delegate 403.

### A2 — Search + verify routes  *(API, tests)*
1. `GET /v1/retailers/me/google-place/search?q=` (owner only) → Places API (New) `POST places:searchText`, `X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress`, `regionCode:'IN'`, `locationBias` circle from the retailer's lat/lng when present, `maxResultCount: 5`. Returns `[{place_id, name, address}]` — nothing else from Google is passed through.
2. Cost guard: 10 req/min per retailer (route rate limit keyed on `retailerId`, **not** `request.ip` — see RC-099) + a Redis daily counter (30/day/retailer). Over → 429 `DAILY_LIMIT`.
3. Server key only (`GOOGLE_PLACES_API_KEY`, restricted to Places API; never sent to a client). 8 s fetch abort (RC-079 shape). Provider error → 502 with a plain message; **never** return a canned result.
4. Verify step used by A1's PATCH when the key is configured.
5. Tests with mocked `fetch`: happy path, no key → 501, Google 403 → 502, daily cap, retailer isolation (retailer B's lat/lng never used for A).

### A3 — Mobile  *(mobile, tests)*
1. `GooglePlaceField` component: search box → result list → confirm; "Paste a link or Place ID" disclosure; shows the saved shop name (not the raw id) once set; "Remove".
2. Onboarding step 2: card under the address, optional, skip = no write, no block on Next. Saved through the A1 PATCH *immediately* on pick (not at the final step) so quitting onboarding keeps it.
3. Settings → Profile row opens the same component.
4. **Fix the dead card** in `growth/ratings.tsx` (`Linking.openURL(summary.google_review_url)` + share via WhatsApp as the copy promises). Add an empty state on the ratings screen when no id: "Add your Google listing to get a review link" → the component.
5. One client method (`updateGooglePlaceId`) used by the component.
6. Tests: component states (idle/searching/error/not-configured), onboarding Next works with the field untouched, `ratings.tsx` has no commented-out handler.

---

## PART B — Google Business Profile reviews (read + reply), marketing-team-assisted  (8 tasks)

### B.1 Access model (decision D2 — recommended: **M1**)

- **M1 (recommended, matches your Q2/Q3):** Kanchuki owns **one Google account** (a Workspace account if possible). The retailer adds that email as a **Manager** on their Business Profile (Google's own invite flow — they keep ownership and can remove us any time). A Super Admin connects that account **once** to our Cloud project (OAuth, offline). The marketing team then **links** each retailer to their location by picking it from the list Google returns for that account. Retailers never touch OAuth and never type a location id.
  - *Pro:* no per-retailer consent-screen friction; fits "give access to the marketing team" literally; one token to rotate.
  - *Con:* one credential reaches every linked location → crown-jewel secret; tenant isolation must be airtight (B.2).
- **M2:** each retailer OAuths their own Google account. Better isolation, but every retailer completes a Google consent flow and consent-screen verification applies to every user. Not recommended for the first release.

### B.2 Tenant isolation (the part that must not be wrong)
- The retailer API **never accepts** `account_id`, `location_id` or another retailer's `review_id`. Every call resolves `gbp_links` by `request.retailerId`; `review_id` is looked up in `gbp_reviews WHERE retailer_id = :me AND link_id = :myLink`, and only then sent to Google. A client-supplied location id is not an input anywhere.
- Only **admin** routes can set `gbp_account_id/gbp_location_id`; the admin picks from Google's list for the shared identity, filtered server-side to locations not already linked (unique index, below).
- Responses carry display fields only — no token, no ids beyond the review's own id.

### B.3 Data (migrations — SQL files only; owner applies)

| File | Contents |
|---|---|
| `140_gbp_enums.sql` | `ALTER TYPE "PlanFeatureKey" ADD VALUE IF NOT EXISTS 'GOOGLE_BUSINESS_PROFILE'`; `ALTER TYPE "QuotaResourceType" ADD VALUE IF NOT EXISTS 'GBP_REVIEW_REPLY'`. Enum values only (PG 55P04). |
| `141_gbp_tables.sql` | `CREATE TYPE "GbpLinkStatus" AS ENUM ('REQUESTED','LINKED','NEEDS_ACCESS','UNLINKED')`. **`gbp_links`**: `id`, `retailer_id` UNIQUE FK, `status`, `gbp_account_id`, `gbp_location_id` (NULL until linked; `UNIQUE (gbp_account_id, gbp_location_id)`; CHECK `status='LINKED'` ⇒ both non-null), `location_title`, `consented_at`, `linked_by_team_member_id`, `linked_at`, `last_synced_at`, `last_error_code`, `avg_rating`, `review_count`, timestamps. **`gbp_reviews`**: `id`, `retailer_id`, `link_id` FK, `google_review_id`, `reviewer_name`, `star_rating` (CHECK 1-5), `comment`, `google_created_at`, `google_updated_at`, `reply_comment`, `reply_updated_at`, `synced_at`; `UNIQUE (link_id, google_review_id)`; index `(retailer_id, google_created_at DESC)`. RLS in the two-part shape of 111/126/129 (policy for both backend roles first, then `ENABLE`; RC-030). `kanchuki_purge` gets DELETE on `gbp_reviews` only (like 124/125) — the app role keeps no DELETE; unlink hides reviews and the daily purge job deletes them 30 days later (RC-049). |
| `142_gbp_limits_seed.sql` | `plan_limits` rows for `GBP_REVIEW_REPLY` (numbers in D8). **No `plan_features` row for `GOOGLE_BUSINESS_PROFILE`** ⇒ OFF for every plan (fails closed) until an admin enables it in Plan Feature Matrix. |

Reviewer names are Google-public display names; still stored only while linked and purged on unlink / retailer hard-delete (add `gbp_*` to `hardDeleteRetailer()` — RC-050: its hand-written table list is where this has bitten before).

### B.4 Tasks

**B1 — Schema + cleanup of the legacy paste integration** *(Prisma + API + mobile)*
1. Add the models/enums to `schema.prisma` matching 140-142; DATABASE.md rows + writer map.
2. **Remove** `POST/DELETE /me/integrations/gmb`, `/gmb/test`, `/gmb/post` and the `gmb` block of `GET /me/integrations` (replaced by the new link status once B5 lands); delete `growth/integrations/gmb.tsx`, its `_layout` entry, `growthApi.configureGmb/testGmb/disconnectGmb`, the `HIDDEN` entry in `unbuilt-integrations-hidden.test.ts` and the `staff-access.test.ts:45` assertion. Reason: wrong API host/path (fact #6), accepts arbitrary ids, reports `configured:true` with no Google call (RC-057). **Do not drop the `gmb_*` columns here** — a later migration drops them after the owner confirms the §E count.
3. New RC entry (next id **RC-100**) written when the removal lands.

**B2 — Google client library** *(API lib, mocked-fetch tests)*
`apps/api/src/lib/google-business.ts`: `refreshAccessToken()`, `listAccounts()`, `listLocations(account)`, `listReviews(account, location, pageToken)`, `replyToReview(…)`. Typed errors: `GbpNotApproved` (quota 0 / `SERVICE_DISABLED` / `RESOURCE_EXHAUSTED`), `GbpNeedsAccess` (403/404 on that location), `GbpTokenRevoked` (`invalid_grant`), `GbpUnavailable` (5xx/timeout). 10 s abort; 1 retry on 5xx only; **no catch-all fallback** that returns empty/ok. Access token cached per process in memory only; refresh token read from `IntegrationSetting` via `decryptSecret`. Tests per error class + a pin that no function ever creates a review.

**B3 — Shared Google identity connect (Super Admin)** *(API admin + web admin)*
- `GET /v1/admin/gbp/connect` → `createOAuthState` (Redis, bound to the admin session) → Google URL with `scope=business.manage`, `access_type=offline`, `prompt=consent`; `POST /v1/admin/gbp/callback` consumes state, exchanges the code, `encryptSecret(refresh_token)` into `IntegrationSetting` key `GBP_REFRESH_TOKEN`, records `GBP_CONNECTED_EMAIL`; never returned to any client (masked preview only).
- Admin gate: classify both routes **Super Admin only** in the single classification table (RC-034/RC-090/RC-091 — match on the matched route pattern, not the raw URL), with a test per role.
- Admin page "Google Business Profile → Connection": connected email, last token refresh, "Reconnect".

**B4 — Marketing-team link tool** *(API admin + web admin)*
- Roles: `SUPER_ADMIN` + `MARKETING_MANAGER` (+ `MARKETING_AGENT` — D5), added to an **allow-list** explicitly (RC-091).
- Admin list: retailers with a `gbp_links` row (REQUESTED first): shop name/city, requested date, status, last sync, last error.
- "Link": loads `listAccounts → listLocations` for the shared identity, hides locations already linked, shows title + address so the agent matches the retailer's shop; saves ids, `linked_by_team_member_id`, status `LINKED`, enqueues a first sync. "Unlink" → `UNLINKED`.
- Every link/unlink → `AuditLog` (`actor_type:'team'`, ids in metadata).
- Tests: linking a location already linked elsewhere → 409; linking a retailer with no REQUESTED/consented row → 409; role matrix.

**B5 — Retailer routes (owner only) + gating** *(API)*
All under `/v1/retailers/me/google-business/…`, **not** in any staff/support allowlist (owner-only by default-deny) *and* `isRealOwner(request)` in each handler.

| Route | Behaviour |
|---|---|
| `GET /status` | `{state, location_title?, last_synced_at?, avg_rating?, review_count?, manager_email?}`. `state` ∈ `UNAVAILABLE` (feature off for plan, or platform not approved), `NOT_REQUESTED`, `REQUESTED`, `LINKED`, `NEEDS_ACCESS`. |
| `POST /request` | Needs feature on. Body `{consent:true}` required (else 422). Upserts `gbp_links` REQUESTED with `consented_at` **and** creates the "ask team" ticket (§C.3, item `google_business`). Idempotent. Returns the Google steps + `manager_email`. |
| `GET /reviews?cursor=` | From `gbp_reviews` (own link only), newest first, page ≤ 20. Enqueues a background sync if `last_synced_at` is > 15 min old (never blocks). |
| `POST /reviews/:id/reply` | `{comment}` 1–4096 chars trimmed. Order: feature check → link LINKED → own-review lookup → `checkQuota(GBP_REVIEW_REPLY)` → Google `PUT …/reply` → **only on Google 2xx** write `reply_comment`, increment quota, `AuditLog`. A Google failure returns the typed error message and writes nothing (RC-056/058/060). |
| `DELETE /link` | Retailer ends it: `UNLINKED`, reviews hidden; copy tells them to also remove our Manager access in Google. |

One helper `gbpAvailable(retailerId)` = `hasFeature(GOOGLE_BUSINESS_PROFILE)` **and** shared identity connected **and** `GBP_API_APPROVED` true. Used by every route **and** by the checklist, so they cannot disagree (RC-073 shape).

**B6 — Sync job** *(API job, tests)*
BullMQ repeatable `gbp-review-sync` every 6 h + on-demand enqueue; **registered without `repeat.limit`** (RC-062). Per link: page `listReviews`, upsert by `(link_id, google_review_id)`, store Google's `averageRating/totalReviewCount`, set `last_synced_at`. Errors: `GbpNeedsAccess` → `NEEDS_ACCESS`; `GbpTokenRevoked`/`GbpNotApproved` → platform-level state + one Sentry event (not per-retailer spam). Concurrency 1, 200 ms gap between links. Purge job deletes `gbp_reviews` of links `UNLINKED` > 30 days via the purge role.

**B7 — Mobile: connect screen + ratings integration** *(mobile, tests)*
- New `growth/integrations/google-business.tsx` (replaces deleted `gmb.tsx`): one screen, honest states mirroring `state`. `UNAVAILABLE` = "Coming soon", **no** action button. `NOT_REQUESTED` = what we do (read + reply; never post reviews for you), consent checkbox, "Ask Kanchuki team to connect". `REQUESTED` = the 3 Google steps with `manager_email` + copy button. `NEEDS_ACCESS` = "Add us again as Manager".
- `ratings.tsx`: "Google reviews" tab: star summary labelled "from Google", list, Reply sheet (shows replies left from quota), reply shown under the review. Tab hidden unless `LINKED`.
- Entry points: Growth hub integrations row and the checklist item.
- Tests: extend the "unbuilt integrations hidden" guard; render each state; reply disabled at 0 quota.

**B8 — "Nothing fake-succeeds" suite** *(API + mobile)*
- Feature off → every B5 route 403 `FEATURE_UNAVAILABLE`, `/status` `UNAVAILABLE`, checklist item absent.
- Feature on but no shared identity, or `GBP_API_APPROVED` false → `/request` 409 `NOT_AVAILABLE` (no ticket, no row), `/reply` 409, mobile shows "Coming soon".
- Google quota-0 → `GbpNotApproved`; no `gbp_reviews` row written, no quota consumed.
- No code path issues a Google review-create call (test over `lib/google-business.ts`).
- Owner-only matrix: manager, salesperson, catalog-delegate, support-delegate (all 3 scopes) → 403 on every B5 route.
- Retailer A can never read or reply to B's review (id-swap test).

### B.9 F-022 auto-posting
Not part of this spec. When wanted it reuses the same link row + `lib/google-business.ts` (`localPosts.create` on v4) with its own quota key. PRO-REQUIREMENTS §10.13 and the F-022 task file are stale on two points (retailer OAuth; an F-012/Razorpay pattern) and get a pointer here when B ships.

---

## PART C — Dashboard "Complete your profile" block  (4 tasks)

### C.1 Items (status always derived, never stored)

| key | Done when | Hidden when | "Set it up myself" → | Ask-ticket type |
|---|---|---|---|---|
| `google_place` | `retailers.google_place_id IS NOT NULL` | — | Settings → Google listing (A3 component) | GROWTH_SETUP |
| `google_business` | `gbp_links.status = 'LINKED'` | `!gbpAvailable()` (never nag for what can't be done) | `/growth/integrations/google-business` | GROWTH_SETUP |
| `facebook` | active `SocialAccount` FACEBOOK | — | `/growth/integrations/facebook` | GROWTH_SETUP |
| `instagram` | active `SocialAccount` INSTAGRAM | — | `/growth/integrations/instagram` | GROWTH_SETUP |
| `gst` | `retailers.gstin IS NOT NULL` | — (dismissible: unregistered shops exist) | Settings → Profile (GSTIN) | MAINTENANCE |
| `whatsapp_api` | `whatsapp_api_phone_number_id` AND token present | plan lacks `WHATSAPP_BUSINESS_API` | `/growth/integrations/whatsapp` | MAINTENANCE |
| `payment` | **undecided — D6** | — | — | — |

Item states returned: `done` · `missing` · `requested` (an open ask-ticket exists — derived from the ticket row) · hidden; plus per-item `dismissed`. Screen route paths are confirmed against the router at build time.

### C.2 Dismissal
`retailers.setup_dismissed TEXT[] NOT NULL DEFAULT '{}'` (one column, not a table). `POST /me/setup-checklist/dismiss {item_key}` (enum-validated) and `POST …/restore`. Dismissal only hides; a dismissed item that later becomes `done` is just done. The whole block hides when no visible item is `missing`/`requested`; a small "Show N hidden" link restores.

### C.3 "Ask Kanchuki team to set it up"
- New column **`support_tickets.setup_item TEXT NULL`** + partial unique index `(retailer_id, setup_item) WHERE status IN ('OPEN','ASSIGNED') AND setup_item IS NOT NULL` ⇒ at most one open request per item, **enforced by the DB**, structured and filterable by the team (no parsing free-text notes).
- `POST /me/setup-checklist/:item_key/ask`: owner-only; item must currently be `missing`; creates a ticket of the type in the table with a server-written note (`"[setup:<key>] Owner asked for help setting up …"` — satisfies the ≥ 10-char rule and reads fine in existing team views), `requires_visit:false`, routed through the **same `routeTicket()`**; idempotent — an existing open ticket for the item returns 200 with it.
- These tickets are **excluded from `MAX_OPEN_TICKETS`** (count adds `setup_item: null`) so six items cannot lock the retailer out of normal support.
- **A ticket grants no account access** (unchanged rule); consent stays in the support-session flow. Reality check (fact #10): a `MAINTENANCE` session can edit profile/GST but **cannot** connect Facebook/Instagram (needs the retailer's own Facebook login), edit WhatsApp API credentials, or touch GBP. So for those items "Ask" means *the team contacts the retailer and walks them through it* — UI copy must say "Our team will call you to help", never "we'll set it up for you". Only `gst` / `google_place` can be completed by a team member inside a consented session (D4).
- Team side: `setup_item` shown in the team ticket list (`routes/team/team-tickets.ts` select + team/admin UI chip); no new queue.

### C.4 Not in the list (and why)
- `fb_ads`, `google_ads` BYO-credential screens: optional paid-ads features, same paste-token shape as RC-057; not "required".
- "Any required API credential": nothing else in the product is required to operate (Kanchuki holds the platform keys). If you mean something specific, name it (D6).

### C.5 Tasks

**C1 — Migration + schema** (`143_setup_checklist.sql`): `support_tickets.setup_item` + partial unique index; `retailers.setup_dismissed`. DATABASE.md updated.

**C2 — API** `apps/api/src/routes/retailers/retailers-setup-checklist.ts`:
- `GET /me/setup-checklist` → `{items:[{key,status,dismissed,can_ask}], visible_missing:n}`. One function `deriveChecklist(retailerId)`; **all queries keyed on `request.retailerId`**; response is keys + enums only (no ids/tokens/phones/URLs). Owner-only (no allowlist entry) + `isRealOwner`.
- `dismiss`, `restore`, `:item_key/ask` as above; support scopes are **not** granted these routes.
- Tests: each item's done/missing transition from fixtures; plan-gated item hidden; ask idempotency + DB unique-violation path; 6 asks then a normal ticket still works; retailer A's checklist never reflects B; manager/salesperson/catalog-delegate/support → 403; response never contains `access_token`/`gmb_`/`whatsapp_api_access_token`.

**C3 — Mobile** `apps/mobile/src/components/SetupChecklist.tsx` on `(tabs)/index.tsx` under `SchedulerBanner`:
- New `staffCan` feature `'setup'` → `'owner'` in `ROLE_FEATURES` (mirrors the server); staff roles render nothing and fire **no** request.
- Per row: status chip, "Set it up myself" (router push), "Ask Kanchuki team" (confirm sheet → POST; row flips to "Requested — our team will call you" from the **refetched derived state**, not local state), dismiss ✕. Optimistic UI only for dismiss.
- Hidden while loading and on error (an error must not render as "all done" nor as a list).
- Accessibility: 44 px targets, labels, Reduce Motion (match the existing hardening pass).

**C4 — Team visibility + docs**: ticket list shows `setup_item`; admin retailer detail shows the same derived checklist read-only (D5 on who sees it); CLAUDE.md index row + BUILD-LOG + PRO-REQUIREMENTS entry (F-number unassigned — D1) in the same session as the build commit (CLAUDE.md rule 10).

---

## D. Migration list (all SQL, owner applies)

| # | File | Needed for | Prereq |
|---|---|---|---|
| 139 | `139_review_account_identity` | RC-098/RC-099 (already written) | **apply BEFORE the API deploy** |
| 140 | `140_gbp_enums` | B1 | — |
| 141 | `141_gbp_tables` | B1 | 140 applied |
| 142 | `142_gbp_limits_seed` | B1 | 140 applied |
| 143 | `143_setup_checklist` | C1 | — |
| later | `144_drop_legacy_gmb_columns` | after the §E count is known | B1 shipped |

Part A needs **no migration**. Each file gets the 129-style header comment (grants, RLS reasoning, 55P04 note) and rollback SQL in comments.

## E. What only the owner can do

1. **SQL (read-only) — run and send me the numbers:**
   `SELECT count(*) total, count(google_place_id) with_place_id, count(gmb_account_id) with_gmb_ids, count(gmb_access_token) with_gmb_tokens FROM retailers WHERE deleted_at IS NULL;`
2. **Google Cloud (Part B only; does not block A or C):**
   - Create/choose a Cloud project owned by a Kanchuki-controlled account.
   - Enable the **Google Business Profile APIs** (v4 `mybusiness` surface plus Account Management and Business Information, needed to list accounts and locations).
   - Submit Google's **Basic API Access / GBP API access request** for that project and wait for approval (quota 0 → ~300 QPM). Weeks, not days.
   - **OAuth consent screen:** prefer a **Google Workspace** account for the Kanchuki identity with User type **Internal** — then `business.manage` needs no verification and refresh tokens don't expire in 7 days. With a plain Gmail account: External + sensitive-scope verification (privacy-policy URL, demo video) — slower.
   - Create an OAuth *Web* client; authorised redirect = the admin callback URL (exact path given at build).
   - For Part A: enable **Places API (New)** on a billed project, create a **server key restricted to Places API**, set a budget alert.
3. **Env / secrets (you set; I never read prod):** `GOOGLE_GBP_CLIENT_ID`, `GOOGLE_GBP_CLIENT_SECRET`, `GOOGLE_GBP_REDIRECT_URI`, `GBP_MANAGER_EMAIL` (shown to retailers), `GOOGLE_PLACES_API_KEY`. `ENCRYPTION_MASTER_KEY` already exists. I only add names to `.env.example`.
4. **Admin console, after deploy:** Super Admin clicks *Connect Google account*; Plan Feature Matrix → enable `GOOGLE_BUSINESS_PROFILE` per plan; set `GBP_API_APPROVED` once Google approves.
5. **Apply migrations 139 → 143 in order** and tell me which are applied.
6. **Deploy order (always GitHub push → Railway; never `railway up`):** 139 applied → deploy API **and** web together (RC-093 needs both) → migrations 140-143 → API deploy carrying Parts A and C → mobile EAS build (A/C UI need a new build) → Part B stays dark until step 4.

## F. Decisions that block building

| # | Decision | Recommendation |
|---|---|---|
| D1 | F-number + order of work. | A → C → B (B waits on Google); next free F-number — confirm. |
| D2 | Access model M1 (shared Kanchuki Google identity as Manager) vs M2 (retailer OAuth). | M1. |
| D3 | Legacy token-paste GMB: remove now (B1) vs flag-gate. Columns kept until count known. | Remove routes + screen now, drop columns later. |
| D4 | What "Ask Kanchuki team" means for Facebook/Instagram/WhatsApp (the team can't do these inside a session). | Call-back request; copy says so. Only GST / place id are doable in-session. |
| D5 | Who on our side: links locations (B4), sees the checklist (C4). | Link = `SUPER_ADMIN` + `MARKETING_MANAGER`; connect identity = Super Admin only; checklist read-only for marketing + support managers. |
| D6 | **"Payment setup"**: (a) F-038 referral payout account, shown only if the retailer has referral earnings; (b) active paid subscription; (c) exclude. Also name any "required API credential". | Exclude until you name one; (a) is the only real payment account the product holds. |
| D7 | Replies: owner only, or manager too? (A reply is public speech under the shop's name.) | Owner only at launch. |
| D8 | Reply quota per month by plan (admin-editable after). | Starter 20 / Growth 100 / Pro 500, or feature off for Starter. |
| D9 | Place-id search uses a paid Google API (cents per search, capped 30/day/retailer). Accept, or paste-only? | Accept. |
| D10 | Onboarding: card inside step 2 vs a new step. | Inside step 2 (no renumbering). |
| D11 | Side finding #13 (plaintext WhatsApp token): open an RC and fix separately? | Yes, separate small fix. |
| D12 | OK that F-022 `localPosts` auto-post is deferred out of this spec? | Yes. |

## G. Verification per build slice
`pnpm --filter @kanchuki/api typecheck`; `npx vitest run` for touched files; `npx vitest run src/routes/security.test.ts` (auth boundary); `npx vitest run src/routes/admin.login.test.ts` (admin gate, B3/B4); `pnpm --filter @kanchuki/mobile test`; biome. Pre-production: re-test every RC per `docs/root-cause/`.
