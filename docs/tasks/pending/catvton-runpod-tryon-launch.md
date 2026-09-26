# F-039 Phase 2 — CatVTON-on-RunPod Try-On, Admin-Gated Launch + Dual Quota

**Status:** 🔴 Planned — owner go-ahead given 2026-09-26 to **build now, launch later**.
**T0 ✅ RESOLVED 2026-09-26 — endpoint alive, GHCR image pullable; worker readiness (`workersMax`) still needs the owner's RunPod API key (see T0 result below).**
**T1 ✅ + T2 ✅ 2026-09-26 — schema + customer quota built (migrations 118/119 PROPOSED, not applied), `quota.test.ts` 10/10.**
**T3 ✅ code-complete 2026-09-26 — client (`packages/ai/src/tryon.ts` + inline-photo worker input) AND the `POST /v1/products/:id/try-on` route + job. Migrations 118/119 must be applied at runtime — see the T3 results below.**
**T3 worker image ✅ REBUILT + PUSHED 2026-09-26 — `ghcr.io/kapisejix/kanchuki-tryon:latest` + `:518d1bee` now carry the `person_image_base64` handler (run `36234151071`, green, 17.1 min). ⚠️ The RunPod template's tag must be re-pointed before the live endpoint serves it — see the T3 rebuild result below.**
**T6 ✅ BUILT 2026-09-26 — consent gate + record + withdrawal + notice. Migration **120** added (not applied; apply 118 → 119 → 120 in order). The API now **requires** `?consent_version=`, so T4's consent screen is the thing that satisfies it — see the T6 result below.**
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

## T0 — Verify the RunPod infra is still alive (owner/manual, no code) — ✅ largely resolved 2026-09-26

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

### T0 result — 2026-09-26: **NOT gone. Endpoint exists + image pullable.**

Checked without any secret. RunPod 404s a non-existent endpoint ID but 401s an
existing one that just needs auth, so the ID is a pure existence probe:

```
GET /v2/pnvchif9f4bcom/health        → 401   (exists — auth required)
GET /v2/zzzzzzzzzzzz/health          → 404   (control)
GET /v2/notarealendpoint123/health   → 404   (control)
```

- ✅ **Endpoint `pnvchif9f4bcom` exists** — not torn down with the feature.
- ✅ **Docker image `ghcr.io/kapisejix/kanchuki-tryon` alive + publicly pullable** —
  anonymous GHCR token → tag list returned HTTP 200: `latest`,
  `688ce1b85036ef67e635a074083b6180ad9dc298` (newest; commit `688ce1b8`, 2026-07-10,
  "SHA-tag RunPod docker image to force fresh pulls"), + 8 older SHA tags. No build
  after the 2026-07-16 CatVTON purge.
- ⚠️ **`workersMax` / worker readiness NOT verified** — needs `RUNPOD_API_KEY`
  (prod secret, not accessed). This is the only open question, and it decides
  *alive-and-ready* vs *alive-but-scaled-to-zero*. Owner runs:
  ```bash
  curl -H "Authorization: Bearer $RUNPOD_API_KEY" https://api.runpod.ai/v2/pnvchif9f4bcom/health
  # workers.ready/idle/running — >0 = scaled up; all 0 = scaled to zero
  ```
  Same probe as step `[0]` of `scripts/test-2piece-tryon.mjs` — **do not run the
  full script** (it burns a real GPU call and writes test objects to R2).
- ⚠️ **Template `v76b819nle` NOT verified** — RunPod exposes no anonymous route
  for templates (REST API needs a key).

**Repo-side correction (T0's rebuild instruction was stale):** `services/tryon/`
(`Dockerfile.runpod`, `handler_runpod.py`, `mask_utils.py`, `app.py`,
`requirements.txt`) and the GHCR build workflow `.github/workflows/docker-tryon.yml`
were **deleted 2026-07-16** in `f55d6099` ("swap CatVTON for Fashion V-Tone
v1.5, purge old engine"). The API call path (`packages/ai/src/tryon.ts`,
`apps/api/src/routes/tryon.ts`, `apps/api/src/jobs/process-tryon.ts`) was deleted
in the 2026-08-31 teardown (`8426e41e`, `76c5acdb`). Only
`scripts/test-2piece-tryon.mjs` survives — and it imports the now-deleted
`packages/ai/dist/tryon.js`. The worker source is **recoverable from git**:
`git checkout f55d6099^ -- services/tryon/`.

**Consequences for T3/T5:** T5 is unblocked. T3 is a **re-point, not a full
worker rebuild** — the image is intact and pullable, provided the owner sets
`workersMax > 0`; the client call path still has to be rebuilt from scratch
(there is nothing left on disk to re-point from).

**Update (same day):** `services/tryon/` restored from `f55d6099^` and pruned to
the 5 files the RunPod build actually uses (`Dockerfile.runpod`,
`handler_runpod.py`, `mask_utils.py`, `requirements.txt`, `README.md`) — the
549-file vendored `CatVTON/` tree and the self-host `app.py` / `Dockerfile` /
`docker-compose.yml` are **not** used by `Dockerfile.runpod` (it pulls CatVTON
from GitHub upstream, pinned `999bdbe8`, and the weights from HuggingFace).
`RUNPOD_API_KEY` + `CATVTON_API_URL` added to `INTEGRATION_KEYS` (F-012 vault) so
the worker credentials are settable from Admin → Integrations — no migration,
the catalog is enum-driven.

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

### T1/T2 result — 2026-09-26: **both built, migration proposed (NOT applied)**

**Schema (T1).** Both enum values and all three models are in
`packages/db/prisma/schema.prisma`; `prisma validate` is clean. The new values
are appended at the **end** of each enum, not beside their deprecated
lookalikes — `ALTER TYPE ... ADD VALUE` can only append, and putting them
mid-list would make Prisma generate a reorder that Postgres cannot express.

- `PlanFeatureKey.VIRTUAL_TRY_ON_V2` — the launch switch. Fails CLOSED like
every `PlanFeatureKey` value, so nothing shows anywhere until an admin ticks it.
- `QuotaResourceType.TRY_ON_GENERATION` — the retailer-side meter.
- `TryOnJob` — with **no input-photo column at all** (T6), and `result_url`
  documented as the R2 *key*, served presigned per read.
- `CustomerResourceLimit` (one admin-editable number per resource, since a
  shopper has no plan) + `CustomerUsageCounter` (its counter).

**Migrations — two files, and the split is load-bearing.**
`118_try_on_v2_enum_values` is the two `ALTER TYPE ... ADD VALUE` statements
alone, because PostgreSQL 55P04 forbids *using* a value in the same transaction
that added it and Prisma runs each file as one transaction. `119_try_on_v2_tables`
creates the tables, indexes and FKs and seeds the limit rows. This is the same
split the repo already hit twice (growth 055/056/057, catalog sync 060/061/062)
and the same shape as suits-designs' 094/095.

**⚠️ Not applied.** Per the operational policy the agent does not run
migrations; the owner applies 118 then 119 from the admin runner. Order matters.

**Two deliberate deviations from the spec's T1 text, both worth knowing:**

1. **Seeding moved from `seed-plan-limits.ts` into migration 119** (idempotent
   `ON CONFLICT DO NOTHING`). The spec asked to extend the seed script instead,
   but that script *upserts* — it overwrites the live values on every run. For a
   resource whose entire purpose is being admin-edited at runtime, a re-run
   would silently reset the owner's numbers (the same hazard exists for the
   older resources; it is pre-existing, not introduced here).
   `DO NOTHING` also grants the point the spec was reaching for: a fresh local DB
   gets its rows because migrations run before anyone seeds, and the
   `checkQuota` / `checkCustomerQuota` fail-open default is never what a metered
   GPU call hits in practice. Starting numbers are the spec's — 20 / 50 / 100 per
   month, and 3 per month for shoppers. (Noted in passing: `seed-plan-limits.ts`
   still seeds rows for the **deprecated** `TRY_ON` enum value, so dead config
   is showing in the admin Plan Limits screen. Left alone — it is teardown
   residue, not part of this feature.)
