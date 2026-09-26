# F-039 Phase 2 — CatVTON-on-RunPod Try-On, Admin-Gated Launch + Dual Quota

**Status:** 🔴 Planned — owner go-ahead given 2026-09-26 to **build now, launch later**.
**Parent:** `docs/tasks/pending/style-match-lite.md` §9 (readymade-only VTO re-scope,
cost numbers) and `docs/PRO-REQUIREMENTS.md` §38.7.
**Owner intent (verbatim, condensed):** build the whole thing now — retailer app,
customer web, backend, RunPod integration — but it must **not appear anywhere**
(mobile or customer web) until the owner explicitly flips it on. When ready, owner
just enables it — no redeploy, no re-integration. Retailers get a monthly try-on
quota (owner's example: 100/month); phone-OTP-registered customers get a smaller
one (owner's example: 3–5/month). **Admin has full control of both numbers**, for
every plan/tier, live-editable.

---

## PROMPT — read this before touching any file in this task

You are building a feature that must be **fully functional in code and invisible
in product** until a human flips one switch. Two failure modes to avoid, in order
of how bad they are:

1. **Worse — a data-privacy failure.** If you ever make a person's try-on photo
   reach R2/DB storage without an explicit consent screen in front of it, or skip
   the "never store the input photo" rule in T6, you have shipped a DPDP violation
   that ships live the moment the flag flips, silently. Get T6 right before
   anything else works.
2. **Bad — the feature leaks before launch.** If the retailer app or customer web
   shows a try-on button/screen to anyone before the owner enables it, or a
   client-side-only check hides it (bypassable by inspecting the API response),
   you have shipped the opposite of what was asked. **The gate must be enforced
   server-side** (the API route itself checks the feature flag and 404s/403s —
   never 200-with-a-hidden-flag) — a UI-only hide is not the gate.

Read `packages/db/prisma/schema.prisma` sections named in each task before writing
migrations — table/enum names below are the intended shape, not verified-final;
confirm nothing with that name already exists (search first, this repo has
several `@deprecated` leftovers from the 2026-08-31 teardown that share similar
names — `TRY_ON` / `VIRTUAL_TRY_ON` are deprecated enum values, **do not reuse
them**, add new ones, per T1).

This repo's `CLAUDE.md` "AI Agent Operational Control Policy" applies: propose
migrations for approval, never run them against production, never modify
`CLAUDE.md` itself without asking. Read `CLAUDE.md` and
`docs/root-cause/README.md` before starting.

**Skills:** each task below names the Claude Code skill(s) most relevant to it —
invoke them if your harness supports the `Skill` tool. If a task touches a file
pattern a skill already covers (e.g. any `.tsx` under `apps/mobile` →
`agent-skills:frontend-ui-engineering`), prefer the skill's guidance over
improvising.

---

## T0 — Verify the RunPod infra is still alive (owner/manual, no code)

**Blocks T5.** The CatVTON worker (`endpoint pnvchif9f4bcom`, `template
v76b819nle`) was confirmed working end-to-end 2026-07-11, then the *feature* was
removed 2026-08-31 — it is **not verified whether the RunPod endpoint/template
itself was also torn down**, or just stopped being called. Owner checks the
RunPod dashboard: does the endpoint still exist, is `workersMax > 0`, is the
Docker image (`ghcr.io/kapisejix/kanchuki-tryon:<sha>`) still pullable. If gone,
T3 includes rebuilding it from `services/tryon/` (Dockerfile.runpod,
handler_runpod.py, mask_utils.py — per
`runpod-catvton-deploy-debug` history, if that file/history still exists in this
repo's own docs).

**Skill:** none (manual/dashboard check).

---

## T1 — Schema migration (S–M)

**Skill:** `ecc:database-migrations`, `supabase:supabase-postgres-best-practices`

1. `QuotaResourceType` gains **`TRY_ON_GENERATION`** (new value — do not touch the
   `@deprecated TRY_ON` value, that stays dead).
2. `PlanFeatureKey` gains **`VIRTUAL_TRY_ON_V2`** (new value — do not touch the
   `@deprecated VIRTUAL_TRY_ON` value). This enum value is the entire launch
   switch: `PlanFeature.enabled` defaults `false` for every plan on creation, and
   nothing shows anywhere until an admin flips it `true` for a plan in the
   existing Plan Feature Matrix screen (`apps/web/src/app/admin/plan-features`) —
   no new admin screen needed for this part, it's enum-driven and already exists
   (F-013).
3. New model, retailer + customer job record:
   ```prisma
   model TryOnJob {
     id                   String   @id @default(cuid())
     retailer_id          String
     customer_account_id  String?  // null = retailer generated it themselves (in-store)
     product_id           String
     status               String   // PENDING | COMPLETED | FAILED
     result_url           String?  // R2 URL — the generated image ONLY, never the input photo
     failure_reason       String?
     created_at           DateTime @default(now())
     completed_at         DateTime?

     retailer         Retailer         @relation(fields: [retailer_id], references: [id])
     customer_account CustomerAccount? @relation(fields: [customer_account_id], references: [id])
     product           Product          @relation(fields: [product_id], references: [id])

     @@index([retailer_id, created_at])
     @@index([customer_account_id])
     @@map("try_on_jobs")
   }
   ```
   No column for the input/person photo — it is never persisted (T6).
4. Customer-side quota is **not** per-plan (customers have no plan) — one
   admin-editable number, global, mirroring `PlanLimit`'s shape:
   ```prisma
   model CustomerResourceLimit {
     id               String            @id @default(cuid())
     resource_type    QuotaResourceType @unique
     limit_per_period Int               // owner's example: 3–5
     period           QuotaPeriod       @default(MONTH)
     updated_at       DateTime          @updatedAt
     updated_by_id    String?           // TeamMember.id, same audit convention as PlanFeature

     @@map("customer_resource_limits")
   }

   model CustomerUsageCounter {
     id                  String   @id @default(cuid())
     customer_account_id String
     resource_type       QuotaResourceType
     period_start        DateTime
     count                Int      @default(0)

     customer_account CustomerAccount @relation(fields: [customer_account_id], references: [id])

     @@unique([customer_account_id, resource_type, period_start])
     @@map("customer_usage_counters")
   }
   ```
5. Seed data (`packages/db/prisma/seed-plan-limits.ts`, extend — don't duplicate
   the seeding pattern): `PlanLimit` rows for `TRY_ON_GENERATION` — starting
   numbers only, admin edits live: Starter 20/mo, Growth 50/mo, Pro 100/mo (owner
   named "100" as their example — treated here as the Pro-tier starting default,
   not a hardcoded universal number). One `CustomerResourceLimit` row:
   `TRY_ON_GENERATION`, limit `3`, period `MONTH` (owner's low end of their
   3–5 example — admin adjusts).

---

## T2 — Quota lib: add the customer-side half (S)

**Skill:** `agent-skills:api-and-interface-design`

`apps/api/src/lib/quota.ts` currently only checks/increments **retailer** quota
(`checkQuota`/`incrementUsage`, keyed on `retailer_id` + `PlanLimit`/
`RetailerLimitOverride`/`UsageCounter`). Add the mirror pair —
`checkCustomerQuota(customerAccountId, resourceType, amount)` /
`incrementCustomerUsage(...)` — reading `CustomerResourceLimit` instead of
`PlanLimit`, writing `CustomerUsageCounter` instead of `UsageCounter`. Same
period-bucketing helper (`periodStart`) is reusable as-is, no duplication needed.
A try-on request from a passport-logged-in customer must pass **both** checks
(retailer's monthly cap AND that customer's monthly cap) before the RunPod call
fires — fail on whichever hits first, message says which.

---

## T3 — Audit + rebuild the generation call path (M–L)

**Skill:** `superpowers:systematic-debugging` (for the audit half — confirm what
survived the teardown before assuming), then `agent-skills:api-and-interface-design`

1. **Audit first, don't assume:** grep the current repo for `packages/ai/src/
   tryon.ts`, `saveTryOnResultToR2`, `triggerCatVTON` — the 2026-08-31 teardown
   removed the *feature* (routes, UI, quota rows) but it is unverified whether the
   library/worker-call code was also deleted. Report what's actually left before
   writing anything new.
2. New route (mirror the async-job shape already used by AI Studio Shoot,
   `apps/api/src/routes/products/products-studio.ts` — same multipart-upload +
   job-row + background-worker-call pattern, don't invent a new shape):
   `POST /v1/products/:id/try-on` — accepts one person/wearer photo (multipart),
   the garment is the product's own existing photo (already on R2, no re-upload).
   - **Feature-flag check first, before anything else in the handler:** if the
     retailer's plan doesn't have `VIRTUAL_TRY_ON_V2` enabled, return **404** (not
     403 — a 403 confirms the route exists and is just locked, a 404 tells an
     inspecting client nothing). This is the real launch gate — see the PROMPT
     section above.
   - Then `checkQuota` (retailer) + `checkCustomerQuota` (if
     `customer_account_id` present on the request) — both must pass.
   - Call the RunPod endpoint (verified alive per T0, or rebuilt).
   - Store **only the result image** to R2, write `TryOnJob`, increment both
     usage counters.
   - Discard the input person-photo buffer after the call — never write it
     anywhere (T6).

---

## T4 — Retailer app + customer web UI, built but flag-hidden (M)

**Skill:** `agent-skills:frontend-ui-engineering`

Build the actual screens now — retailer app (in-store: photo the customer,
generate, show/share result) and customer web (product detail page: "Try it on"
button → selfie → result). Gate visibility the same way every other
plan-feature-gated surface in this codebase already does (see the WhatsApp
Business API settings section, `retailers-settings.ts`, for the existing
pattern): fetch the retailer's enabled-feature list, render the entry point only
if `VIRTUAL_TRY_ON_V2` is present. Since the flag defaults `false` for every
plan (T1), **nothing shows anywhere the day this ships** — exactly the owner's
"build now, don't show" ask — until an admin enables it per-plan in the existing
Plan Feature Matrix screen, which needs no code change to do.

---

## T5 — Admin panel (S)

**Skill:** none beyond what T1/T4 already produce — this task is mostly
verification, not new build.

1. Plan Feature Matrix (`apps/web/src/app/admin/plan-features`) — confirm
   `VIRTUAL_TRY_ON_V2` appears automatically (the page is enum-driven per
   existing `PlanFeatureKey` values; if it isn't, that's the one real gap to
   close here).
2. Plan Limits admin screen — confirm `TRY_ON_GENERATION` appears the same way
   for the retailer-side number.
3. New small section (extend an existing admin settings/quota page, don't build
   a standalone new page for one number): **customer try-on limit**, one editable
   integer, writes `CustomerResourceLimit`. This is the "admin decides 3–5" UI.

---

## T6 — Consent + storage rules (S, do not skip, security-critical)

**Skill:** `agent-skills:security-and-hardening`

Two different photos, two different rules — do not conflate them:

- **Input (the wearer's photo, whoever is being tried-on):** same rule as
  Style Match Lite's selfie call (`style-match-lite.md` §3.2) — **never
  persisted**. Exists in request memory for the one RunPod call, discarded after.
  No new retention-policy text needed for this half, because nothing is
  retained.
- **Output (the generated garment-on-person image):** **is** stored
  (`TryOnJob.result_url`, R2) — the retailer needs to view/share/re-download it,
  unlike the skin-match badge which was text-only. This is a new category of
  "photo of a real person" stored on the platform and **needs its own consent
  screen + an addition to the existing photo-retention notice**
  (`docs/SECURITY.md` §3b/§3c, the promise that shipped 2026-09-24) before this
  can go live — even though the code can be built and merged with the flag off,
  the notice text must be updated **before T8's flag flip**, not after.

---

## T7 — Tests (S–M)

**Skill:** `agent-skills:test-driven-development`

- Feature-flag off → route returns 404, not a 200 with an empty/locked body.
- Dual quota: retailer under cap + customer over cap → blocked, and vice versa;
  message names which cap was hit.
- Input photo never reaches any storage call — assert no R2/DB write for the
  person-photo buffer (mock the storage client, assert it's called exactly once,
  with the result image only).
- RunPod call mocked — don't burn real GPU cost in CI.

---

## T8 — Launch checklist (owner-only, no code)

**Skill:** `agent-skills:shipping-and-launch`

1. Confirm T6's notice-text update is live (legal gate, not optional).
2. Confirm RunPod endpoint scaled up (`workersMax > 0`) — it may have been
   scaled to zero since the 2026-08-31 removal.
3. Flip `VIRTUAL_TRY_ON_V2` to enabled for the chosen plan(s) in Admin → Plan
   Feature Matrix. This alone makes it appear on mobile + customer web — no
   redeploy, matching the owner's original ask.
4. Set the real retailer-per-plan numbers and the customer number in the two
   admin screens from T5 (the T1 seed values are placeholders).
5. Re-run the pre-production regression checklist (`docs/root-cause/README.md`)
   before flipping the flag on a live plan.

---

## Not doing (this phase)

Any UI/API change that shows the feature before T8 runs. Reusing the deprecated
`TRY_ON` / `VIRTUAL_TRY_ON` enum values. Storing the input/wearer photo under any
circumstance. A single global limit shared between retailer and customer quotas —
they are two separate, separately admin-editable numbers by design.
