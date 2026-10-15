# F-043 Social Post Scheduler (FB + IG daily carousel plans) — PENDING
> Drafted 2026-10-15, revised same day after owner answers. **✅ APPROVED by owner 2026-10-15 — nothing built yet.**
> F-043 assigned (F-042 was the last number used).
> **Task 1 (§10 step 1) built 2026-10-15** — merged (PR #79); migrations 128 + 129 applied in prod.
> **Task 2 (§10 step 2) built 2026-10-16** — branch `feat/f-043-publish-tick`, see §10b. Next: §10 step 3.
> Owner-side (not code): Meta App Review per §9; migrations are applied by the owner from the admin dashboard.
> Extends F-031 Phase 2 (composer) and closes its "Phase 3 open: auto-post" + "Phase 4: scheduling" items.

## 1. Goal

A retailer sets a posting plan once per platform (Facebook, Instagram). Kanchuki fills a calendar with
daily carousel posts of their newest products, the retailer reviews the calendar once, and posts then
publish automatically at a fixed time every day. No per-week approval.

**Scheduling lives entirely in Kanchuki.** Facebook/Instagram are only the publish endpoint — we hold the
queue and the clock, and call the normal publish API when a slot is due. We do not use Meta's native
scheduling features.

## 2. Decisions (owner, 2026-10-15)

| # | Decision |
|---|----------|
| D1 | **Fully automatic after confirm.** Review happens once, when the calendar is generated. |
| D2 | **No AI Studio generation inside the scheduler.** Retailers already generate images with AI Studio Shoot on the product itself; the scheduler just uses the product's existing images. No Studio quota is touched. (May return as a later option.) |
| D3 | **Rotation pool of free templates** applied only to slides the retailer marks "style this" or "apply to all". Untouched slides stay original. |
| D4 | **Batch size per day is a range** (e.g. Mon 4–5, Tue 7–8, Wed 5–6). Hard cap 10 slides (IG). |
| D5 | **Free templates in v1:** plain white + price strip, "New Arrival" badge, festival frame, store-logo corner, collage cover. |
| D6 | **Cover slide is optional**, retailer chooses a cover style (or none). |
| D7 | **Caption auto-filled by AI, editable per post** (reuse Caption AI). |
| D8 | **Alerts are in-app only — NO WhatsApp.** (Revised 2026-10-15; supersedes "WhatsApp + in-app".) Retailer dashboard and the retailer's manager both see connection/token status, allowance left, and failure messages inside the app. |
| D9 | **All plans get the same access for now (post every day).** Limits are **admin-controlled** from the admin dashboard (plan feature matrix) — admin can assign/restrict scheduling per plan later with no code change. |

## 3. Image levels per slide

| Level | Cost | Notes |
|-------|------|-------|
| A. Original (default) | Free | The product's own photo — including any AI Studio image the retailer already attached/set as main. Cropped to one ratio for the whole carousel. |
| B. Template | Free | Server-side compositing (sharp): price strip, badge, festival frame, logo corner, collage cover. |

No generation step, so no image-prep job, no provider failures, and no per-image cost.

## 4. Retailer flow

1. **Create plan** (one per platform): post type, days of week, one daily time (IST), batch range per day,
   product source (newest / category / manual), cover style (optional), template rotation pool, horizon
   (1 wk / 2 wk / 1 mo).
2. **Calendar preview**: day cards with a thumbnail strip. Tap a day → slides.
3. **Per slide**: Keep · Swap product · Remove · Use another photo of the product · Style this (Template).
   Bulk: apply a template to a day / the whole plan.
4. **Per post**: caption pre-filled by AI, editable.
5. **Confirm summary**: "34 posts — 22 original, 12 templated". If admin limits apply, show remaining allowance.
6. Confirm → plan runs. Controls afterwards: pause/resume plan, skip/edit a slot, post-now, retry failed.

## 4a. Status & alerts panel (retailer dashboard + manager)

One "Scheduler status" card per platform, shown on the retailer's dashboard and to the retailer's manager
(team member with manager role) — same data, same screen. All in-app; nothing is sent to WhatsApp.

| Block | Shows |
|-------|-------|
| **Connection / token** | Connected Page / IG account name, token state (`OK` / `EXPIRING in N days` / `EXPIRED — reconnect`), days left, **Reconnect** button |
| **Allowance left** | Posts left this month (`used / limit` from admin plan limits, D9), active plans (`n / max`) |
| **AI Studio shoots left** | `remaining / limit` this month for the retailer's AI Studio Shoot quota, with a shortcut button to open Studio. **Display only** — the scheduler never generates images or spends this quota (D2); it tells the retailer how many product images they can still create before the calendar needs them. |
| **Next post** | Date + time of next scheduled slot, slides count |
| **Recent failures** | Last N failed/missed posts: when, platform, **plain-language reason**, **Retry** / **Edit** / **Skip** |
| **Plan state** | ACTIVE / PAUSED (+ why: "paused — Facebook token expired") |

Failure reason mapping (Meta/API error → retailer-readable text, never raw Graph errors; only
`MetaApiError`-class messages surface, per composer review finding 4):
- token expired / revoked → "Facebook connection expired. Reconnect to resume posting."
- Page role removed / no permission → "You no longer have access to this Page."
- IG not Business/Creator or unlinked → "Instagram account is not linked to a Facebook Page."
- IG/FB rate limit → "Posting limit reached. Will retry automatically."
- media rejected (ratio/size/format) → "A photo was rejected. Replace it and retry."
- plan/admin limit reached or scheduling disabled → "Scheduling is not available on your plan."
- unknown → "Post failed. We'll retry. If it keeps failing, contact support."

Behavior:
- **Banner on dashboard** while any plan is paused/failed/expiring (≤7 days); clears when resolved.
- **Derived, not stored:** the card and banner are computed from plan/post rows + token expiry on each load
  (§8 item 4) — no alerts table, no WhatsApp/push sender, nothing to dedupe.
- **Manager sees the same card.** Manager can Retry / Skip / Edit caption / Pause; **Reconnect is owner-only**,
  so the manager sees "Ask the shop owner to reconnect" (§8 item 3). Salesperson sees nothing.
- Surfaces: retailer dashboard (home) banner + card; Growth hub → Scheduler screen with the full failure list.

## 5. System

### 5.1 Data (conceptual — final shape needs `docs/database/DATABASE.md` check + RLS per kanchuki-rls-convention)
- `post_schedule_plans`: retailer_id, platform, post_type, weekdays, post_time, batch_min/max per weekday,
  source, cover_style, rotation_pool (json), horizon, status (ACTIVE/PAUSED/ENDED).
- `scheduled_posts`: plan_id, retailer_id, scheduled_at (UTC), caption, status
  (`DRAFT → READY → PUBLISHING → POSTED | FAILED | MISSED | SKIPPED`), attempts, error,
  social_post_id (link to existing `SocialPost` on success).
- `scheduled_post_items`: scheduled_post_id, product_id, position, image_level (A/B), template_id,
  resolved_image_key.

### 5.2 Jobs
- **Plan builder** (request-time): picks products (newest first, skip posted within N days, skip out-of-stock),
  groups by category, fills batch ranges.
- **Template render**: composites level-B slides at plan confirm (or just before publish); cheap, no network.
- **Publish tick** (cron ~5 min): claim rows with an atomic compare-and-swap (RC-036 pattern, no double
  post), publish through the **existing Composer fan-out path** (idempotent on `client_post_id`), retry
  3× with backoff, grace window ~2 h then `MISSED`.
- **Token health check** (daily): dead FB/IG token → pause plan + raise one in-app alert per event (§4a).

### 5.3 Reuse (do not rebuild)
- Composer publish + idempotency + partial-success: `POST /v1/retailers/me/social/posts`.
- Caption AI: `POST /v1/growth/social/caption-suggest`, fail-open.
- Admin-curated Post Templates (caption side) already exist — image-frame templates are **new** (see §8).
- Server-side watermark pipeline (Suits Designs) as the compositing reference.
- Existing purge/cron registration in `apps/api/src/jobs/index.ts`; F-010 quota system + F-013 feature matrix
  for admin limits.

## 6. Admin control (D9)

- Add scheduling to the **plan feature matrix** (F-013) and the **quota/limits system** (F-010), editable in
  Admin → Plan Limits & Pricing:
  - `scheduling_enabled` (per plan)
  - `scheduled_posts_per_month` (per plan; seeded unlimited / daily-everyday for all plans at launch)
  - `max_active_plans` (per plan; seeded 1 per platform)
- Fails **closed** on the enable flag (same as other matrix features), checked at plan creation **and** at
  publish time so a downgrade stops the queue.
- Seed all three plans identically at launch; the owner tightens per plan later from the dashboard.

## 7. Platform constraints
- IG carousel: 2–10 items, **all slides one aspect ratio** (first sets it) → normalize to 4:5 or 1:1.
- A day with 1 product → single-image post.
- IG ~50 API posts / 24 h / account — far above plan usage; tick still reads `content_publishing_limit`.
- Long-lived tokens expire (~60 days) or die on password change / removed Page role → health check above.
- IG needs a Business/Creator account linked to a Facebook Page (`NO_IG_FOUND` case) → validate at plan creation.
- DB role has DELETE revoked (RC-049): any cleanup of old scheduled rows needs the purge role + GRANT.

## 8. Open items before build
1. ~~Template removal check~~ — **resolved 2026-10-15, nothing was removed, nothing to recover.**
   - `SocialTemplate` (migration 069, `growth-social-templates.ts`, mobile `app/growth/templates.tsx`, admin
     `/admin/social-templates`, plan key `SOCIAL_TEMPLATES`) is **still in the code and registered**. Only the
     orphan stub `services/social-template/` was deleted (commit `48f3de06`). The CLAUDE.md "partly removed"
     wording for row 46 is stale/misleading and should be corrected when this is built.
   - It is the **wrong shape for the scheduler**: retailer-scoped rows, each one a FLUX studio-shoot AI image
     generation (paid, async, quota). The scheduler needs free, deterministic frames. **Do not reuse or retrofit
     it** (schema comment on `PostTemplate` says the same).
   - `PostTemplate` (migration 091, admin-owned, plan-gated caption + hashtags + `{placeholders}`) **is reusable**:
     scheduler captions = Caption AI prefill, with the admin Post Template picker as an optional caption base.
   - Image frames (level B) are therefore **new**: a small admin-managed catalog (follow the `studio_styles` /
     `background_images` pattern: status DRAFT/PUBLISHED/HIDDEN, `plans[]`, sort_order) rendered with sharp.
2. ~~WhatsApp alert sender~~ — **dropped 2026-10-15 (D8).** Alerts are in-app only. No utility template, no
   per-message cost, no consent/sender work. (Kanchuki-owned number idea shelved; revisit only if owner asks.)
3. **Manager access (verified in `apps/api/src/plugins/auth.ts`).** "Manager" = a `Staff` row with role
   `manager` on a **default-deny route allowlist** (`MANAGER_ALLOWED_ROUTES`; salesperson is a smaller subset).
   Scheduler routes are owner-only until added. To add for managers, in the same commit as the routes:
   - `GET` scheduler status/plans/calendar → manager allowed (read)
   - `POST` retry / skip / edit-caption / pause-resume → manager allowed (mirrors "post + track" social rule)
   - **Reconnect / connect / disconnect stays owner-only** (existing rule). Manager sees
     "Ask the shop owner to reconnect Facebook" instead of a button.
   - Mirror the new rules in `apps/mobile/src/lib/staff-can.ts` and extend `staff-access.test.ts`.
   - Salesperson: no scheduler access.
4. **No in-app notification inbox exists** (no notification screen/model found under `apps/mobile/app`).
   Design uses **derived state, not an inbox**: the §4a card + dashboard banner are computed live from
   `post_schedule_plans` / `scheduled_posts` / token expiry. No alerts table, no dedupe logic, always correct.
   A real notification centre is out of scope; add later if wanted.
5. ~~"Token left" meaning~~ — **decided 2026-10-15: show all three** on the same card: (a) Meta connection
   token days left, (b) scheduling allowance left this month, (c) AI Studio shoots left.
6. **Data source for (c):** the existing F-010 `STUDIO_SHOOT` quota via `getQuotaStatus(retailerId,
   'STUDIO_SHOOT')` (`apps/api/src/lib/quota.ts`) → `{used, limit, remaining, period, unlimited}`. Read-only
   call, no new counter. Caveats to handle in the UI/endpoint:
   - When no limit row is configured, `getQuotaStatus` falls back to hard-coded tier defaults (Growth 30,
     Pro 100, Starter 0 and `unlimited: false/true` logic that is easy to misread). Show "Not included in your
     plan" for limit 0 and "Unlimited" only when `unlimited` is true — verify the Starter case against the
     real Plan Limits rows before trusting it.
   - Manager sees the same number (read), but cannot change plan/limits.
   - Same call pattern can show `AI_TAGGING_CALL` if the AI caption fill counts against it — confirm whether
     Caption AI should draw from that pool and surface it only if it is retailer-visible today.

## 9. Meta developer dashboard checklist (owner action — App Review)

The scheduler publishes with the **same permissions the Composer already uses**. Nothing new is requested for
scheduling itself. Submit these in developers.facebook.com → App → **App Review → Permissions and Features**.
Meta changes its rules, so re-verify each item against the live dashboard when submitting.

### 9.1 Permissions to request (Advanced Access)
| Permission | Used for |
|------------|----------|
| `pages_show_list` | List the Pages the retailer manages so they can pick one |
| `pages_read_engagement` | Required companion to `pages_manage_posts`; read Page data for stats |
| `pages_manage_posts` | Publish the scheduled post to the Facebook Page |
| `business_management` | Read Pages through the Business asset API (Graph requirement) |
| `instagram_basic` | Resolve the IG Professional account linked to the Page |
| `instagram_content_publish` | Publish carousels/photos to the linked IG account |

### 9.2 App-level requirements Meta checks (likely needed — verify)
- [ ] App switched to **Live** mode (not Development)
- [ ] **Business Verification** completed for the owning Business portfolio (required for Advanced Access on
      business permissions)
- [ ] Privacy Policy URL public and matching the app's real data use (photos, tokens, product data)
- [ ] **Data Deletion** instructions URL or callback configured (we already have deletion flows — SECURITY.md)
- [ ] Terms of Service URL, app icon (1024×1024), category, contact email
- [ ] Valid OAuth Redirect URIs registered (incl. `https://kanchuki.app/social/connect/callback`)
- [ ] Android key hashes added (already fixed 2026-10-14, App ID `1758308975480748`)
- [ ] Annual **Data Use Checkup** completed when Meta asks

### 9.3 What to put in each permission's submission
- A **screencast per permission** showing the real flow end to end: connect Page → plan setup → calendar →
  scheduled post going live on the Page/IG feed. **Show the scheduling flow** — it is unattended publishing,
  which reviewers look at closely.
- Plain-language **use-case description** per permission (what it does, why the app cannot work without it).
- **Test instructions + test account** (a tester with a Page + linked IG Business account) so the reviewer
  can reproduce.
- State clearly that posts publish **only on content the retailer approved on the calendar**, at the time
  they set, and that they can pause/skip/delete at any time (this is the justification for unattended publish).

### 9.4 Not needed for this feature
- No new scopes for scheduling; no Meta-side scheduling permission exists or is used.
- `instagram_business_content_publish` is for *Instagram Login* (a different login type) — not what this app
  uses (Facebook Login for Business). Do not request it.
- WhatsApp permissions (`whatsapp_business_*`) belong to F-035 and the alert-sender decision in §8.3, not here.

## 10. Build order (when approved)
1. Schema + RLS + plan builder + calendar API + admin matrix keys.
2. Publish tick on the Composer path, original photos only (shippable alone).
3. Mobile UI: FB/IG tabs, plan form, calendar, per-post caption edit.
4. Image templates (B) compositing.
5. Token health, in-app failure alerts (derived state — no WhatsApp, per D8), pause/resume, tests, RC regression pass.

## 10a. Task 1 as built (2026-10-15) — deviations from the text above

- Routes live under `/v1/retailers/me/social/schedule` (`retailers-social-schedule.ts`): plans list/get/create/confirm/**end**,
  slide `PATCH`/`DELETE` (`items/:id`), post `PATCH` (caption / skip / retry), `plan-state/:id` (pause/resume).
- **Added `POST /plans/:id/end`** (not in the spec): without it a plan could never leave ACTIVE/PAUSED and a per-platform
  limit of 1 would lock the retailer out of replacing it. Owner-only.
- **Admin keys:** `SOCIAL_SCHEDULER` (`PlanFeatureKey`, fails closed, seeded ON for all plans), `SCHEDULED_POST`
  (`QuotaResourceType`, MONTH, seeded -1 = unlimited, enforced at publish in Task 2), `ACTIVE_SCHEDULE_PLAN`
  (`QuotaResourceType`, LIFETIME, seeded 1, **counted per platform** against live ACTIVE/PAUSED plans — no usage counter).
- **Default caption is a free server template**, not Caption AI (D7 deviation, owner-approved 2026-10-15): the app calls
  the existing caption-suggest endpoint per post on demand and `PATCH`es the caption.
- **Slide "Style this" (template) is not in Task 1** — slides are `ORIGINAL` only; template catalog is Task 4.
- Preview = a persisted `DRAFT` plan; creating a new plan ends the previous draft for that account; confirm skips slots
  already in the past. Plan/post rows are never hard-deleted; only `scheduled_post_items` has DELETE granted (migration 129).
- Manager rules (`MANAGER_ALLOWED_ROUTES`): `GET …/schedule`, `PATCH …/schedule/posts`, `PATCH …/schedule/plan-state`.
  Create/confirm/end and slide edits are owner-only by default-deny. Salesperson and every support-session scope: nothing.

## 10b. Task 2 as built (2026-10-16) — publish tick + token health

- **Files:** `apps/api/src/jobs/scheduled-post-publish.ts` (+ `.test.ts`, 23 tests); wired in `jobs/index.ts` as maintenance
  jobs `schedule-publish-tick` (`*/5 * * * *`) and `schedule-token-health` (`45 1 * * *`).
- **Claim:** `updateMany WHERE status=READY` → `PUBLISHING` (+`attempts`, `last_attempt_at`); only `count===1` publishes (RC-036).
  Only ACTIVE plans' rows are picked; batch 20 per tick, oldest first.
- **Publish path:** the same Meta primitives + `createPostedRowWithRetry` the Composer fan-out uses (the fan-out is a route
  handler, not a callable — not extracted). 1 slide → single photo, 2+ → carousel. Original photos only (a missing
  `photo_id` falls back to the product's primary photo).
- **Idempotency:** the DB `client_post_id` row (an already-POSTED `SocialPost` is adopted, never re-published). The Redis
  `claimSocialPostId` marker is not used — the CAS claim already serialises a single row.
- **Retry/grace:** 3 attempts, wait 5 min then 15 min from `last_attempt_at`; READY rows >2 h past `scheduled_at` → MISSED
  (error: "The posting window passed. Retry to post it now."). Stale PUBLISHING (>30 min, crashed worker) is re-queued.
- **Publish-time gates** (fail → FAILED + "Scheduling is not available on your plan.", no retry): `SOCIAL_SCHEDULER` flag,
  `checkQuota(SCHEDULED_POST)`, retailer not suspended and `plan_status` in `ACTIVE`/`TRIAL`. Usage counted on success only.
- **Failure text:** only `MetaApiError` is mapped. `MetaApiError` gained optional `fb: {code, subcode}` (additive, set at the
  publish error sites). 190/102/subcodes 458–467 → token (pauses plan); 10/200–299 → no access (pauses plan);
  `ACCOUNT_NOT_FOUND` → IG not linked (pauses plan); 4/17/32/613 → rate limit (retries); 9004/36000–36003/2207xxx → photo rejected
  (no retry) only on a media signal (9004, 36000–36003, subcode 2207xxx); plain `100` ("invalid parameter") → generic "Post failed. If it keeps failing, contact support." with no retry; anything else → generic "Post failed. We'll retry…" (retries). Raw messages go to the server log only.
- **Account gone:** inactive `SocialAccount` → plan paused, post FAILED, attempt refunded.
- **Row-write safety:** if the post is live but the `SocialPost` row write fails, the scheduled post is still marked POSTED
  (`social_post_id` null) — never retried into a double post.
- **No FAILED `SocialPost` rows:** failures live only on `scheduled_posts.error` (a FAILED row would occupy the unique
  `client_post_id` slot).
- **Token health:** daily, ACTIVE plans whose account is inactive or `token_expires_at <= now` → PAUSED with
  `pause_reason` "Paused — {Facebook|Instagram} token expired". Pauses only on a dead token; "expiring in <=7 days" stays
  derived state for the Task 3 card. No active Graph probe.
- **Open:** the Meta code→reason map is from Graph documentation, not observed prod errors — review logs
  (`[meta-graph] ... failed` carries `fb_code`/`fb_subcode`) after the first live week. Existing daily jobs register with
  `repeat.limit: 1`; the new jobs deliberately omit `limit` (BullMQ stops repeating after it — a 5-min tick would die).
  Not run against live Meta.

## 10c. Task 3 as built (2026-10-16) — mobile UI + status endpoint

- **API:** `GET /v1/retailers/me/social/schedule/status` (derived, nothing stored; owner + manager via the existing `…/schedule`
  GET allowlist). Returns per-account token state (`OK` / `EXPIRING` ≤7 d / `EXPIRED`) + plan + next post, `SCHEDULED_POST`
  allowance (own math — seeded `-1` reads as unlimited, not `getQuotaStatus`'s tier default), active-plans `n/max`, Studio
  shoots (`getQuotaStatus(STUDIO_SHOOT)`; `included=false` when limit 0), last 5 FAILED/MISSED with the stored reason, and
  `needs_attention`. The calendar GET now includes each slide's product name + photo urls. `quota.ts` exports `periodStart`.
- **Mobile:** `app/social/schedule/index.tsx` (status card per platform, allowance, failures with Retry/Skip/Edit, pause/resume,
  owner-only Reconnect, manager sees "Ask the shop owner to reconnect"), `new.tsx` (plan form: account, carousel/single,
  weekdays, per-day min–max, IST time, newest/category, 1W/2W/1M — no cover/template controls until Task 4), `[id].tsx`
  (calendar by IST day, thumbnails, caption edit, AI caption via caption-suggest, skip, remove slide, other photo, swap
  product via `ProductGridPicker`, confirm summary, end plan). `SchedulerBanner` on home + Growth hub (hidden when nothing is
  wrong or the role can't see it). Growth hub tile "Post Scheduler". Role gating via existing `social.schedule` /
  `social.schedule.plan` keys.
- **Not in the form:** MANUAL product source, cover style, template pool (Task 4), per-slide "style this".
- **Not verified:** no device/emulator run — typecheck, lint and unit tests only. The new `router.push` literals show
  TS2345 locally because the gitignored `.expo/types/router.d.ts` is stale (two pre-existing instances too); regenerates on
  `expo start`.

## 10d. Task 4 as built (2026-10-16) - image templates (level B)

- **Registry in code, not a table** (owner decision): ids in `@kanchuki/shared` (`SCHEDULE_SLIDE_TEMPLATES`,
  `SCHEDULE_COVER_STYLES`), renderers in `packages/ai/src/schedule-templates.ts` (sharp + SVG overlay, 1080x1350 4:5 JPEG).
  Slide styles: `white_price`, `new_arrival`, `festival_frame`, `logo_corner`. Cover: `collage_cover`. Add an admin catalog
  (status / plans / sort order, per spec 8.1) only when a template must be retired or gated per plan.
- **Render at publish** (`apps/api/src/lib/schedule-render.ts`): the tick calls `resolvePostImages`; a styled slide is rendered
  once and its R2 key stored on `resolved_image_key`. Bulk styling only writes the choice, so "apply to all" is instant and the
  price strip shows the price at post time. Single-slide "Style this" renders immediately for the preview.
- **One aspect ratio:** if any slide is styled or a cover is built, the remaining originals in that post are centre-cropped to
  4:5 too. A post with no styling is untouched.
- **Cover is not a DB row** (deviation from the planned item-at-position-0): built per publish from up to 4 slide photos and
  prepended, only for 2-9 slides (cap 10). `plan.cover_style` carries the choice.
- **Fallbacks:** any render failure degrades to the original photo; a cover failure skips the cover. A post never fails because
  of a template.
- **Routes** (`retailers-social-schedule-style.ts`, owner-only by default-deny): `GET /templates`, `POST /items/:id/style`,
  `POST /posts/:id/style`, `POST /plans/:id/style` (`template` id | `rotate` | null), `PATCH /plans/:id/design`. Plan create
  now validates `cover_style` / `rotation_pool` against the registry. Calendar GET adds `resolved_image_url` per slide.
- **Mobile:** per-slide wand, "Style post", "Style all photos", rotation pool + cover toggle on the calendar; cover and pool
  chips on the plan form; rendered thumbnails with a styled label.
- **Festival frame** uses the nearest festival within 7 days of the post, else "Festive Collection". **Store logo** uses
  `retailer.logo_r2_key`, else a store-name pill. Price is digits and the rupee sign only (no Indic shaping needed).
- **Not verified:** no live R2 / device run. The first SVG text render in a process pays a cold start of about 5 s, so the
  single-slide route is slow on a cold API instance (mobile allows 60 s). Fonts are the host sans stack; confirm the Railway
  image has one (DejaVu / Noto) before relying on the badge text.

## 10e. Task 5 as built (2026-10-16) - hardening + launch checklist

- **Font fix (real bug):** `apps/api/Dockerfile` is `node:22-slim` with no fonts, so librsvg rendered template text
  (price strip, New Arrival badge, festival text) as blanks/boxes. Added `fonts-dejavu-core` to the apt line. Not
  verified on Railway until the image rebuilds: check `fc-list` (checklist §1).
- **Status card gap fixed:** `GET …/schedule/status` listed only `is_active` accounts, so a plan paused because its account
  was disconnected or went inactive dropped off the card and the banner, hiding the pause reason and Reconnect prompt.
  The query now also returns accounts that still carry an ACTIVE/PAUSED plan; an inactive one reports token `EXPIRED`.
  Found before merge on an open PR, so no RC entry (RC is for shipped bugs).
- **Manager pins:** `plugins/staff-access.test.ts` now pins `GET status` + `GET templates` readable by a manager, every
  styling write (`items|posts|plans/:id/style`, `plans/:id/design`) owner-only, and salesperson denied `status`.
- **Verified, unchanged:** the two scheduler jobs omit `repeat.limit` on purpose; the 13 older jobs keep `limit: 1`
  (untouched). Alerts are derived state only (no table, no WhatsApp). Pause/resume + failure paths already covered by the
  tick (28) and route (38) tests; resume after the 2 h grace yields MISSED, not a burst of posts.
- **Deliberately not built:** Meta code-map widening (no observed prod errors, review `fb_code` logs after week 1);
  R2 cleanup of rendered images for ended plans; retention purge of old `scheduled_posts` (needs purge role + GRANT +
  migration); cold-start render warm-up (documented only). Triggers in `docs/runbooks/f-043-scheduler-launch-checklist.md` §4.
- **Launch checklist:** `docs/runbooks/f-043-scheduler-launch-checklist.md` (merge order, Meta App Review, first live run,
  device script for the 3 screens).

## 11. Docs to update on build
CLAUDE.md index row, `docs/BUILD-LOG.md`, `docs/PLAN.md`, `docs/PRO-REQUIREMENTS.md`, `docs/DATABASE.md`.
