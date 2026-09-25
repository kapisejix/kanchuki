# §7A.5 — Load-test script handoff

**Branch:** `fix/post-referral-cleanup-and-launch`
**Status:** 🟨 **In progress — code written, nothing committed yet.**
**Last commit on this branch:** `d284826a` (docs: §7A.7 pre-production re-test of every RC-###)
**Board item:** `docs/tasks/pending/post-referral-cleanup-and-launch.md` → §7A.5

> **Renewed prompt for a new session is at the bottom of this file** (§7).

---

## 1. What §7A.5 asked for

> `- [ ] **7A.5** Load-test script against **staging** (`docs/SCALING.md` §5); owner runs it.`

`docs/SCALING.md` §5 says, verbatim:

> **Load test:** simulate realistic mix — retailer photo uploads (write-heavy), collection-link
> views (read-heavy, public/anonymous), AI search queries. Tools: k6 or Artillery against a
> staging Supabase branch, not prod.

§5 also notes the existing `security.test.ts` / `admin.login.test.ts` suites are **not** a
substitute for a load-driven pen test, and CLAUDE.md rules 8/9 keep those running on every
auth/checkout change regardless.

---

## 2. What has been built (on disk, uncommitted)

| Path | Status | What it is |
|---|---|---|
| `scripts/load/k6/mix.js` | ✅ written | **Pure** scenario definition — no `k6/*` imports. Holds the base-URL safety rule, the rate cap, the weighted routes, and the path builders. Pure so the guard test (Node/vitest) can execute the same logic k6 does. |
| `scripts/load/k6/storefront.js` | ✅ written | k6 entrypoint for the **anonymous, read-heavy** mix (28% storefront · 20% product grid · 15% product detail · 12% categories · 10% related · 8% directory · 7% collection-`view` write). Resolves real slugs/product ids from staging in `setup()`. |
| `scripts/load/k6/retailer.js` | ✅ written | k6 entrypoint for the **authenticated** mix (35% product list · 25% `GET /retailers/me` · 20% `GET /categories` · 20% `POST /products/upload-url` presign). Requires `LOADTEST_BEARER`; fails immediately without it. |
| `apps/api/src/routes/load-test.test.ts` | ✅ written, **54/54 passing** | The guard. Derives the route table from the API sources and asserts the mixes only touch routes that exist, plus the rate cap, the prod deny-list, and the spend exclusions. |

### Verified so far

| Check | Result |
|---|---|
| `vitest run src/routes/load-test.test.ts` | **54 passed / 54** |
| `tsc --noEmit` (`apps/api`) | ❌ **1 error** — see §4.1 |
| Full API suite | ⏳ not re-run since these files were added |
| Guard falsification | ⏳ **not done yet** (see §4.2) |

---

## 3. Findings that shaped the design (each re-checkable in the repo)

1. **The API's global rate limiter is the real ceiling, and it is not configurable.**
   `apps/api/src/index.ts:132` registers `@fastify/rate-limit` with `global: true, max: 200,
   timeWindow: '1 minute'`, keyed on `request.ip` — a literal, no env override. Public routes are
   **not** exempt (only `public/staff-invite.ts` sets tighter per-route limits).
   → One load generator is one IP, so **every** endpoint shares a 200 req/min budget. The script
   caps itself at **180/min** (`SAFE_RATE_PER_MINUTE`) and `parseRate()` **throws** above it rather
   than documenting the limit and hoping. A 429 is counted as `rate_limited` (threshold
   `count<1`) and excluded from `http_req_failed`, so a limiter-bound run cannot be misread as a
   broken API. **Consequence for the owner:** measuring real concurrency needs either (a) an
   env-overridable limiter on staging — a code change to a security control, deliberately **not**
   made, or (b) generators on several IPs. Recorded as an owner decision, not silently worked
   around.
2. **The API never sees photo bytes.** `POST /v1/products/upload-url` presigns; the phone PUTs
   straight to R2. So "write-heavy photo uploads" in §5 is, on the API side, that presign — which
   is why it carries 20% of the retailer mix at zero external cost.
3. **`POST /v1/products` buys a Vision model call on every request.**
   `apps/api/src/routes/products/products-crud.ts` calls `addTaggingJob()` **unconditionally**
   after create. A scripted create mix would spend money per iteration, so the create route is
   **banned by the guard test by exact shape** (`POST /v1/products`), not just omitted.
4. **`POST /v1/public/search` embeds every query.** `public-search.ts` calls
   `embedSearchQuery()` → `generateEmbedding()` (OpenAI, **no cache** —
   `packages/ai/src/embedder.ts`). Search is therefore the one *read* path that bills per request
   and whose p95 is dominated by a third-party call. It is **opt-in** (`LOADTEST_SEARCH=1`) and
   excluded from the default mix.
5. **Production is refused with no override.** `PROD_HOSTS = ['kanchuki.app', 'kanchuki.com']`
   (from `docs/DEPLOY.md`), matched on hostname + subdomain, so `api.kanchuki.app` is caught but
   `kanchuki.app.evil.example` is not falsely blocked. There is deliberately **no
   `LOADTEST_ALLOW_PROD` flag** — an escape hatch on a load test is one typo from a traffic spike
   against live retailers.
6. **Fastify treats `/v1/products` and `/v1/products/` as the same route** (verified with a local
   probe), so the trailing-slash difference between `products-crud.ts` (`'/'`) and the mobile
   client (`/v1/products`) is not a 404 trap.
7. **Auth is `Authorization: Bearer <supabase access token>`**, not a cookie
   (`apps/api/src/plugins/auth.ts:273`). The token comes from `POST /v1/auth/otp/verify`
   (`apps/api/src/routes/auth.ts` — returns `access_token`). §7A.3's `REVIEW_PHONE`/`REVIEW_OTP`
   bypass is how a token can be minted on staging without SMS.
8. **k6 over Artillery.** k6 is named first in §5, needs no dependency inside the pnpm workspace
   (single binary; the runbook should also give a Docker path so nothing has to be installed),
   and has a real VU/arrival-rate model and threshold semantics. Artillery would add and lock a
   package in the repo for less capability. **Neither is installed on this machine** — see §4.3.

---

## 4. What is left to do

### 4.1 Fix one typecheck error (blocker for the commit)

```
src/routes/load-test.test.ts(369,55): error TS2532: Object is possibly 'undefined'.
```

Line 369 is:

```ts
expect(mix.chooseEndpoint(-1, entries).name).toBe(entries[entries.length - 1].name);
```

`entries[...]` is possibly `undefined` under `noUncheckedIndexedAccess`. Fix by hoisting the
expected name with a non-null assertion or a `const last = entries.at(-1)?.name` + `expect(last)`
guard first. **Nothing else in the file fails tsc** (the `@ts-expect-error` import of the plain-JS
`mix.js` is accepted).

### 4.2 Falsify the guard, then restore

The repo's standard is that a guard must be shown to fail for the right reason:

- rename a route in `apps/api/src/routes/public/public-stores.ts` (e.g. `/stores` → `/store-list`)
  → the "is a registered route" arm must go red naming the missing path;
- set `SAFE_RATE_PER_MINUTE = 300` in `mix.js` → the rate arms must go red;
- add `POST /v1/products` to `buildRetailerMix()` → the create-route arm must go red;
- remove the `collectionSlugs.length > 0` guard → the `/null/view` arm must go red.

Record the observed red, then restore. No new `RC-###` is expected (nothing shipped was broken);
if falsification finds a guard that is green for the wrong reason, that **is** an RC.

### 4.3 Write the runbook — `docs/SCALING.md (Load Testing section)`

Not yet created. It must contain, at minimum:

- **Prereqs:** k6 v0.50+ (`http.expectedStatuses`) — install lines for winget / choco / brew, plus
  a Docker path (`grafana/k6`) so nothing has to be installed; or `k6 inspect <script>` to
  validate without running.
- **Getting the bearer token** for `retailer.js` (§7A.3's bypass on staging, or a real login).
- **Exact commands** for both scripts, with the env matrix:
  `LOADTEST_BASE_URL` (required) · `LOADTEST_RATE` (default 180, hard-capped) ·
  `LOADTEST_DURATION` (default `3m`) · `LOADTEST_SEARCH=1` (opt-in, costs an embedding call per
  request) · `LOADTEST_BEARER` (required by `retailer.js`).
- **The 200/min-per-IP constraint**, in plain language, with the two options for going beyond it
  and the statement that the limiter is **not** env-configurable today.
- **How to read the results:** per-endpoint `http_req_duration{endpoint:…}` tags, `rate_limited`,
  and the rule that a non-zero `rate_limited` invalidates the run rather than indicating an API
  problem.
- **Safety rails:** production is refused; the two scripts must **not** run concurrently against
  one host (shared IP budget); nothing is ever uploaded to R2 and no product is created.
- **What is deliberately not measured:** `POST /v1/products` (Vision spend per request),
  `retag` / `studio-shoot` / `detect-color` / `pro-cleanup` (model calls or heavy CPU), and the
  passport/OTP routes (SMS + Redis side effects). State the reason for each, and how to measure
  the create path on purpose if that is ever the question.
- **Explicitly not a pen test** — §5 says so; point at `security.test.ts` / `admin.login.test.ts`
  and CLAUDE.md rules 8/9.
- A one-line `scripts/load/k6/README.md` pointing at this guide is optional; two docs is noise,
  so preferably keep the detail here.

### 4.4 Close out the item (per CLAUDE.md rules 10–11)

1. Tick §7A.5 in `docs/tasks/pending/post-referral-cleanup-and-launch.md` and add a **Done log**
   row.
2. Append a `## 2026-09-24 (launch §7A.5)` section to `docs/BUILD-LOG.md`.
3. Add the next CLAUDE.md **What's-Built index row** (the next number is **89**; §7A.7 = 88) and,
   if the falsification in §4.2 finds a bug, an `RC-###` row in the Root-Cause Tracker table plus
   a top-of-file entry in `docs/root-cause/root-cause issues.md`.
4. Re-run the full suites (`pnpm exec vitest run` per package — **not** `pnpm test --force`, whose
   flag leaks into vitest, and **not** nested `turbo`, which pulls in dependency output) and report
   the numbers: API was 1377 passed / 5 skipped (1382), web 331/331, mobile 107/107.
5. **Commit** — one commit for §7A.5, message style `feat(load): …` or `test(load): …`. Stage only
   `scripts/load/**`, `apps/api/src/routes/load-test.test.ts`, the new guide and the three doc
   files. **`docs/ai-studio/` must stay untracked** (local test images the owner is deleting) —
   it has been excluded from every `git add` on this branch so far.

---

## 5. After §7A.5

With §7A.5 closed, **§7A is complete** (§7A.1–§7A.7). What remains on the board is owner-only
(§7B) and two items blocked on an **EAS build**:

- **§5B** — `?ref=` link capture.
- **F-038 T8** — mobile "Refer & Earn" screen (Play-review-gated).

Also still open and unrelated to §7A.5: **§2.1** (`apps/api/src/jobs/purge-rls-live.test.ts` shows
5 skipped — it needs a real local Postgres, Docker `postgres:16`, **not** prod).

**Do not push to `main`** and do not run `railway up` — the owner merges this branch.

---

## 6. Environment gotchas for whoever picks this up

- **Windows/bash tooling:** the tool layer strips backslashes in heredocs. Verify escape sequences
  with `od -c` / `cat -A` rather than reading the file back — this has already caused one silent
  defect on this branch (`ldJson`'s one-backslash no-op, RC-040).
- **`code_search` is broken** in this environment (ENOENT spawning ripgrep). Use
  `grep`/`rg` via the terminal instead.
- **The board has no literal `## §7` heading** — locate sections with
  `grep -n "^#\{1,4\} " docs/tasks/pending/post-referral-cleanup-and-launch.md`.
- **Running esbuild/vitest for a single file** is fastest as
  `cd apps/api && pnpm exec vitest run src/routes/load-test.test.ts`.

---

## 7. Prompt for a new session

Copy everything between the markers:

<!-- ─────────────── BEGIN PROMPT ─────────────── -->
```
Continue §7A.5 on branch `fix/post-referral-cleanup-and-launch` in the Kanchuki repo.

Read `docs/tasks/pending/7a5-load-test-handoff.md` first — it has the full state: what was
built, the design decisions and why, and the ordered list of what is left. Then finish the item:

1. Fix the single outstanding typecheck error in `apps/api/src/routes/load-test.test.ts`
   line 369 (`TS2532: Object is possibly 'undefined'`) and confirm `pnpm exec tsc --noEmit`
   is clean in `apps/api`.
2. Falsify the new guard the way this repo requires — break each of the four properties named
   in the handoff §4.2, confirm the right arm goes red naming the right reason, then restore.
   Report the observed failures.
3. Write `docs/SCALING.md (Load Testing section)` to the spec in handoff §4.3 — install paths,
   env matrix, the bearer-token recipe, the 200/min-per-IP ceiling and what to do about it,
   how to read the results, and the explicit list of what is deliberately not measured and why.
4. Re-run the full suites per package (not `pnpm test --force`, not nested `turbo`) and report
   the numbers, then close out the item exactly as handoff §4.4 describes: tick §7A.5 on the
   board with a Done log row, add the BUILD-LOG section, add the next CLAUDE.md index row (89),
   and commit just this work.

Constraints: never `git push`, never `railway up`, no migrations, no production env changes.
`docs/ai-studio/` must stay untracked and out of the commit. The rate limiter is a hardcoded
200/min per IP with no env override — do NOT make it configurable as part of this item; it is a
recorded owner decision. If falsification finds a genuine bug, log it as a new RC-### in
`docs/root-cause/root-cause issues.md` (top of file, newest first) plus the CLAUDE.md RC table.
When §7A.5 is done, stop and report: §7A is then complete and the remaining board items are
owner-only (§7B) or blocked on an EAS build (§5B, F-038 T8).
```
<!-- ──────────────── END PROMPT ──────────────── -->