2. **No RLS on any of the three tables.** The spec's schema sketch does not
   mention RLS either way, but the dropped predecessor *did* have it
   (migrations 003/010/016), so silence here could be read as accidental. It is
   deliberate: migration 099's header records that the zero-policy RLS pattern is
   a Supabase-era vestige, that tables added since the Railway move ship without
   it, and that adding it *breaks the pooled Prisma read path* (migration 111 is
   the long-form version). Those old policies also named `authenticated`/`anon` —
   roles the backend does not use — so this is not a revival of them.

Also verified, because a new table is what tends to break these:
`purge-rls-policy.test.ts` (no migration-111 entry needed — nothing enables RLS
here) and `purge-soft-deleted.test.ts` (no purge sweep needed — `try_on_jobs`
has a real CASCADE FK, and the test only demands an explicit sweep for tables
with a **bare** `retailer_id` and no FK). Both green, so `try_on_jobs` needs
neither a policy nor a purge-job change. No explicit GRANTs are needed either:
`ALTER DEFAULT PRIVILEGES` (setup-role-separation §19.1) already gives
`kanchuki_app` SELECT/INSERT/UPDATE on new tables, which covers the counter
upsert.

One doc fix rode along: `ProductPhoto.piece_type`'s comment claimed it "drives
try-on chaining in `packages/ai/src/tryon.ts`", which stopped being true when
that chaining was dropped in the T3 rebuild. The tag is still captured and
displayed; nothing reads it for try-on any more.

**Quota lib (T2).** `checkCustomerQuota` / `incrementCustomerUsage` mirror the
retailer pair — same `periodStart` helper (no duplication), reading
`CustomerResourceLimit`, writing `CustomerUsageCounter`, and failing **open**
when unconfigured like `checkQuota` does.

The two rejections are **deliberately different codes**: the retailer cap throws
the existing `PLAN_LIMIT_EXCEEDED`, the customer cap throws
`CUSTOMER_LIMIT_EXCEEDED` (both 402). That is what satisfies "message says
which" — and the distinct code matters for a second reason, that
`PLAN_LIMIT_EXCEEDED`'s message tells the reader to upgrade their plan, which is
meaningless advice to a shopper who has no plan. ⚠️ `CUSTOMER_LIMIT_EXCEEDED` is
a new code and is **not yet in `docs/API.md`'s error list** — add it with T3's
route, when there is a client that can match on it.

**Verified:** `prisma validate` clean; `prisma generate` run (this is a
build-artifact step, no DB access); `@kanchuki/api` + `@kanchuki/ai` typecheck
clean; `apps/api/src/lib/quota.test.ts` 10/10 (new — covers fail-open, unlimited,
the cap boundary in both directions, period bucketing, and the two-codes
assertion); full API suite **1446 passed / 1 failed**, the single failure being a
5s `products.test.ts` timeout that passes 34/34 in isolation (pre-existing
parallel-load flake, unrelated to this change).

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

### T3 result — 2026-09-26: **client path rebuilt; route + job still blocked on T1/T2**

**Audit (step 1) — what actually survived.** Nothing of the old call path did.
`triggerCatVTON` / `saveTryOnResultToR2` / `triggerTryOn` / `callVTONOnce` existed
nowhere in live code — only `scripts/test-2piece-tryon.mjs`, which imports the
deleted `packages/ai/dist/tryon.js`. The old source was recoverable from git
(`git show f55d6099^:packages/ai/src/tryon.ts`).

**A guard test owns this area — check it before touching try-on code.**
`apps/api/src/lib/retired-tryon-guard.test.ts` fails the build if the **IDM-VTON**
path reappears as code under `apps/`, `packages/` or `scripts/` (its endpoint,
`generateIdmVtonTryon`, and its `human_img_url`/`garm_img_url`/`garment_des`
params). **CatVTON is not in that list** — the guard was green with the rebuilt
client in place (8/8), so T3 is legal. What is banned is IDM-VTON; do not read
the `fal-client.ts` tombstone comment as banning CatVTON too.

**Two things in the old client could not be carried over:**

1. **`PIECE_TAGGABLE_CATEGORIES` no longer exists** — the teardown removed it from
   `packages/shared/src/constants/index.ts` (`docs/build-log/part-3.md`).
   `ProductPhoto.piece_type` survived, but the category list it was read against
   did not, so the old two-call upper→lower chaining (and
   `isPieceTaggableCategory`) is gone. T3's route takes **one** garment photo, so
   the single-call path is the whole contract for now.
2. **Background-removal preprocessing is dropped.** The old client ran the
   garment through `@imgly/background-removal-node`, cached the cutout at
   `tryon-preprocessed/<sha256>.png` and re-uploaded it. T3's route says the
   garment is "the product's own existing photo (already on R2, **no re-upload**)",
   so the presigned product-photo URL now goes straight to the worker — one less
   R2 object per product and no onnxruntime work on the hot path. The cost is the
   pre-teardown quality note ("raw uploads are rarely bg-clean"); it is the first
   thing to add back if output quality needs it.

**The privacy rule forced a worker change.** (PROMPT failure mode #1 — get T6
right before anything works.) The worker's contract was URL-only:
`handler_runpod.py` does `requests.get()` on `person_image_url`. A runpod
base64 `data:` URI can't be re-fetched by that Python side, so there is no
submit-a-URL-to-the-path that also satisfies "the wearer's photo is never
persisted" — an upload *is* a write, and a crash between the two calls orphans
the photo outside any retention policy. So the wearer's bytes go **inline in the
job payload** instead:

- `services/tryon/handler_runpod.py` grew `person_image_base64` /
  `garment_image_base64` (additive — the URL inputs still work), decoded in memory
  by a new `decode_base64_image()` that accepts a raw or `data:` payload.
- `packages/ai/src/tryon.ts` (new) sends the photo as
  `data:<content-type>;base64,...`, and never writes it — only
  `saveTryOnResultToR2()` writes, and only the generated result, under
  `tryon-results/<jobId>/result.jpg`. It returns the **key**, not a URL, so the
  caller can hand out a per-read presigned URL (this is a photo of a real person;
  the product-photo rule applies).

**⚠️ Consequence — the GHCR image must be rebuilt before this path works live.**
The deployed tag predates the handler change, so a live endpoint would reject
`person_image_base64` (both inputs missing → the handler's own
"... is required" error). This is the one place T0's "a re-point, not a full
worker rebuild" reading is now out of date. `.github/workflows/docker-tryon.yml`
was deleted in `f55d6099`, so **nothing rebuilds the image on push today** —
restoring it (or a one-off manual build + push) is a prerequisite of T8 step 2,
not of merging this code.

