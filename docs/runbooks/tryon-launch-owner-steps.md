# F-039 Try-On Launch — Owner Steps

**Feature:** F-039 Phase 2 — in-store CatVTON virtual try-on (retailer app + customer PWA)
**Audience:** The owner, working in the RunPod console/API, the Railway dashboard, and the admin panel.
**Time:** ~1 hour of clicking + 2–7 days of waiting on the DLT-adjacent legal pieces (see Part 4).
**Order matters:** the RunPod endpoint must answer a real inference **before** the flag is flipped, and the legal notice must be **live** before any customer's photo is accepted. Doing Parts 5–6 early creates a feature that looks on and fails.

Everything here is **owner-only.** `CLAUDE.md`'s operational control policy forbids the AI agent from triggering deployments, running migrations, editing CI/CD config, or touching production secrets — so this is the human's checklist. The code half of F-039 is done and tested; nothing below is a code change except where it says so.

**Prerequisite — ✅ DONE 2026-09-26:** migrations **118 → 119 → 120** were applied in that order (`118` try-on tables, `119` plan-limits seeds, `120` consent). Confirmed by the owner. Nothing below works without them.

---

## Part 1 — Re-point the RunPod template `v76b819nle`

**The symptom you are fixing.** The template's **image** is SHA-pinned to a July commit, so the endpoint runs worker code from before the consent/gating work. A rebuilt image pushed to GHCR changes nothing until the template's `image` field moves — which is why this looks exactly like a failed rebuild.

**Which image to point at.** `.github/workflows/docker-tryon.yml` pushes two tags per successful build:

| Tag | Use |
|---|---|
| `ghcr.io/kapisejix/kanchuki-tryon:latest` | what to track for a moving target |
| `ghcr.io/kapisejix/kanchuki-tryon:<commit-sha>` | what to pin when you need reproducibility |

Prefer the **SHA tag** for a launch, so the running worker is a named revision rather than "whatever `latest` was at pull time". Get the newest SHA tag from the workflow run (`.github/workflows/docker-tryon.yml`, `Build & Push CatVTON Docker Image`) or from GHCR.

**Update the template** (RunPod REST v2 — `PATCH /v2/templates/{id}`, verified 2026-09-26):

```bash
curl --request PATCH \
  --url https://api.runpod.io/v2/templates/v76b819nle \
  --header "Authorization: Bearer $RUNPOD_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{ "image": "ghcr.io/kapisejix/kanchuki-tryon:<commit-sha>" }'
```

**Check it stuck** — the response echoes the stored `image`. A `403` here means the API key is scoped without template write; a `404` means the key cannot see that template (ownership is enforced).

> **Note on the older console flow.** The RunPod web console edits the same field (Serverless → Templates → `v76b819nle` → Container Image). The API path above is preferred because it is reproducible and leaves a record; the console is fine if you are already there. Do **not** create a new template — the endpoint references this one by id.

---

## Part 2 — Confirm the endpoint is scaled up (`workers.max > 0`)

**The symptom you are testing for.** The 2026-08-31 feature teardown may have zeroed the endpoint's worker count, in which case every try-on queues forever and the job eventually times out — indistinguishable from a broken worker.

`PATCH /v2/serverless/{id}` (verified 2026-09-26) changes workers and scaling:

```bash
# Read current state first — the GET body shows workers.max as stored.
curl --request GET \
  --url https://api.runpod.io/v2/serverless/$RUNPOD_ENDPOINT_ID \
  --header "Authorization: Bearer $RUNPOD_API_KEY"

# Scale up if workers.max is 0 (only max=0 is a defect; min may legitimately be 0).
curl --request PATCH \
  --url https://api.runpod.io/v2/serverless/$RUNPOD_ENDPOINT_ID \
  --header "Authorization: Bearer $RUNPOD_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{ "workers": { "min": 0, "max": 3, "idleTimeout": 10 } }'
```

- **`workers.max`** — `0` means the endpoint accepts no work. Anything ≥ 1 is acceptable; `2–3` matches the README's guidance for one L4.
- **`workers.min`** — `0` is correct for cost (scale-to-zero between try-ons). `1` keeps a warm worker and costs ~$0.44/hr continuously.
- **`idleTimeout`** — seconds an idle worker survives. `10` is a reasonable cost/latency trade; raise it if the first try-on of each day must be fast.

