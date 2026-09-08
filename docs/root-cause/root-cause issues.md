# Root Cause — Issue Tracker

> **Purpose:** every bug that ships must be recorded here with its ROOT CAUSE (not its symptom).
> Each entry gets a stable ID (`RC-###`) so it can be referenced from commit messages,
> CLAUDE.md, PRs, and future code. If the same root cause explains multiple symptoms,
> keep ONE entry and list the symptoms under it — the fix is what matters, not the surface.
>
> **Format:** one entry per root cause. Symptom → Root cause → Fix → Proof (tests / commit).
> Append new entries at the TOP of the list (newest first).

---

## RC-013 — Dead 360-spin UI and stale VTO/try-on reads survived the teardown in kept screens

- **Component:** `apps/mobile/app/product/[id].tsx`, `apps/mobile/src/lib/api/products.ts`, `apps/mobile/app/onboarding.tsx`, `apps/mobile/app/plan-select.tsx`, `apps/mobile/app/analytics.tsx`, `apps/mobile/src/lib/api/{analytics,billing}.ts`
- **Commit:** `2c6b348`
- **Symptom:** no user-facing crash (nothing opened it), but the product-detail screen shipped a fullscreen 360 spin modal + drag handlers + 3s-polling refs that nothing ever triggered, the `productApi` still exposed spin-video upload/submit methods with no callers, and the plan-selection/onboarding/analytics surfaces declared and read a `try_on_credits` limit the plans API never sends.
- **Root cause:** the 2026-08-31 feature teardown removed spin-frame capture (product_spin_frames) and VTO (TRY_ON quota resource) from the backend, but kept screens that had been built against them were only partially pruned — the dead modal/handlers/polling and the stale field declarations were left behind (same incomplete-prune class as RC-012). Reads were guarded (`> 0` on an absent field) so nothing crashed, but the UI shipped dead code and would re-introduce spin/try-on concepts if anyone trusted it.
- **Fix:** remove the never-openable spin modal, its touch/state refs and the `spin_status === 'processing'` polling branch from `product/[id].tsx`; drop the orphaned `getSpinVideoUploadUrl`/`submitSpinVideo` methods from the `productApi` client; delete the `try_on_credits` declarations and `> 0` feature-line pushes from onboarding / plan-select / analytics (the plans payload never includes it — confirmed against `jsonLimits`/`PLAN_LIMITS`).
- **Proof:** mobile `tsc --noEmit` clean, 59/59 vitest; grep confirms zero remaining `spin_*`/`try_on_credits` reads in `apps/mobile`.
- **Prevention lesson:** when a teardown removes a backend feature, grep the *kept* surfaces for the removed field/route names, not just the files you delete. A dead branch that never executes (guarded `> 0`) is still a trap for the next feature that reuses its name.

---

## RC-012 — Customer detail screen kept a full Measurements card wired to deleted routes

- **Component:** `apps/mobile/app/customer/[id].tsx`, `apps/mobile/src/lib/api/customers.ts`, `apps/mobile/app/(tabs)/customers.tsx`
- **Commit:** `440b900`
- **Symptom:** opening a customer showed a "Measurements" card whose Manual button opened a dead form and whose Camera button navigated to `/customer/:id/measurement` — a screen the teardown deleted, so it 404'd. A "Recent Activity" section consumed a `customer.interactions` field the API no longer returns, and the API client still exposed `getMeasurements`/`createManualMeasurement`/`initPhotoMeasurement`/`extractMeasurement`/`getMatches` with no server endpoints behind them.
- **Root cause:** the 2026-08-31 feature teardown dropped the `CustomerMeasurement` model (migration 082), its endpoints, and the `/customer/:id/measurement` route, and deleted 376 lines from the customer API route — yet the customer-detail screen's Measurements card, manual-entry modal, dead Camera navigation, and the orphaned client methods all survived intact. The teardown claimed "removed measurement entry points" but the *entry points* (buttons on kept screens) were never pruned — only the destinations were. Same incomplete-prune class as RC-013.
- **Fix:** delete the Measurements card, its manual-form modal, the Camera button (`router.push` to the deleted route), the measurement `useQuery`, the `Measurement`/`Interaction` types, and the always-empty Recent Activity block (its backing `customer_interactions` table is dropped, so it can never render content); remove the measurement/match methods from the `customerApi` client; trim unrendered `total_purchases`/`total_spent` off the customer-list type (detail screen keeps them optional — the columns still exist, now always 0).
- **Proof:** mobile `tsc --noEmit` clean, 59/59 vitest; grep confirms zero remaining measurement/match client calls and no `router.push` to any deleted route in `apps/mobile`.
- **Prevention lesson:** deleting a backend feature must include removing every UI entry point that navigates to or reads from it — grep for the route + field names across kept screens, and remember a screen can keep compiling while pointing at a 404.