**Config is now admin-manageable, not env-only.** The old client read
`CATVTON_API_URL` / `RUNPOD_API_KEY` from `process.env` into module-load `const`s,
which (a) bypassed the Admin → Integrations vault and (b) meant an admin-saved key
did nothing until an API restart. Both now resolve through `getSecret()` per call
(DB vault first, `.env` fallback; `getSecret` caches internally, so it is not a
per-request DB hit) — the `RUNPOD_API_KEY` + `CATVTON_API_URL` rows added to
`INTEGRATION_KEYS` on 2026-09-26 are what the owner sets in Admin.

**Shipped this pass:** `packages/ai/src/tryon.ts` (+ exported from `index.ts`) and
`services/tryon/handler_runpod.py`. 16 unit tests in `packages/ai/src/tryon.test.ts`
cover the flag-off shape's prerequisites: `clothTypeForCategory` /
`isUnsupportedTryOnCategory` mapping, not-configured behaviour, the inline-photo
payload, both error layers (RunPod-level vs handler-level), and that
`saveTryOnResultToR2` writes exactly once with the result bytes and never the
wearer's photo (T7's storage assertion). Verified: `@kanchuki/ai` typecheck clean
+ 107/107 tests, `retired-tryon-guard` 8/8, `@kanchuki/api` typecheck clean.

### T3 result (step 2) — 2026-09-26: **route + job built**

`POST /v1/products/:id/try-on` and its `GET .../status` poll now exist, on their
own BullMQ queue (`QUEUES.TRY_ON` → `kanchuki-try-on`, worker concurrency 2).

**Dual identity, per the owner's call (asked and answered 2026-09-26).** The
customer PWA has no Bearer token — only the `kanchuki_passport` cookie — so the
auth plugin cannot hard-401 it. `plugins/auth.ts` now defers **only** the
no-Bearer + passport-cookie case to the route (`isTryOnRoute`, exported and
tested); a request that *does* carry a Bearer still runs the normal flow, so the
staff allowlist and the suspension check still apply to it. Inside the route a
valid Bearer wins (product must belong to that retailer); otherwise an
authenticated shopper may try on any publicly-visible product, and the product
row names the retailer whose quota it spends. `customer_account_id` is read from
the passport session on either path, so a shopper grant spends both counters.

**The launch gate is in the route, server-side, and it is a 404.** With
`VIRTUAL_TRY_ON_V2` off for the plan the route throws `notFound('Product')`
before touching config, quota or media — indistinguishable from a missing
product, so an inspecting client learns nothing. (Not a 403: a 403 confirms the
route exists and is merely locked.)

**The wearer's photo never crosses a serialization boundary.** This was the
non-obvious part. The async-job shape wants the bytes in `job.data`, but BullMQ
serialises that payload into **Redis**, and Redis is persistent storage — the
base64 photo would survive restarts under no retention policy, which is the same
T6 violation as writing it to R2. So the route hands the photo over through a
new in-process store (`apps/api/src/lib/tryon-photo-store.ts`): a one-shot Map
keyed by job id, with a 3-minute TTL and a 256 MB ceiling that answers 503 when
full. The BullMQ payload carries **ids only** — a test asserts that. This works
because the workers run in the API process (`startWorkers()` in `index.ts`); if
a dedicated worker process is ever split out, the job fails loudly
("photo expired"), it does not silently start persisting.

The `TryOnJob` row is the job's status source of truth (PENDING → COMPLETED /
FAILED), because the row already has to exist for the quota/audit trail — unlike
studio-shoot, which keeps live status in Redis. Only the generated image is
written to R2, under `tryon-results/<jobId>/result.jpg`; the status route mints a
per-read presigned URL for it.

**Also cleaned up while here:** `R2_PATHS.tryonInput` / `tryonResult` deleted
from `@kanchuki/shared`. `tryonInput` was the "upload the wearer photo, then
delete it" path T6 forbids — a helper for its R2 key is an invitation to write
it — and both had no callers left. (The `quota.ts` comment that still cited the
deleted `routes/tryon.ts` was already fixed in T2.)

**Verified:** `@kanchuki/api` + `@kanchuki/ai` typecheck clean; route-size guard
passes; **full API suite 1479 passed / 5 skipped**, including the
`retired-tryon-guard` (CatVTON is not on the ban list) and both purge guards. New
tests: `routes/products-tryon.test.ts` (18 — the flag-off 404, the payload has no
image bytes, both quota caps and their distinct codes, both identities, the
store-full 503), `jobs/tryon.test.ts` (7 — the photo reaches `generateTryOn` and
`saveTryOnResultToR2` is the only storage write, called once with the result),
`lib/tryon-photo-store.test.ts` (5 — one-shot take, TTL, sweep), and
`plugins/auth.test.ts` gained the `isTryOnRoute` predicate cases.

**Still needed before this works live:** migrations 118/119 applied in order. (The
GHCR rebuild this line previously named was done the same day — see step 3 below.)

### T3 result (step 3) — 2026-09-26: **worker image rebuilt + pushed; inline path is now in the artifact**

The rebuild this task named as T8's prerequisite is done. Run `36234151071`
(`workflow_dispatch` on `main`, commit `518d1bee`) went green at 10:11:19Z —
17.1 min wall, of which **the push was 10.3 min** (build ~5 min, layer export +
registry write 617.9 s). Both tags landed:

- `ghcr.io/kapisejix/kanchuki-tryon:latest` → index `sha256:1a4dc0bd…`, amd64
  manifest `sha256:50135bcd…`
- `ghcr.io/kapisejix/kanchuki-tryon:518d1bee6fc99da7732f68303b5ae38251bb6c68`

**Verified, not assumed.** A green build proves the image built — it proves
nothing about *what is in it*, so the handler was checked directly:
`git show 518d1bee:services/tryon/handler_runpod.py` contains
`decode_base64_image()` (L161), the `person_image_base64` / `garment_image_base64`
inputs (L285–323) and the paired "… is required" errors (L315/317).
`518d1bee` is `HEAD`. The image is also **publicly pullable** — an anonymous
`ghcr.io/token` for `repository:kapisejix/kanchuki-tryon:pull` returns a 64-char
bearer, and both tags resolve `http=200` under it.

**⚠️ The one thing that will look like "the rebuild didn't take."** RunPod's
template `v76b819nle` was SHA-tagged on 2026-07-10 precisely to force fresh
pulls — i.e. it most likely still names **`688ce1b8…`**, the old image. Nodes
serve their cached layer, so a correct-but-un-re-pointed template behaves exactly
like a failed rebuild: the endpoint still rejects
`person_image_base64` with its own "… is required" error, which is the same
symptom the stale image gives. **Re-point the template's image tag to
`latest` (or `518d1bee…`) before concluding anything about the handler** — this
is the first check in T8 step 2, ahead of the `workersMax` probe.

**The failure this replaced — worth recording, because the diagnosis was
wrong.** The preceding red runs were *two different* faults wearing one coat:

| Symptom | Duration | Real cause |
|---|---|---|
| `Get "https://ghcr.io/v2/": denied: denied` | ~16 s | Invalid token — login itself fails |
| `failed to push …: denied: permission_denied: write_package` | 15–17 min | Token **valid** (login passed, whole image built) but not **authorised** to write the package |