**The endpoint id.** It lives in Admin → Integrations as `CATVTON_API_URL` (the repo's test fixture uses `pnvchif9f4bcom` — confirm yours matches rather than assuming). Read it before running the GET so you are patching the endpoint you think you are.

**Also confirm the request timeout.** The repo allow-list is `RUNPOD_TIMEOUT_MS = 120_000` in `packages/ai/src/tryon.ts`; the endpoint's own `timeout` should be at least that (the README says 120s) or the worker is killed mid-inference and the client sees a timeout rather than a result.

---

## Part 3 — Point the app at the endpoint (Admin → Integrations)

Two secrets, both settable from the admin panel with no restart (`getSecret()` reads the vault first, then env):

| Key | Value |
|---|---|
| `CATVTON_API_URL` | `https://api.runpod.ai/v2/<ENDPOINT_ID>` — **no trailing slash** (the code strips one, but keep it off) |
| `RUNPOD_API_KEY` | the same key you used above |

With `CATVTON_API_URL` unset, the API answers "not available" rather than "failed" (`TryOnNotConfiguredError`) — that is the designed behaviour, so a try-on returning *not available* means this row was never saved.

---

## Part 4 — Legal gate: the notice text must be live before any flag flip

**Do not flip anything in Parts 5–6 until this is verified on the live host.** The whole consent design rests on the customer having read the notice before a photo is taken, and the notice is a **hosted page**, not a string in the app.

**Verified 2026-09-26: this is NOT live.** `https://kanchuki.app/privacy` still renders the **September 24** revision. The updated notice in `apps/web/src/app/privacy/page.tsx` is committed on this branch but **not deployed** — Railway only deploys from a push to `main`. So the notice goes live when this branch merges and deploys, and **not before**.

Order that cannot be violated:

1. This branch merges to `main` and Railway finishes deploying.
2. `https://kanchuki.app/privacy` shows the **new** revision date and the try-on section.
3. **Only then** flip the flag.

The app sends `TRY_ON_CONSENT.version` on every request and the API refuses a try-on with no version, so a notice that is stale or absent on the web while the app already sends a newer version is exactly the mismatch this gate exists to prevent.

---

## Part 5 — Flip `VIRTUAL_TRY_ON_V2` (Admin → Plan Feature Matrix)

**This is the launch switch, and it needs no deploy.** Toggling it in the admin panel turns the feature on for the plans you tick; the mobile app and customer web read it per retailer.

- UK route is **404 without the flag regardless** of the UI, so the flag is the only thing gating the surface.
- Tick **one plan first** (the cheapest tier that should include it) and smoke-test end to end before widening. The flag is also the rollback — unticking it removes the surface just as fast, without a deploy.
- The **`VIRTUAL_TRY_ON_V2` value is in the matrix as of this branch.** It previously was **not**: it was missing from both the API's `z.enum` and the page's hand-kept `FEATURES` list, which made it impossible to enable from the UI. That was fixed and is guarded by a test; if the toggle is absent from the screen, that guard has regressed.

---

## Part 6 — Set real quota numbers

Migration `119` seeded `plan_limits` rows for all three plans with **placeholder** try-on numbers. The grid now renders them (it previously rendered **no row at all** for `TRY_ON_GENERATION` — the value existed in the DB and was unsettable from the UI), so this is a numbers edit, not a code fix.

1. **Admin → Plan Limits** — set the per-plan `TRY_ON_GENERATION` monthly allowance. These are the retailer-side caps.
2. **Admin → Plan Limits → Customer Limits** — set the per-shopper cap the `customer_resource_limits` card edits. This is the second, independent cap: one customer generation spends **both** the retailer's monthly allowance and that shopper's own.

**Leave a blank to mean "no limit"** — a blank renders as `not set` and is stored as `null`. A `0` is not the same thing: it means *nobody may generate anything*, so do not type `0` into a field you meant to leave empty.

**Cost sanity while setting these:** a CatVTON try-on is ~$0.005 on an L4 (README). The plan numbers are your cost ceiling per retailer per month — multiply the cap by $0.005 before choosing it.

---

## Part 7 — Re-run the regression checklist, then smoke-test

**Before:** `docs/root-cause/README.md` → *Pre-production regression checklist*. Re-test every RC, with attention to the rows this branch touches (RC-026 passport preferences, RC-027 studio engines, RC-025 storefront view/proxy).

**Then, on the live feature, in order:**

1. **Retailer path.** Mobile → product → try-on → photograph → consent screen renders → accept → result. Expect 20–60s.
2. **Customer path.** Customer web → product → try-on → sign-in prompt if signed out (`/login?return_to=…`, *not* the API's sentence) → consent → result.
3. **Quota.** Run one past the plan cap; the retailer message must name the limit, and the shopper's own cap must fire independently.
4. **Withdrawal.** Customer → withdraw consent → the stored image must be gone from R2. Then confirm the retry path: `try_on_jobs` rows with `consent_withdrawn_at IS NOT NULL AND result_url IS NOT NULL` should be **zero** after the hourly sweep runs (`handleTryOnDeletionSweep`). A non-empty set means deletes are failing — check the `[try-on] deletion sweep` log line for the count. This is the RC-044 path; a failure here is a **deletion promise that is not being kept**, not cosmetic.
5. **Not-configured behaviour.** With `CATVTON_API_URL` temporarily unset, the feature must say *not available*, not *failed*.

### Known-red, pre-existing, not this feature

The **customer e2e suite is red on `main`** and was red before this branch (verified 2026-09-26: the failing assertions' callers exist unchanged at `HEAD`, and neither the pages nor the e2e support files are touched by F-039). Four responsive tests fail on `client.expectClean` because the e2e **stub API** does not implement three endpoints the pages already call at `HEAD`:

| URL that 404s | Called from |
|---|---|
| `GET /v1/public/passport/preferences` | `(shopper)/my-profile/page.tsx` |
| `GET /v1/public/passport/events` | `lib/passport-client.ts` |
| `GET /v1/public/attributes?kind=STYLE` | `(shopper)/my-profile/page.tsx` |

The e2e's ignore list (`e2e/support/responsive.ts`) excuses only `/api/passport/(me|stores)`, so the proxy's forwarded stub-404 is counted as a real console error. **28 tests pass, including the two the checklist actually needs** — RC-019's offline/service-worker spec and RC-024's store-directory specs are green. The right fix is to serve those three routes from the stub (an ignore-list entry would hide the next real bug, which that file's own comment warns about), and it belongs in its own change, not in F-039's.

---

## What NOT to do

- **Do not create a new RunPod template or endpoint.** The app points at the endpoint by URL and the endpoint points at the template by id; a new one orphans both.
- **Do not delete the `consent_withdrawn_at` column or its rows.** It is the audit record of a withdrawal and outlives the cleanup it triggered — the sweep deliberately never touches it.
- **Do not "fix" the fact that a mid-run withdrawal still spends quota.** The GPU ran; not counting it would make withdraw-and-regenerate a free way to consume a store's allowance. Documented at the call site in `apps/api/src/jobs/tryon.ts`.
- **Do not enable this on a live paid plan before Part 4 is verified live.**

## The CI cache change — owner-only, deliberately not applied

`.github/workflows/docker-tryon.yml` still has its buildx cache commented out under *"Cache disabled for first build — enable after first successful push"*. That first push has now happened (`518d1bee`, `5668d327` restored the GHCR credential), so the condition is met. The change is two lines:

```diff
-          # Cache disabled for first build — enable after first successful push
-          # cache-from: type=registry,ref=ghcr.io/kapisejix/kanchuki-tryon:latest
-          # cache-to: type=inline
+          cache-from: type=registry,ref=ghcr.io/kapisejix/kanchuki-tryon:latest
+          cache-to: type=inline
```

**It is not applied here because `CLAUDE.md`'s policy lists "Modify CI/CD pipeline configuration" under NEVER — not "requires approval", so this is not something an agent may do even when asked.** Apply it by hand when convenient; the effect is faster CatVTON image builds, nothing at runtime.