---

## RC-011 — Switch-Plans request times out because the server's Razorpay call has no timeout

- **Component:** `apps/api/src/routes/billing/billing-helpers.ts` (`razorpay()`), `apps/mobile/src/lib/api/billing.ts` (`subscribe`/`cancel`)
- **Commit:** `54970c5a`
- **Symptom:** switching plans showed "Error — Request timed out (/v1/billing/subscription). Check that the API server is running at https://api.kanchuki.app and try again." — a client-side timeout message that made it look like the API was down.
- **Root cause:** `POST /v1/billing/subscription` creates a real Razorpay subscription through a raw `fetch` with **no timeout**. When Razorpay was slow or hung, the route stayed open past the mobile client's default 10s abort (`AbortSignal`), so the client killed the request and reported a misleading "API server not running" timeout even though the server was fine and still awaiting Razorpay.
- **Fix (two-sided):**
  - Server: `razorpay()` now defaults to `AbortSignal.timeout(20_000)` unless the caller passes its own `signal` — a hung external call can no longer hold a route open indefinitely.
  - Mobile: `subscribe` + `cancel` (both real external calls) get a 60s `timeoutMs` budget instead of the default 10s, so legitimate slow Razorpay responses aren't aborted client-side.
- **Proof/regression test:** `apps/api/src/routes/billing.test.ts` — `describe('razorpay() AbortSignal.timeout default')` pins both halves of the server fix: (1) no caller signal → fetch gets `AbortSignal.timeout(20_000)` (spied on the static factory — this Node build doesn't expose `.timeout` on the returned signal, so the exact deadline is asserted at the factory call), and (2) a caller-provided signal is passed through untouched and `AbortSignal.timeout` is never invoked. Billing suite 22/22.
- **Prevention lesson:** every outbound call to a third-party API needs a bounded timeout at the caller, and the client's timeout must be larger than the server's external-call budget. A client-side timeout on a server that's legitimately awaiting an upstream is a latency bug dressed as an outage.

---

## RC-010 — Logo/banner/profile saves fail because the unchanged stored GSTIN is re-sent and can't round-trip

- **Component:** `apps/mobile/app/settings/index.tsx` (Edit Profile modal `handleSave`), server rule `apps/api/src/routes/retailers/retailers-profile.ts`
- **Commit:** `91214791`
- **Symptom:** "Error when adding logo to retailer profile" — picking a logo (or editing any profile field) and saving failed.
- **Root cause:** `handleSave` always sent `gstin: gstin.trim() || undefined` on **every** save, echoing the value the API returned. The server GSTIN regex is strict (uppercase 15-char format, `UpdateRetailerSchema`); a GSTIN captured once during onboarding — e.g. lowercased, or a value that predates the strict format — can't round-trip. Re-sending the stored value 422'd the whole `PUT /me` request, so an unrelated logo/banner/profile save failed too. The error surfaced was also masked by a generic fallback (see the RC-003 pattern).
- **Fix:** only send GSTIN when it actually changed — omit when untouched, send `''` when cleared:
  ```ts
  const gstinChanged = (gstin.trim() || "") !== String(retailer?.gstin ?? "").trim()
  ...(gstinChanged ? { gstin: gstin.trim() || "" } : {})
  ```
  and surface the real `ApiError.message` instead of "Failed to update profile".
- **Proof:** `apps/api/src/routes/retailers.test.ts` — "accepts a logo-only save with no GSTIN field" and "rejects a malformed GSTIN (the round-trip failure that broke logo saves)". Mobile tsc + 59/59 tests green.
- **Prevention lesson:** never echo server-owned fields back unchanged just because a form pre-fills them. Round-trip a stored value only if the form can represent every stored state; otherwise compare-and-omit. (A follow-up hardening: onboarding should store GSTIN already normalized to the strict format, and the schema could accept the lowercased input by uppercasing server-side.)

---

## RC-009 — "Failed to add team member" hides every real staff-add rejection

- **Component:** `apps/mobile/app/settings/staff.tsx` (`AddStaffModal` mutation onError)
- **Commit:** `91214791`
- **Symptom:** adding a team member failed and the screen always showed the constant "Failed to add team member", so the retailer couldn't tell if the phone was a duplicate, a seat limit was hit, or the phone already belongs to a retailer account.
- **Root cause:** the mutation `onError` discarded the thrown error and passed only a hardcoded fallback string to `showError`. The server sends a specific, user-actionable 422/402 message for every predictable rejection (duplicate active staff phone, plan seat limit, phone already registered as a retailer account — the last two deliberately block the add per the security note in `staff.ts`), but the screen never surfaced any of them. Same swallowed-error class as RC-003 / RC-010.
- **Fix:** surface `ApiError.message` when the thrown error is an `ApiError`; keep "Failed to add team member" only as a true fallback.
- **Proof:** new `apps/api/src/routes/staff.test.ts` pins the whole server contract — happy path 201 with normalized phone, invalid phone 422, seat-limit 402 (`PLAN_LIMIT_EXCEEDED`), duplicate active-staff phone 422, retailer-account phone 422, GET list. (The earlier draft test also caught a real test-infra trap: `vi.clearAllMocks()` doesn't clear `mockResolvedValueOnce` queues — must use `vi.resetAllMocks()`.)
- **Prevention lesson:** see RC-003 — a catch block that replaces the error with a constant string is the bug. When a screen performs a mutation with several distinguishable server rejections, the real message is the product.

---

## RC-008 — GST report crashes on `estimated_*` fields the server renamed to `cgst`/`sgst`/`igst`

- **Component:** `apps/mobile/app/growth/gst.tsx` + `apps/mobile/src/lib/api/growth.ts` (`GstSummary`)
- **Commit:** `df63010d`
- **Symptom:** tapping the GST report (Growth) showed "Error: Cannot read property 'toLocalString' of undefined".
- **Root cause:** the monthly-only-pricing GST engine (BUILD-LOG §59) writes real CGST/SGST/IGST columns and the **server** summary route returns `cgst`/`sgst`/`igst` — and the admin GST report was fixed to match (§59.2, field mismatch `estimated_cgst`→`cgst`). But the **mobile** `GstSummary` type and screen still read `summary.estimated_cgst` / `estimated_sgst` / `estimated_igst`. Those fields are absent from the response, so `summary.estimated_cgst` was `undefined`, and `inr()` called `.toLocaleString('en-IN')` on it → crash. Two compounding faults: a stale field-name contract (same one that broke the admin report) and an unguarded formatter.
- **Fix:** rename the type fields to the real server names (`cgst`/`sgst`/`igst`) and make `inr()` defensive — return `₹0` for `null`/`undefined`/`NaN` instead of dereferencing.
- **Proof:** server route confirmed to return `cgst`/`sgst`/`igst` (`apps/api/src/routes/growth/growth-gst.ts`); mobile tsc clean, 59/59 mobile tests green.
- **Prevention lesson:** the field-name contract between API and client is exactly the thing TypeScript can't check across the wire. When a server response shape changes (a column rename, an aggregation field), grep every client that reads the OLD name — the admin panel was fixed days before the mobile screen still crashed on the same mismatch.

---

## RC-007 — Customer detail screen crashes on `interactions`/purchase totals the teardown removed

- **Component:** `apps/mobile/app/customer/[id].tsx`
- **Commit:** `df63010d`
- **Symptom:** opening a single customer from the customer list showed "Error: Cannot read property 'length' of undefined".
- **Root cause:** the customer-detail screen still treated `interactions`, `total_purchases` and `total_spent` as required fields, but the 2026-08-31 feature teardown (migration 082) dropped the `customer_interactions` table and the checkout/orders data those fields came from — the API now returns a raw customer row without them. `customer.interactions.length` threw immediately, and the stat cards would have hit the same `undefined` crash on the purchase fields.
- **Fix:** make the three fields optional on the local `Customer` type, null-coalesce the stat-card reads (`?? 0`), and gate the "Recent Activity" section on a hoisted `recentInteractions = customer.interactions ?? []` so it hides cleanly when the API returns no interactions instead of crashing.
- **Proof:** mobile tsc clean + 59/59 tests green. The section simply renders nothing for a post-teardown customer instead of erroring.
- **Prevention lesson:** when a feature is removed server-side, screens that consumed its data must be swept in the same change — an orphaned read of a removed field is a guaranteed crash, not a cosmetic gap. The teardown migration should have come with a mobile sweep for the tables it dropped (same lesson as RC-008's field rename).

---

## RC-006 — Suits Designs permalink links "go nowhere" from the product detail sheet

- **Component:** `apps/web/src/app/c/[slug]/components/ProductDetailSheet.tsx`
- **Commit:** `590c2185`
- **Symptom:** clicking a Suits Designs thumb inside the customer product detail sheet appeared to do nothing — the design page never opened.
- **Root cause:** the sheet pushes a history entry on mount (`window.history.pushState({ kanchukiProductSheet: true })`) and its unmount cleanup called `window.history.back()` **unconditionally**. When a Next.js `<Link>` navigated to `/{store}/designs/{id}`, Next pushed a NEW history entry and unmounted the sheet — the cleanup then immediately popped that new entry, undoing the navigation. The link "worked" but the sheet's cleanup cancelled it before the page painted.
- **Fix:** the cleanup now only rolls back when the sheet's own pushed entry is still the top-most history state:
  ```ts
  if (!poppedByUser && window.history.state?.kanchukiProductSheet === true) {
    window.history.back()
  }
  ```
  A real Link navigation replaces the top state, so `kanchukiProductSheet` is gone and the rollback is skipped.
- **Prevention lesson:** any component that manipulates history in an unmount cleanup must check it still owns the top entry. This is a class of bug — audit other components that call `history.back()` in cleanup.

---

## RC-005 — Related product thumbnails on the product detail sheet do nothing

- **Component:** `apps/web/src/app/c/[slug]/components/ProductDetailSheet.tsx` + `CollectionView.tsx`
- **Commit:** `590c2185`
- **Symptom:** tapping a "Related Products" card on the customer product detail sheet went nowhere.
- **Root cause:** the related-product `<button>` onClick only called `onClose()` — it closed the sheet but never opened the related product. There was no navigation handler at all; the click path was literally a no-op dressed as a close.
- **Fix:** added an `onSelectProduct?: (product: PublicProduct) => void` prop (same in-place swap AIStylist's `onProductTap` uses) and wired it to `setSelectedProduct` in CollectionView. Related cards now swap the sheet to the tapped product. Also added a per-product state reset effect (photo index, variant, zoom, detail) so a swapped product never inherits stale view state from the previous one.
- **Prevention lesson:** when a UI affordance exists, verify the click path actually ends in a navigation/state change — "closes the thing it's inside" is almost never the intended behaviour for a card that shows another entity.

---

## RC-004 — Category delete 500s ("Failed to delete category" on the category screen)

- **Component:** `apps/api/src/routes/categories.ts` — `DELETE /v1/categories/:id`
- **Commit:** `21be0e92`
- **Symptom:** deleting a category failed with a 500 / "Failed to delete category".
- **Root cause:** the route called `prisma.productCategory.delete({ where: { id } })` through the main `kanchuki_app` client, but `product_categories` is a hard-delete table under SECURITY §19 — `kanchuki_app` has DELETE revoked and (once triggers cover it) a `BEFORE DELETE` guardrail fires without the session flag. The main client has no DELETE privilege, so the delete throws. Same class of bug that hit products-trash and products-variants earlier.
- **Fix:** same pattern as `products-trash.ts` / `products-variants.ts` — run the hard delete through `getPurgePrisma()` (scoped `kanchuki_purge` role) with `SET app.allow_hard_delete = 'true';` inside the transaction, and write an audit-log row on the main client after.
- **Proof:** `apps/api/src/routes/categories.test.ts` — new regression tests assert the delete goes through the purge client with the guardrail flag, never through the main client.

---

## RC-003 — Mobile AI Campaign screen swallows the real API error ("Failed to generate campaign")

- **Component:** `apps/mobile/app/growth/ai-campaign.tsx`
- **Commit:** `70e057a8`
- **Symptom:** every failure on the AI Campaign Assistant screen showed the same generic "Failed to generate campaign", so the retailer couldn't tell whether to upgrade, retry, or reword the prompt.
- **Root cause:** `handleGenerate`'s catch block discarded the thrown error and passed only the hardcoded fallback string to `showError`. The API already sends a specific, user-safe message for every predictable failure (plan/quota gate, AI-provider outage, unparseable AI reply) — it was simply never surfaced.
- **Fix:** surface `ApiError.message` when the thrown error is an `ApiError`; keep the generic string only as a true fallback:
  ```ts
  const apiMsg = err instanceof ApiError && err.message ? err.message : null
  showError(err, apiMsg ?? 'Failed to generate campaign')
  ```
- **Prevention lesson:** a catch block that replaces the error with a constant string is a bug — the real error is your best debugging signal and often a user-actionable message.

---

## RC-002 — Festival resolution never matches → FESTIVAL campaign drafts can't be saved

- **Component:** `apps/api/src/routes/growth/growth-ai-campaign.ts` — `POST /v1/growth/ai-campaign`
- **Commit:** `70e057a8`
- **Symptom:** AI-generated FESTIVAL drafts always came back with `festival_id: null`; the mobile save flow then blocked saving ("Pick a festival for the campaign") because the festival was never resolved.
- **Root cause:** the route tried to match the festival by `name: { equals: prompt.split(' ').slice(0, 3).join(' '), mode: 'insensitive' }` — i.e. it looked for a festival whose name exactly equals the literal first three words of the prompt (e.g. `"Create a Diwali"`). No festival is ever named that, so the lookup always returned null. The AI has no festival-table access (it always returns `festival_id: null`), so festival_id stayed null and FESTIVAL drafts were unsaveable.
- **Fix:** match any festival whose name appears anywhere in the prompt, newest-starting first:
  ```ts
  const lowerPrompt = prompt.toLowerCase()
  const match = candidates.find((f) => lowerPrompt.includes(f.name.toLowerCase()))
  ```
- **Proof:** `growth-ai-campaign.test.ts` — "resolves festival_id by matching the festival name anywhere in the prompt" (`"Create a Diwali collection…"` → Diwali id), "leaves festival_id null when no calendar festival name appears", "does not query the festival table for non-FESTIVAL intents".
- **Prevention lesson:** an exact-equality match against a substring of user input is a smell. When matching free text to a controlled vocabulary, match *contains*, not *equals*.

---

## RC-001 — AI Campaign Assistant 500s on malformed AI intent replies

- **Component:** `packages/ai/src/campaign-assistant.ts` (`parseCampaignIntent`), route `apps/api/src/routes/growth/growth-ai-campaign.ts`
- **Commit:** `70e057a8`
- **Symptom:** `POST /v1/growth/ai-campaign` intermittently 500'd with "Failed to generate campaign" on the AI Campaign Assistant screen.
- **Root cause:** `parseCampaignIntent` used the free-text `ask()` path with no schema enforcement, so provider models routinely returned shapes the DB route could not safely dereference:
  - missing `product_criteria` / `audience` objects (route reads `intent.product_criteria.category` directly),
  - nested JSON-as-string (`"product_criteria": "{...}"`),
  - enums outside the union (`campaign_type: "HOLIDAY"`),
  - numbers serialised as strings,
  - comma-joined arrays (`"colors": "pink,black"`).
  Any one of those threw inside the route → unhandled 500 → the generic mobile fallback (see RC-003).
- **Fix:** added `normalizeCampaignIntent()` in `packages/ai/src/campaign-assistant.ts` — a never-throwing coercion that re-parses stringified nested objects, coerces enums/numbers/arrays, caps `limit` at 20, and defaults anything invalid to safe values (`PROMOTION`/`casual`/empty objects). `parseCampaignIntent` now always returns a well-typed `CampaignIntent`.
- **Proof:** `packages/ai/src/campaign-assistant.test.ts` — 7 new tests covering pass-through, enum coercion, unknown-enum defaults, stringified nested objects, audience-source filtering, missing objects, and limit capping. AI package 91/91 tests green.
- **Prevention lesson:** never trust a free-text LLM response's shape at the boundary. Normalize/validate on the way in, so downstream code only ever sees the typed contract.