The 15–17 min runs therefore were not a token "dying mid-build" — they built the
entire image and died at the final push, which is why they cost a full build each.
`07-13`'s last green run and the historical greens run 16–21 min, so duration was
never the signal. **Login succeeding is not proof a token can push:** a PAT can
authenticate and still fail `write_package` if it lacks the package scope. The
`GHCR_PAT` refresh at 09:52:11Z fixed both halves; nothing else changed.

**Not done here, and not doable by an agent:** `.github/workflows/docker-tryon.yml`
still has `cache-from` / `cache-to` commented out, so every dispatch pays the full
10-min push. Enabling a registry cache is the obvious 2-line win, but CI/CD config
is a `CLAUDE.md` **NEVER** item — owner applies it.

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

### T4 result — 2026-09-26: **both UIs built, and nothing appears until the flag is flipped**

**What shipped**

| Surface | File |
|---|---|
| Retailer feature list on the profile fetch | `routes/retailers/retailers-profile.ts` → `GET /me` gains `features` via `getEnabledFeatures()` |
| The customer flag | `routes/public/public-products.ts` → `try_on_enabled` on the product-detail payload, derived from the **store's plan** (`hasFeatureForPlan`) |
| Shared type | `packages/shared/src/types/index.ts` → `PublicProductDetail.try_on_enabled?: boolean` |
| Mobile: consent screen | `apps/mobile/src/components/TryOnConsent.tsx` (renders `TRY_ON_CONSENT`) |
| Mobile: the flow | `apps/mobile/app/product/try-on.tsx` — capture → consent → generating → result |
| Mobile: entry point | `apps/mobile/app/product/[id].tsx` — "Try On Customer", shown only when `me.features` includes `VIRTUAL_TRY_ON_V2` |
| Mobile: API | `apps/mobile/src/lib/api/products.ts` — `startTryOn()` (multipart) + `getTryOnStatus()` |
| Web: the flow | `apps/web/src/app/c/[slug]/components/TryOnSheet.tsx` |
| Web: entry point | `ProductDetailSheet.tsx` — button now gated on `detail?.try_on_enabled`, opens the sheet |
| Web: proxies | `app/api/products/[productId]/try-on/route.ts` (POST) + `.../try-on/status/route.ts` (GET) |
| Admin toggle (T5 §1) | `routes/admin/admin-plans.ts` + `admin/plan-features/page.tsx` gain `VIRTUAL_TRY_ON_V2` |

**The gate, end to end.** The API is unchanged (T3/T6 already 404 on the flag and 422 on
missing consent); this task only makes a *client* stop lying about it. The retailer app reads
`features` from the profile fetch it already makes; the customer PWA reads `try_on_enabled` from
the product payload it already fetches. Both are presentation — the route still re-checks
`hasFeature()` server-side, so a hand-crafted request cannot get past the flag. With the flag
`false` for every plan (T1), the button does not exist anywhere the day this merges.

**T5 §1's premise was wrong, and that mattered.** The task text assumed the Plan Feature Matrix
is enum-driven. It is not: the toggle list is hand-written in **two** places that must agree —
the API's `z.enum` in `admin-plans.ts` and the web page's `FeatureKey` union + `FEATURES` array.
`VIRTUAL_TRY_ON_V2` was in neither, so the owner could not have enabled the feature the T4 build
depends on. Both were updated. The lists are already missing `WHATSAPP_CATALOG_SYNC`,
`SHOWCASE_DESIGNS` and `GROWTH_ENGINE`, which is the RC-034 shape (hand-kept copies of one
policy) — a comment now says so at the API list, and the list deliberately stays hand-kept
because the Prisma enum also carries `@deprecated` values that must **not** be toggleable.

**Why the web needs its own proxy, and why it does not reuse the passport one.** The passport
proxy forwards bodies with `request.text()`, which mangles a multipart binary upload (the
boundary and the bytes both die in a UTF-8 round-trip) — and the API requires the shopper's
cookie to resolve the passport session. So the try-on POST streams `request.body` through with
`duplex: 'half'` and forwards the browser's own `Content-Type` plus `cookie`. The status poll is
plain JSON and uses the simple forwarder shape.

**Consent is what satisfies the API's 422.** The UIs send `TRY_ON_CONSENT.version` from
`@kanchuki/shared` on the request itself (the accepting tap, not a separate grant call), which is
the version the API records on the job row. The web sheet does not render the file input until
the consent is accepted — the gate is structural, not a disabled control — and that is the one
new guard in this task.

**The `withdrawn` status is handled in both pollers.** T6 added the terminal `withdrawn` state
(a withdrawn job keeps `status = COMPLETED` but has `result_url` nulled). Both the mobile screen
and the web sheet stop polling on it and show a message rather than spinning forever — the exact
failure the T6 ordering fix existed to prevent, now closed on the client side too.

**Verified:** API **1507 passed / 5 skipped** (was 1503; +4 — `retailers-me-features.test.ts` 2,
`public-products-tryon-flag.test.ts` 2); web **411 passed** (was 407; +4 — `TryOnSheet.test.tsx`
2, two `ProductDetailSheet` arms); mobile **125 passed**. `@kanchuki/{shared,api,web,mobile}`
typecheck clean; route-size guard passes; `/v1/`-fetch guard passes; `biome check src/` clean;
`next lint` + `expo lint` clean. The new consent gate was **falsified** — rendering the capture
step alongside the consent step turns both TryOnSheet tests red, then reverted.

The web `ProductDetailSheet` suite's shared fetch double was switched from a bare `vi.fn(impl)`
to a named `defaultFetchImpl` re-installed in `beforeEach`, because `mockClear()` clears calls but
not an implementation — the new flag test's `mockImplementation` was leaking into the two
existing tests. (A test-only fix for the class of failure, not the instance.)

**Also fixed while here:** `biome check` was red on six of this session's uncommitted T3/T6 files
(formatting + import order, and two `noUnusedTemplateLiteral`s in `products-tryon.test.ts`).
Formatting only; the touched suites re-run green.

**Honest limitations, stated not implied.**

- ~~**No mobile component test for `TryOnConsent`.**~~ **Closed 2026-09-26** — see the T7 result
  below; the mobile gate test exists and was falsified.
- ~~**The web flow assumes a passport session.**~~ **Closed 2026-09-26** — the 401 now routes to a
  purpose-built sign-in step instead of the API's sentence; see the T7 result below.
- **Still open: the 401 on the *status poll*.** If a session lapses mid-run, `poll()` sees a 401,
  finds no `data.status`, and keeps polling every 3s until the sheet closes. Narrow (the POST
  already required a valid session), and it was left out of the 2026-09-26 fix deliberately: the
  job is already generating against the spent quota, so what the shopper should see mid-run is a
  product decision, not a mechanical one.
- **Still open: the retailer app's own 401 wording.** `apps/mobile/app/product/try-on.tsx`
  renders `err.message` verbatim, so a retailer whose bearer has expired reads "Sign in to try on
  this outfit." — a sentence written for a shopper who doesn't exist on that surface. The customer
  side is fixed below; the retailer side wants the analogous treatment (session-expired → re-login)
  and was left alone because it is a different actor and a different remedy.
- **The admin grid still shows the retired `VIRTUAL_TRY_ON` toggle** (relabelled
  "(retired)"). It is a dead row for a removed feature; removing it is a separate cleanup, not
  part of this build.

**Still needed before this is live:** migrations **118 → 119 → 120** applied in order, and the T8
checklist (notice live → endpoint scaled up → template tag re-pointed → flag flipped).

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

### T5 result — 2026-09-26: the premise was wrong twice, and both gaps are closed

