# F-039 Phase 2 — CatVTON-on-RunPod Try-On, Admin-Gated Launch + Dual Quota

**Status:** 🔴 Planned — owner go-ahead given 2026-09-26 to **build now, launch later**.
**T0 ✅ RESOLVED 2026-09-26 — endpoint alive, GHCR image pullable; worker readiness (`workersMax`) still needs the owner's RunPod API key (see T0 result below).**
**T1 ✅ + T2 ✅ 2026-09-26 — schema + customer quota built (migrations 118/119 PROPOSED, not applied), `quota.test.ts` 10/10.**
**T3 ✅ code-complete 2026-09-26 — client (`packages/ai/src/tryon.ts` + inline-photo worker input) AND the `POST /v1/products/:id/try-on` route + job. The worker image still needs a rebuild before the inline path is live, and migrations 118/119 must be applied at runtime — see the T3 results below.**
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

**Still needed before this works live:** the GHCR image rebuild (T3 step 1's
`person_image_base64` handler change) and migrations 118/119 applied in order.

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