**This task was written as "mostly verification, not new build". It was neither —
items 1 and 2 were both real defects, and they were the same defect.**

- **Item 1 — `VIRTUAL_TRY_ON_V2` in the Plan Feature Matrix.** _Done earlier the same day._
  The spec's premise ("the page is enum-driven per existing `PlanFeatureKey` values") is
  **false**: the toggle list is hand-kept in **two** places — the API's `z.enum` in
  `PUT /admin/plan-features` and the web grid's `FEATURES` array. `VIRTUAL_TRY_ON_V2` was in
  neither, so the owner could not have turned this feature on at all. Added to both.
- **Item 2 — `TRY_ON_GENERATION` in Plan Limits.** Same shape, same outcome: the resource list
  was a hand-written union + array in `apps/web/src/app/admin/plan-limits/page.tsx` and a second
  `z.enum` in `PUT /admin/plan-limits`. Migration 119 seeded `plan_limits` rows for all three
  plans, but the value was in neither list, so the grid rendered **no row** for it and the PUT
  **rejected** it (422). The number existed in the database and was unsettable from the UI.

**The fix is one list, not a third guard.** `PLAN_LIMIT_RESOURCE_TYPES` now lives in
`@kanchuki/shared/src/constants/index.ts` and is imported by both the API's `z.enum` and the web
page (which also derives its `ResourceType` union from it). Still hand-kept rather than derived
from the Prisma enum, because that enum also carries `@deprecated` `TRY_ON` (removed in migration
082) which must stay dead — and the two lists answer different questions ("what can be stored"
vs "what may an admin name"). A test reads `schema.prisma` and asserts every entry is a real
`QuotaResourceType` value, so a typo cannot ship a value the column rejects at write time.

**Item 3 — the customer limit editor.** Built as a third card on the existing
`/admin/plan-limits` page (no new page), backed by two new routes:

| Route | Behaviour |
|---|---|
| `GET /v1/admin/plan-limits/customer` | One entry per customer-side resource **whether or not a row exists** (`configured:false`, null limit) — a `findMany` alone returns only existing rows, which is exactly how the seeded try-on row sat invisible. The screen renders this list, so it holds no copy of the resource names. |
| `PUT /v1/admin/plan-limits/customer` | Upsert + audit row (`CustomerResourceLimit`, before/after, `updated_by_id`). `resource_type` validated against the customer allowlist (`CUSTOMER_LIMIT_RESOURCE_TYPES`, one value) so a plan-only resource can't create a row nothing reads. |

**Access classification was the reason the paths nest.** `plan-limits` is in
`SUPER_ADMIN_ONLY_ADMIN_SEGMENTS` (money), and `admin-access.test.ts` derives the segment set from
the route sources, failing on any unclassified segment. A new top-level `/admin/customer-limits`
would have been a fresh classification decision for a plain-ADMIN-reachable quota route (the
RC-034 fail-open); nesting keeps the first path segment `plan-limits`, so the new endpoints inherit
the existing Super-Admin rule with no new decision. Guard confirmed green.

**Tests** — `apps/api/src/routes/admin/admin-plans.test.ts` (10): the shared-list membership, the
PUT **accepting** the value (not just the array containing it), every entry being a real enum
value, the web page keeping no local copy (source scan), GET including an unset resource, GET
returning a stored value, PUT create/update audit (before ≠ after), PUT refusing a plan-only
resource, and `-1` accepted / `-2` refused.

**Falsified — three mutations, each recorded with what caught it:**

1. GET filtered to configured rows only (`filter((r) => byType.has(r))`) → "returns an entry for an
   UNSET resource" red (`expected [] to have a length of 1`). The *stored-value* test stayed green,
   which is precisely why the unset case is the load-bearing one.
2. `TRY_ON_GENERATION` removed from the shared list (with a `@kanchuki/shared` rebuild) → the
   membership test red **and** the PUT test red with `expected 422 not to be 422` — the shipped
   defect reproduced exactly.
3. The web page's local `const RESOURCE_TYPES: ResourceType[] = [...]` re-introduced → red.
   **This one caught a defect in the guard itself:** the first pattern
   (`/const RESOURCE_TYPES\s*[:=]\s*\[/`) walked straight past the annotated form
   (`ResourceType[]` sits between the `:` and the `[`) and left the test **green** while the copy
   was back. Tightened to match the annotation; re-measured red, then reverted.

**One defect found in the test double, worth recording:** the prisma stand-in's `findUnique`
returned the live stored object, so the route's `prev` **aliased the row `upsert` then mutated** and
the audit row reported the NEW value as the OLD one (`before.limit_per_period === 1` where the real
answer is 5). That is RC-037's shape — *the double agreed with the code, not with the platform*
(production reading is two separate round trips, so Prisma materialises a fresh object each time).
The stand-in now returns detached copies; the test is green for the real reason.

**Verified:** API **1517** passed (was 1507), web **414**; `@kanchuki/{shared,api,web}` typecheck,
`biome check`, `next lint`, route-size guard, and `admin-access`/`security` suites all clean. No new
admin path segment was introduced, so no access-list edit was required.

**Addendum (same day) — the card's render test, which the first pass left out.** Verification above
covered the API contract and the list derivation, but nothing *rendered* the new card, so a screen
that stopped drawing rows would have gone unnoticed.
`apps/web/src/app/admin/plan-limits/__tests__/page.test.tsx` (3) now drives it from the response:
a row per returned row carrying that row's number and period, an unconfigured row blank and marked
`not set`, and the empty state.

- The first test's second row is `A_RESOURCE_THIS_APP_DOES_NOT_SHIP` — a type no list in this repo
  contains. That is the assertion that the row set comes from the response, and the live property
  behind it: **falsified** by filtering `customerData` through the page's own `RESOURCE_TYPES`, the
  T5 defect's exact shape. The off-list row vanished; the `TRY_ON_GENERATION` assertions stayed
  green, so the off-list row is the load-bearing one — the same lesson as the GET's unset case.
- The blank test is **falsified** by `String(row.limit_per_period ?? 0)` (`expected … to have value
  null`). Worth recording: the naive mutation, `String(row.limit_per_period)`, does **not** turn it
  red — a number input rejects the literal `"null"` and reads back empty, so the DOM hides that bug
  rather than showing it. Only the `0` mutation is detectable, and `0` is the one that actually
  means "no shopper may generate" (a missing row fails `checkQuota()` open).

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

### T6 result — 2026-09-26: **built; the gate now refuses a try-on that carries no consent**

Two owner decisions were taken first, because both are audit-trail shaped and
awkward to change after the fact:

1. **Where the in-store consent is recorded → on `try_on_jobs`.**
   `consent_events.customer_account_id` is **NOT NULL**, so `ConsentEvent`
   *structurally cannot* hold the walk-in case — a retailer photographing a
   customer who has no account. Making that column nullable would rewrite an
   existing passport table's contract for one caller; a third consent table would
   be a third mechanism. The job row is already the record of that generation, so
   the consent rides on it, **and** a `ConsentEvent` is still written when an
   account does exist (so the passport pattern stays intact for shoppers).
2. **Granularity → once per customer, with withdrawal.** A shopper's grant is
   remembered; a walk-in re-consents per generation because there is no account
   to remember it against.

**What shipped**

| Piece | File |
|---|---|
| Consent columns on the job | `schema.prisma` (`consent_at`, `consent_notice_version`, `consent_method`, `consent_withdrawn_at`) + **migration `120_try_on_consent`** |
| The consent copy, one source of truth | `packages/shared/src/tryon-consent.ts` (`TRY_ON_CONSENT`) — exported, so both UIs render the same text the API records a version for |
| Purpose-consent registry | `apps/api/src/lib/notice-versions.ts` (`PURPOSE_CONSENTS`, `isCurrentTryOnConsent`) |
| Consent state + withdrawal | `apps/api/src/lib/tryon-consent.ts` |
| The server-side gate | `apps/api/src/routes/products/products-tryon.ts` step 4 |
| Withdrawal API | `apps/api/src/routes/public/passport/passport-tryon.ts` (`GET /try-on/consent`, `POST /try-on/withdraw`) + the web proxy allowlist |
| The customer notice | `apps/web/src/app/privacy/page.tsx` (`#virtual-try-on`) + guard test |
| The rules of record | `docs/SECURITY.md` **§3d** (new) |

**The gate is server-side, and tested as such.** No `?consent_version=`, or a
version that is not the current one → **422** before quota, before the photo is
read, before anything is enqueued. A remembered passport grant skips the field.
A UI-only checkbox would not be a control (a client can call the API directly),
which is the same reasoning that made the launch flag a 404 in T3.

**A real bug fell out of building the withdrawal half.** `GET .../status` had:

```ts
if (job.status === 'COMPLETED' && job.result_url) { → ready }
if (job.status === 'FAILED')                    { → failed }
return { status: 'processing' }                 // ← catch-all
```

Withdrawal leaves `status = COMPLETED` but **nulls `result_url`**, so the first
arm would not match and the request fell through to the catch-all: a poller
would report `processing` **forever** for an image that had been deliberately
deleted on request. Fixed by checking `consent_withdrawn_at` **before** the
COMPLETED arm and returning a distinct `withdrawn` status — the order is the fix,
not the branch. Pinned by a test that asserts `withdrawn` and that no presigned
URL is minted.

**Why migration 120 rather than editing 119.** 119 was still unapplied, which
makes an edit tempting, but rewriting a file some local database may already have
applied surfaces as a `_prisma_migrations` checksum mismatch instead of a clear
error. A forward migration costs one numbered file and cannot be wrong that way.

**A trap this deliberately avoided.** `getCurrentNoticeVersion()` returns the
**last key** of `NOTICE_VERSIONS`, so appending the try-on notice to that object
would have made it the `notice_version` recorded on **every passport
`ConsentEvent` write** — the passport would have started claiming shoppers agreed
to try-on text. Hence a separate `PURPOSE_CONSENTS` registry. (The last-key
derivation is itself fragile — nothing stops a future appended notice from doing
exactly that — but it is out of T6's scope to re-architect; noted here so the
next person to add a notice knows.)

**~~Known gap, stated not implied~~ — closed later the same day.** A withdrawal
whose R2 delete **fails** leaves `result_url` in place on purpose (it is the only
pointer to an object we still owe that person a delete for) and returns
`images_failed > 0`. That retry now exists (`jobs/tryon-deletion-sweep.ts`,
hourly) — and building it turned up a second hole T6 had not noticed, in the job
rather than in the withdrawal. See the latest dated result at the end of this
doc.

**Honest limitation:** T6 built the gate, the copy and the record — **not the
screens**. No UI renders `TRY_ON_CONSENT` yet, because that is T4 and its shape
is unbuilt. This is why the API demanding `?consent_version=` is safe to merge
with the flag off: nothing calls the route today, and the flag is `false` for
every plan.

**Verified:** API **1503 passed / 5 skipped** (was 1479; +24 = route consent arms
7, `lib/tryon-consent.test.ts` 11, `passport-tryon.test.ts` 6); web **407 passed**
(was 402; the 5 new privacy arms). `@kanchuki/{shared,api,web,db}` typecheck all
clean; route-size guard passes. The new privacy anchor arm was **falsified** —
renaming the section id turns exactly one test red.

**One test-only fix worth knowing about:** `routes/products.test.ts` mocked
`@kanchuki/shared` as a hand-written `{ R2_PATHS, SIZE_OPTIONS }`, so the day
anything in the import graph read a third export at module load (here
`TRY_ON_CONSENT`, via `notice-versions.ts`) the suite died in *collection* with an
error naming a file it does not import. Changed to spread `importOriginal()` and
override only those two keys — the class of failure, not the instance.

**Still needed before this is live:** migrations **118 → 119 → 120** applied in
that order, and T4 rendering the consent screen (which is what sends the version).

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

> **Already landed, don't duplicate:** all four above were built in T3, and the
> consent half in T6 — `routes/products-tryon.test.ts` (25), `jobs/tryon.test.ts`
> (7), `lib/tryon-photo-store.test.ts` (5), `lib/tryon-consent.test.ts` (11),
> `routes/public/__tests__/passport-tryon.test.ts` (6). What T7 still adds is
> whatever T4's screens need (a component test that the consent screen blocks
> capture), which cannot be written before T4 exists.

**T7 result — 2026-09-26 (the T4-dependent half):** the consent-blocks-capture
component test now exists on **both** surfaces.

- **Web** — `apps/web/src/app/c/[slug]/components/__tests__/TryOnSheet.test.tsx`
  (2 tests): asserts `TRY_ON_CONSENT`'s copy renders from `@kanchuki/shared`,
  that `try-on-selfie-input` is **absent** while consent is up, and that it
  appears only after accept.
- **Mobile** — `apps/mobile/__tests__/product/try-on-consent-gate.test.tsx`
  (2 tests): the flow is inverted (the walk-in photo is taken first), so the
  guard is the reverse — the shutter (`Take the customer's photo`) and gallery
  (`Choose a photo from the gallery`) pressables must both be **gone** the
  moment consent is on screen. Drives gallery → consent through the real
  screen (mocked picker/permission), so it exercises the actual transition, not
  a hand-set state. The second test asserts the request carries
  `TRY_ON_CONSENT.version` — the API 422s without it, so this is the assertion
  that the consent screen is what satisfies the gate.
- **Falsified** (both): web — renaming the notice anchor turned 1 test red;
  mobile — dropping the `step === 'capture'` guard around the capture block
  turned the gate assertion red (`expected { nodeType: 'component' } to be
  undefined`), then reverted. A guard that cannot fail reads exactly like one
  that passed (RC-043).
- Suites after: mobile **127** passed (was 125).

**T7 result — 2026-09-26 (later, the signed-out case):** the customer sheet's 401 no longer
surfaces the API's message.

- **Why it was wrong.** The API's only 401 on this route is `UNAUTHORIZED` — "no passport
  session", raised in `resolveTryOnContext` before quota or storage is reached. The sheet was
  printing that sentence inside its generic `result` step, which reads as a *failure report* and
  leaves the shopper with nothing to do. It isn't a failure; it's a missing account.
- **What changed** (`apps/web/src/app/c/[slug]/components/TryOnSheet.tsx`): a new `signin` step.
  `res.status === 401` is checked **before** the `!res.ok` branch — deliberately, because `!res.ok`
  would also catch it, and `error.message` would then render the exact sentence this step exists to
  replace. The step states *why* an account is needed (the picture stays private and is yours to
  withdraw) and offers one control that resolves it: an anchor to
  `/login?return_to=<this page>`, run through `sanitizeReturnTo` even though the value is our own
  `location` — that module is the single place the open-redirect decision is made, and it fails
  closed. A plain anchor, not a client-side push: logging in mints a new session, so the return
  trip should be a fresh document that re-reads it. Plus a "Not now" that closes the sheet.
- **Deliberately not done:** no second OTP form in the sheet (`/login` already carries the
  widget-then-API fallback and the resend/retry pairing — one copy of that dance is the point). The
  status-poll 401 was left open here and closed later the same day — see the latest T7 result.
- **Tests** (`__tests__/TryOnSheet.test.tsx`, 5 total, +3): the prompt renders and the API's
  message is absent (and the generic `Something went wrong.` step was never reached); the link's
  `href` carries this page as `return_to` (a wrong target drops the shopper somewhere arbitrary
  after the OTP, so the destination is asserted, not just the link); "Not now" calls `onClose`.
- **Falsified:** removing the `res.status === 401` arm folded the case back into the generic error
  branch and turned **all three** red (`Unable to find an element with the text: Sign in to try
  this on`, `…[data-testid="try-on-signin"]`, `…Not now`), then reverted.
- Suites after: web **414** passed (was 411); `tsc --noEmit`, `next lint`, mobile **127**,
  route-size guard all clean.

**T7 result — 2026-09-26 (latest): the status-poll 401, and a correction to the claim recorded
immediately above.** The limitation left in the signed-out pass ("the status-poll 401 is
untouched") is closed — and closing it showed that the comment I had written about *how* it closed
was wrong.

- **What changed** (`TryOnSheet.tsx`, in `poll()`): the same 401 the POST arm handles now ends the
  status poll too — `setStep('signin')` and return, before the JSON parse, so no branch can be
  reached with `status === undefined`. Without it the tick fell through to the `setTimeout` at its
  bottom and re-read every 3s for as long as the sheet stayed open: a spinner that can never
  resolve, because the API returns no `data.status` for a 401.
- **The correction.** The comment (and the test's) claimed the load-bearing half was setting
  `stoppedRef.current = true` before returning, because "a bare `return` here would fall through to
  the `setTimeout` at the bottom of the tick". That is false: `return` leaves `tick`, so the bottom
  re-arm is never reached. Removing the flag changes nothing — probed, the request count stayed at
  2 — and the flag is **not** in that branch. `stoppedRef` guards the *other* way a poll dies: a
  tick already in flight when the sheet closes. Comments corrected in both files; the code was
  already right.
- **Falsified:** deleting the 401 arm outright (the real defect) turns the poll test red. The
  spinner assertion fires first, and a probe carrying only the count assertion measured **2 → 3**,
  so `toHaveBeenCalledTimes(2)` does catch it. Under fake timers the re-arm lands *once*, not
  twelve times: the next `setTimeout` is scheduled from an async continuation, which runs after
  `advanceTimersByTime` has already finished, putting it outside the window. Two claims, two
  mutations, only one of them falsifiable — which is why it was measured rather than asserted.
- Suites after: web **418** passed (was 414: +3 card, +1 poll); mobile **127**; `tsc --noEmit`,
  `next lint`, route-size guard all clean.

**2026-09-26 (latest) — three follow-ups: the retailer's 401 copy, the withdrawal's two holes, and
the customer card's save path.**

**1. The mobile screen no longer quotes a sentence written for a shopper.** On a 401 the retailer
app rendered `err.message` verbatim. The arm is keyed on the **status**, not the message, because
the API words a 401 three ways — `Missing Bearer token` and `Invalid or expired token` from the auth
plugin, plus the route's own `Sign in to try on this outfit.`, which is addressed to a shopper on the
customer PWA and is nonsense on a retailer's phone. All three mean one thing there: the store's
session is gone. No fix button is offered, because `client.ts` has already spent its single refresh
and, failing that, is routing to `/auth/phone`; the screen only has to say what happened without
quoting the server. **Falsified:** making the arm miss (so a 401 falls to the generic branch) turns
the new assertion red, and the failure output reproduces the old behaviour — the API sentence on
screen.
- Adjacent, deliberately not changed: the mobile **status-poll** 401 is still swallowed by the
  poller's `catch { return false }`. That is survivable here in a way it was not on web —
  `pollWithBackoff` caps at 60 attempts and the same global 401 handler is already navigating away.
  Recorded rather than silently fixed.

**2. The withdrawal gap had two halves, and the worse one was not the one this doc knew about.**
The T6 note only covered the failed-delete retry. Reading the job for it found the other half, so
both are closed:

- **The result could be written *after* the withdrawal swept.** `handleTryOn` ended with an
  unconditional `update({ status: 'COMPLETED', result_url })`. A withdrawal can land at any moment
  during the 35–45s the GPU call takes, and it deletes every `result_url` it can see — so a key
  written after that sweep is a stored photograph of someone who withdrew, on a row no reader will
  ever consult again (the status route answers `withdrawn` before it looks at anything else). The
  completion is now an `updateMany` with `consent_withdrawn_at: null` in the WHERE, making the check
  and the write one statement so there is no window between them; `count === 0` means the withdrawal
  won, and the key just written is deleted in the same run. Quota still increments on that path,
  deliberately: the GPU ran regardless, and skipping the store's increment would make
  withdraw-and-regenerate free — reachable from the UI, since a shopper may re-grant.
- **The retry now exists.** `apps/api/src/jobs/tryon-deletion-sweep.ts`, hourly at :15 on the
  maintenance queue. It keys on the *state* (`consent_withdrawn_at != null AND result_url != null`)
  rather than on an error code, which is what makes it the retry path for both halves — a failed
  withdrawal delete and a result written just after the sweep look identical from the row. It never
  touches an image whose owner is still consented, clears only the pointer (never
  `consent_withdrawn_at`, which is the audit record), leaves the key on a failed delete so the next
  run can still find the object, and drains oldest-first in batches of 100. No index on the
  predicate, on purpose, with the reasoning recorded in the file.
- **Falsified, two mutations:** dropping `consent_withdrawn_at` from the sweep's WHERE turns exactly
  the predicate test red — that is the safety property, an image whose owner is still consented must
  be unreachable by this job; disabling the job's cleanup branch turns exactly the two withdrawal
  tests red and leaves the metering test green, which is correct, because metering never depended on
  the delete.

**3. The customer card's save path is covered, and testing it exposed a dead write.** The test PUTs
  the edited number and then asserts what the server stored. That second half needed a fix first: the
  field renders from `customerCells`, not from `customerRows`, so the value the API returned was
  written into state nothing displayed — a number the server normalised would keep showing exactly
  what was typed, quietly misreporting the cap in force. The cell is now re-seeded from the response.
  **Falsified:** making that re-seed miss the row's key (so the response reaches no field) turns
  `expect(input).toHaveValue(50)` red while the rest of the file stays green. Two more arms: a blank
  field refuses to PUT rather than sending a zero cap, and a rejected save leaves the row unset
  rather than reading as saved.

**Verified:** API **1525 passed / 5 skipped** (was 1517; +8 = 3 job, 5 sweep); web **421** (was 418;
+3 save); mobile **128** (was 127; +1 message). `@kanchuki/api` and `@kanchuki/web` and mobile
`tsc --noEmit`, `biome check src/jobs/`, `next lint`, `expo lint`, route-size guard — all clean.

**Owed at commit time — ✅ done in the next pass (see below):** the `RC-###` entry for the two
withdrawal holes plus its CLAUDE.md tracker row. That pass landed both (`RC-044`), and the owner had
asked for it explicitly, which is the approval the ops policy requires for a CLAUDE.md edit.

---

### T7 result — 2026-09-26 (later still): the mobile poll 401, `RC-044`, the runbook, and a re-run

The items the previous pass left as "owed" or "deliberately not done" are closed. Full detail in
`docs/runbooks/tryon-launch-owner-steps.md` (the owner half) and `RC-044` (the code half).

**1. The mobile status-poll 401 is handled — it was the last code item.** The previous pass recorded
this as deliberately left, on the reasoning that `pollWithBackoff` caps at 60 attempts and the global
401 handler already navigates to `/auth/phone`. That is survivable but it is still ~14 minutes of a
retailer watching a spinner behind their own navigation, and the web sheet was fixed the same way for
the same reason. `apps/mobile/app/product/try-on.tsx`'s `onPoll` catch now keys on
`err.status === 401` **before** the transient branch: it sets a terminal message, moves to `result`,
and returns `true` so the poller stops. Keyed on the status, never quoting the message — the API
words a 401 three different ways and one of them is written for a shopper.

- **Falsified, two mutations, each red on exactly its own assertion and restored:** (1) deleting the
  401 arm (back to the generic catch) turns the *stops-the-poller* test red; (2) leaving the arm in
  but making the transient branch `return true` turns the *keeps-polling-a-transient-failure* test
  red with `expected true to be false`. The two arms are separate on purpose: one guards the terminal
  decision, the other guards that a genuinely transient failure is still retried.
- **Deliberately unchanged:** quota still meters a mid-run withdrawal (the GPU ran), and the mobile
  screen still offers no sign-in button on 401 — `client.ts` has already spent its refresh and is
  routing to `/auth/phone`, so a second control would race it.

**2. `RC-044` records the two withdrawal holes, and finding it exposed a stale doc.** The entry covers
both halves as one root cause (the pointer and the promise were the same column, and nothing swept
the state where they disagree). Adding it, the tracker-table invariant was checked with the two
commands in `docs/root-cause/README.md` — both print nothing, and the set is contiguous
`RC-001…RC-044`. **That check found the README itself stale:** its "RC IDs referenced in commits but
NOT in the tracker yet" section still listed `RC-028…RC-038` as unwritten, on the reasoning that
their branches were unmerged. Every one of those branches has since merged (verified with
`git merge-base --is-ancestor`), all eleven entries and rows exist, and the list had gone on saying
otherwise. It is now corrected, keeping the durable lesson instead of the stale table: *an "owed"
list nothing re-derives is the RC-043 failure shape applied to the tracker about the tracker.*

**3. The owner steps are now a runbook** — `docs/runbooks/tryon-launch-owner-steps.md`, with the exact
RunPod v2 calls (verified against the current API docs rather than remembered) for re-pointing the
template and scaling the endpoint, the order-of-operations gate for the notice, the flag flip, the
quota numbers, and the smoke test. Two findings from writing it:

- **The legal gate is NOT live.** `https://kanchuki.app/privacy` still renders the **September 24**
  revision, so the new notice is committed but undeployed. That makes the correct launch order
  *merge → deploy → confirm the page → flip the flag*, and it means nothing may be enabled before
  this branch ships. Recorded in the runbook as a hard ordering constraint rather than a step.
- **The Plan Feature Matrix toggle only became settable in this branch.** `VIRTUAL_TRY_ON_V2` was
  missing from both hand-kept lists (T5), so Part 5 of the runbook would have been impossible before
  it — worth stating in a runbook whose step 5 is "flip it".

**4. The regression checklist was re-run, and the customer e2e suite is red on `main` — not from this
feature.** `docs/root-cause/README.md`'s auto rows: API **1525 passed / 5 skipped**, web **421**
(16 consecutive green runs), mobile **130 passed**, shared build, route-size guard, `tsc`
(api/web/mobile), `biome check src/`, `next lint`, `expo lint` — all clean. The customer e2e run:
**28 passed / 4 failed**, and the four are pre-existing:

| Failing spec | Console error |
|---|---|
| `customer-my-stores.spec.ts` profile page (phone + tablet) | 404 on `/v1/public/passport/preferences` and `/v1/public/attributes?kind=STYLE` |
| `customer-collection.spec.ts` product sheet (phone + tablet) | 404 on `/api/passport/events` |

**Proven pre-existing rather than asserted:** the failing callers all exist unchanged at `HEAD`
(`git show HEAD:` on each page), **no** file involved (the pages, `lib/passport-client.ts`, or the e2e
support files) is touched by this branch, and the e2e **stub API** simply does not implement those
three upstream routes — so the passport proxy forwards a genuine stub-404. The e2e's ignore list
excuses only `/api/passport/(me|stores)`. **The two checklist rows that matter are green:** RC-019's
offline/service-worker spec ✓ and RC-024's store-directory specs ✓. The fix is to serve those three
routes from the stub (an ignore-list entry would hide the next real bug, which that file's own comment
warns about) and it belongs in its own change.

**5. All of F-039 Phase 2 is now committed** — see the commit message for the `RC-044` reference.

**Owed and still open, as of this entry:** only the owner's T8 steps below. Nothing in the working
tree is uncommitted.

---

## T8 — Launch checklist (owner-only, no code)

**Skill:** `agent-skills:shipping-and-launch`
**Runbook:** the steps below are now a full, copy-pasteable document —
`docs/runbooks/tryon-launch-owner-steps.md` (exact RunPod v2 calls, ordering gates, smoke test,
rollback). This section stays as the index; the runbook is the procedure.

1. Confirm T6's notice-text update is live (legal gate, not optional). — **verified 2026-09-26: NOT
   live** (the page still shows 24-Sept). It goes live when this branch merges and deploys, so this
   step is now an ordering constraint: deploy *before* flipping the flag.
2. Confirm RunPod endpoint scaled up (`workersMax > 0`) — it may have been
   scaled to zero since the 2026-08-31 removal. **Plus:** re-point the template
   `v76b819nle`, still SHA-pinned to a July commit, so the endpoint runs pre-consent worker code.
3. Flip `VIRTUAL_TRY_ON_V2` to enabled for the chosen plan(s) in Admin → Plan
   Feature Matrix. This alone makes it appear on mobile + customer web — no
   redeploy, matching the owner's original ask. Start with one plan and smoke-test.
4. Set the real retailer-per-plan numbers and the customer number in the two
   admin screens from T5 (the T1 seed values are placeholders). Blank means *no limit*;
   a literal `0` means *nobody may generate* — they are not the same field state.
5. Re-run the pre-production regression checklist (`docs/root-cause/README.md`)
   before flipping the flag on a live plan. — **re-run 2026-09-26:** all auto rows clean; the
   customer e2e suite carries 4 pre-existing stub-404 failures unrelated to this feature (see T7
   above). Re-check them before launch so they are not mistaken for a try-on regression.
6. Apply migrations **118 → 119 → 120** in that order — ✅ **done 2026-09-26** (owner; confirmed).

---

## Not doing (this phase)

Any UI/API change that shows the feature before T8 runs. Reusing the deprecated
`TRY_ON` / `VIRTUAL_TRY_ON` enum values. Storing the input/wearer photo under any
circumstance. A single global limit shared between retailer and customer quotas —
they are two separate, separately admin-editable numbers by design.
