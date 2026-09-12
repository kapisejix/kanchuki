# Root Cause — Issue Tracker

> **Purpose:** every bug that ships must be recorded here with its ROOT CAUSE (not its symptom).
> Each entry gets a stable ID (`RC-###`) so it can be referenced from commit messages,
> CLAUDE.md, PRs, and future code. If the same root cause explains multiple symptoms,
> keep ONE entry and list the symptoms under it — the fix is what matters, not the surface.
>
> **Format:** one entry per root cause. Symptom → Root cause → Fix → Proof (tests / commit).
> Append new entries at the TOP of the list (newest first).

---

## RC-019 — Offline-fallback e2e test intermittently fails by reaching the real server

- **Component:** `apps/web/e2e/customer-collection.spec.ts` (`collection pages work offline via the service worker`, step 7)
- **Commit:** `7483b93f`
- **Symptom:** CI job `e2e-web` failed on `await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible()` — twice in a row (initial + retry #1) on run `34618428005`, then PASSED on the very next commit whose only diff was documentation. A check that red-lights on a zero-code change is the single most expensive kind of CI noise: it blocks merges, it trains everyone to re-run instead of read, and it hides real regressions in the same job.
- **Root cause:** the test simulated "no network" with `context.setOffline(true)` alone. That blocks the **page's** network stack, but the **service worker's own `fetch()`** is not reliably covered by it. When that fetch reached the still-running `next start` server, `/c/never-visited` answered with its real 307 redirect, the SW followed it and returned `/meera-sarees/festive-edit` — the cached copy of the collection page — so the precached `/offline` fallback never ran and the heading never appeared. Whether the SW slipped through was timing-dependent, which is exactly why the same commit could pass and fail. Two follow-on findings, both from traces: `context.route()` **does** intercept SW-originated *subresource* fetches but **not** the SW's *navigation* fetch, so aborting one URL (or even `**/*`) cannot make a navigation offline; and the SW target is the thing that must be offline — the page target being offline proves nothing about it.
- **Fix (shipped):** step 7 no longer navigates to an **uncached** URL. That assertion is removed as **not makeable deterministic from Playwright today**, and the spec carries a comment block recording the evidence. Three attempts were each disproved by instrumentation rather than assumed: (a) `context.route('**/*', route.abort)` — a trace showed the SW's own *navigation* fetch still reaching the running `next start` and receiving the real 307, so aborting cannot make a navigation offline; (b) gating on the SW target's `navigator.onLine === false` — a **false positive**: the worker reported offline while its navigation still landed on the collection page; (c) stubbing the worker's global `fetch()` **and** disabling `navigationPreload` (the browser's second, independent path for document navigations) — still ~1-in-3, and on failing runs `caches.match('/c/never-visited')` was a **MISS while `fetch` was stubbed**, proving the response came from Chromium's handling of the SW-controlled navigation, not the worker's routing or its caches. Step 7 now asserts the layer that *is* deterministic: a new `expect.poll` precondition proves `/offline` is actually in the precache (so a missed install-time precache fails in 10s naming the real cause instead of a 15s "element not found" timeout at the last assertion), and the cached document is then read directly and asserted to contain "You're offline".
- **Proof:** `playwright test -c playwright.customer.config.ts` → 3/3 green across **3 consecutive full-suite runs** (the run type that exposed the flake; single-test `-g` runs were never a valid signal here); `apps/web` `tsc --noEmit` clean; repo `pnpm lint` exit 0 (6/6 tasks).
- **Prevention lesson:** `context.setOffline(true)` is not a switch for "the network is gone" — it does not reliably cover service-worker-originated requests, and it is the *service worker's* view of the network that the offline fallback depends on. Do not trust a passing run to mean the precondition held — this test passed in isolation and failed in the full suite, so a green `-g` run proves nothing. And when an assertion genuinely cannot be made deterministic at the layer it needs, **remove it and assert the layer below** rather than shipping a 1-in-3 flake: a check that red-lights on a zero-code commit costs more than the coverage it buys, and the honest gap belongs in a comment next to the code.

---

## RC-018 — Facebook/Instagram connect always shows Facebook's credentials login form

- **Component:** `apps/mobile/src/lib/facebook-auth.ts` (`loginWithFacebook`)
- **Commit:** `18f0642c`
- **Symptom:** tapping "Connect with Facebook" / Instagram opens Facebook's **full email + password login page** in an in-app web view instead of the one-tap "Continue as <account>" dialog, on every connect attempt, even for an account that had already granted access.
- **Root cause:** the RC-016 fix called `LoginManager.logOut()` **immediately before every** `logInWithPermissions()` call. That clears the SDK's on-device session unconditionally, so the SDK starts each attempt with no session and Facebook has to re-authenticate from scratch — which renders as the credentials form. RC-016 was fixing a real symptom (Disconnect only deleted the server-side row, leaving a dead on-device session that looped), but it fixed it by destroying the cached session on the happy path too, turning "one-tap continue" into "type your password" permanently. The device also has no Facebook app installed, so the SDK's `NATIVE_WITH_FALLBACK` login behaviour lands on its own WebView dialog rather than the native app switch — which is why the screenshot shows a `facebook.com` page with no browser chrome (it is **not** the app's `connectViaWeb()`, which uses `Linking.openURL` and would open the system browser with an address bar).
- **Fix:** ask for a token **first** without touching the session (a session that already exists is returned with no UI); only when that comes back with no usable token — the genuine RC-016 case, a stale session whose grant the server no longer knows about — clear the session with `logOut()` and retry once. Also narrowed the dynamic-import `catch`: a module that is installed but throws while loading (bundle/native failure in a release build) now raises a real error instead of being silently mislabelled `FacebookAuthUnavailable` and dropping the retailer into the web OAuth flow.
- **Proof:** `apps/mobile` `tsc --noEmit` clean; `expo lint` clean; mobile vitest **104/104** (18 files — the 18 new regression tests for RC-017/RC-018 included, 11 of which fail against the parent commit); repo `pnpm lint` clean (6/6 tasks).
- **Prevention lesson:** "clear local state before retrying" is a repair for a **failed** attempt, not a precondition for every attempt. A fix that resets state unconditionally converts a rare recovery path into the default UX and is invisible in code review — the diff reads like defensive hygiene. When the symptom is "the user is asked to do more work than expected", check whether some earlier fix made the extra work mandatory.
- **Still open (not a code defect):** if the Facebook app is not installed on the device, the SDK's own web dialog is the expected behaviour and it still asks for credentials. For a genuine one-tap experience the device needs the Facebook app, or the Meta app needs Live mode + the test account as Tester/Admin and the Android release key hash registered.

---

## RC-017 — AI Studio Shoot always generates the first style regardless of tap

- **Component:** `apps/mobile/src/components/product-detail/ProductStudioModal.tsx`
- **Commit:** `faf2d64d`
- **Symptom:** retailer taps Product/Model tab, taps any style row — the tapped row never shows selected, only the first row does, and Generate always produces the same output regardless of what was tapped.
- **Root cause:** a `useEffect` re-selects `activeList[0]` on every dependency change, and `activeList` (`styles.filter(...)`) is a **new array every render**. The tap's `setSelectedSlug` triggers a re-render → `activeList` gets a new reference → the effect fires again → stomps the selection back to the first item, before the user's tap is ever visible.
- **Fix:** `faf2d64d` dropped `activeList` from the effect's dependency array (only `[tab, styles.length]` re-triggers the auto-select). **Follow-up (2026-09-11, later):** that removes the specific trigger but leaves the vulnerable shape — the selection was still *stored* state reconciled by an effect, so any future dep change or re-render could re-introduce the stomp. The selection is now **derived**: `pickedSlug` stores only the retailer's explicit tap (`null` = none) and `selectedSlug` falls back to `activeList[0]` at render time, so no effect can ever overwrite a tap. The pick is cleared only on tab change or modal reopen (`[tab, visible]`), both intentional resets.
- **Prevention lesson:** a derived array/object (`.filter()`, `.map()`, spread) is never safe as a `useEffect` dependency unless memoized — it changes reference every render and turns "reset on tab change" into "reset on every render, including the user's own state update." More generally: prefer deriving the display value from the user's raw input over storing the resolved value and repairing it in an effect.

---

## RC-016 — Reconnecting Facebook after Disconnect loops on FB's login screen

- **Component:** `apps/mobile/src/lib/facebook-auth.ts` (`loginWithFacebook`)
- **Commit:** (uncommitted — this session)
- **Symptom:** first-time Facebook connect works and posts successfully; after tapping Disconnect and Connect again, the flow gets stuck re-showing Facebook's login screen instead of completing.
- **Root cause:** Disconnect (`facebook.tsx` `handleDisconnect`) only calls the server to remove the stored SocialAccount row — it never calls the native FB SDK's `LoginManager.logOut()`. The SDK's on-device session/token cache survives, so the next `logInWithPermissions` tries to silently re-auth a session Facebook itself has invalidated, falling into a WebView re-consent loop instead of a clean native prompt.
- **Fix:** call `LoginManager.logOut()` immediately before `logInWithPermissions()` on every connect attempt, forcing a fresh session each time.
- **Prevention lesson:** a "disconnect" action that only clears server-side state, not the SDK's own local session, leaves stale native auth state for the next connect attempt to trip over — clear both sides symmetrically.

---

## RC-015 — OTP sent twice per request (retailer login + customer storefront gate)

- **Component:** `apps/mobile/app/auth/phone.tsx` (`handleSend`), `apps/web/src/app/[store]/components/ContactGate.tsx` (`handleSendOtp`)
- **Commit:** (uncommitted — this session)
- **Symptom:** every OTP request sent 2 SMS / 2 MSG91 API calls; occasionally the code from the first SMS read as "expired" because the second request's `reqId` overwrote the first's in MSG91's store.
- **Root cause:** `handleSend`/`handleSendOtp` only guarded on `!isValid`/phone-length — nothing blocked re-entrancy. On mobile, the numeric keypad's `onSubmitEditing` (Android "Done") and the submit button's `onPress` are two independent event sources that can both fire before the `loading` **state** commits (state updates aren't synchronous within the same tick), so both calls pass the guard and both dispatch. On web, a fast double-click/ghost-tap hit the same race against `otpSending` state.
- **Fix:** a synchronous `useRef` guard (`sendingRef`/`otpSendingRef`) checked and set before the async call starts, reset in `finally` — matches the `isVerifyingRef` pattern already used in `otp.tsx`'s `handleVerify`, now applied consistently to every OTP-send entry point.
- **Prevention lesson:** React state is not a synchronous mutex — two independent event handlers (keyboard submit + button tap, or a double-click) can both read a stale `false` before a `setState` commits. Any handler reachable from more than one UI trigger needs a ref-based re-entrancy guard, not a state-based one.

---

## RC-014 — Cancelling the native share sheet surfaces as an unhandled `AbortError`

- **Component:** `apps/web/src/app/c/[slug]/components/ProductDetailSheet.tsx`, `apps/web/src/app/c/[slug]/components/CollectionView.tsx` (both `handleShare`)
- **Commit:** `9d6ca8de`
- **Symptom:** Sentry `KANCHUKI-WEB-1` — `AbortError: Share canceled`, level Error, unhandled, on route `/:store` (the customer storefront, which renders `CollectionView`). One event per shopper who opened a share button and then dismissed the OS share sheet.
- **Root cause:** `navigator.share()` **rejects with `AbortError`** when the user dismisses the native share sheet — a normal outcome, not a failure. Both `handleShare` callbacks `await navigator.share(...)` with no `try/catch`, and every call site is `onClick={() => void handleShare()}` — the `void` discards the returned promise, so the rejection has no handler and becomes an unhandled promise rejection that Sentry captures as an Error. (`DesignShareActions.tsx` already handled this correctly; these two predated that pattern.)
- **Fix:** wrap the `navigator.share`/`navigator.clipboard` block in `try/catch` in both callbacks — `return` silently when `err.name === 'AbortError'` (user dismissal), otherwise fall back to a guarded `navigator.clipboard.writeText(url).catch(() => {})` so there is always an outcome and the fallback itself can't reject unhandled. Matches the existing `DesignShareActions` shape.
- **Proof:** web `tsc --noEmit` clean; `apps/web/src/app/c/[slug]/components/__tests__/{CollectionView,ProductDetailSheet}.test.tsx` pass (3/3).
- **Prevention lesson:** `navigator.share()` (and `navigator.clipboard`, geolocation, permissions prompts) reject on ordinary user cancellation — every call needs a `catch` that treats `AbortError` / `NotAllowedError` as a non-event. `onClick={() => void asyncFn()}` is not error handling; the `void` silences the linter, not the rejection.

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
- **Proof/regression test:** `apps/api/src/routes/billing.test.ts` — `describe('razorpay() AbortSignal.timeout default')` pins both halves of the server fix: (1) no caller signal → fetch gets `AbortSignal.timeout(20_000)` (spied on the static factory — this Node build doesn't expose `.timeout` on the returned signal, so the exact deadline is asserted at the factory call), and (2) a caller-provided signal is passed through untouched and `AbortSignal.timeout` is never invoked. Billing suite 22/22. Mobile screen smoke `apps/mobile/__tests__/smoke/rc-screens.test.tsx` "RC-011 switch plans" renders the plan cards from `billingApi.getPlans` without crashing.
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
- **Proof:** `apps/api/src/routes/retailers.test.ts` — "accepts a logo-only save with no GSTIN field" and "rejects a malformed GSTIN (the round-trip failure that broke logo saves)"; mobile screen smoke `apps/mobile/__tests__/smoke/rc-screens.test.tsx` "RC-010 profile / logo save" renders the Edit-Profile modal and asserts the unchanged GSTIN is omitted from the update payload (`'gstin' in payload` is false). Mobile tsc clean, 64/64 tests green.
- **Prevention lesson:** never echo server-owned fields back unchanged just because a form pre-fills them. Round-trip a stored value only if the form can represent every stored state; otherwise compare-and-omit. (A follow-up hardening: onboarding should store GSTIN already normalized to the strict format, and the schema could accept the lowercased input by uppercasing server-side.)

---

## RC-009 — "Failed to add team member" hides every real staff-add rejection

- **Component:** `apps/mobile/app/settings/staff.tsx` (`AddStaffModal` mutation onError)
- **Commit:** `91214791`
- **Symptom:** adding a team member failed and the screen always showed the constant "Failed to add team member", so the retailer couldn't tell if the phone was a duplicate, a seat limit was hit, or the phone already belongs to a retailer account.
- **Root cause:** the mutation `onError` discarded the thrown error and passed only a hardcoded fallback string to `showError`. The server sends a specific, user-actionable 422/402 message for every predictable rejection (duplicate active staff phone, plan seat limit, phone already registered as a retailer account — the last two deliberately block the add per the security note in `staff.ts`), but the screen never surfaced any of them. Same swallowed-error class as RC-003 / RC-010.
- **Fix:** surface `ApiError.message` when the thrown error is an `ApiError`; keep "Failed to add team member" only as a true fallback.
- **Proof:** new `apps/api/src/routes/staff.test.ts` pins the whole server contract — happy path 201 with normalized phone, invalid phone 422, seat-limit 402 (`PLAN_LIMIT_EXCEEDED`), duplicate active-staff phone 422, retailer-account phone 422, GET list. (The earlier draft test also caught a real test-infra trap: `vi.clearAllMocks()` doesn't clear `mockResolvedValueOnce` queues — must use `vi.resetAllMocks()`.) Mobile screen smoke `apps/mobile/__tests__/smoke/rc-screens.test.tsx` "RC-009 add team member" drives the real `AddStaffModal`: fills the form, submits against a mocked `ApiError`, and asserts the specific server message ("This phone number already belongs to a retailer account") reaches `Alert` — and that the generic fallback does **not**.
- **Prevention lesson:** see RC-003 — a catch block that replaces the error with a constant string is the bug. When a screen performs a mutation with several distinguishable server rejections, the real message is the product.

---

## RC-008 — GST report crashes on `estimated_*` fields the server renamed to `cgst`/`sgst`/`igst`

- **Component:** `apps/mobile/app/growth/gst.tsx` + `apps/mobile/src/lib/api/growth.ts` (`GstSummary`)
- **Commit:** `df63010d`
- **Symptom:** tapping the GST report (Growth) showed "Error: Cannot read property 'toLocalString' of undefined".
- **Root cause:** the monthly-only-pricing GST engine (BUILD-LOG §59) writes real CGST/SGST/IGST columns and the **server** summary route returns `cgst`/`sgst`/`igst` — and the admin GST report was fixed to match (§59.2, field mismatch `estimated_cgst`→`cgst`). But the **mobile** `GstSummary` type and screen still read `summary.estimated_cgst` / `estimated_sgst` / `estimated_igst`. Those fields are absent from the response, so `summary.estimated_cgst` was `undefined`, and `inr()` called `.toLocaleString('en-IN')` on it → crash. Two compounding faults: a stale field-name contract (same one that broke the admin report) and an unguarded formatter.
- **Fix:** rename the type fields to the real server names (`cgst`/`sgst`/`igst`) and make `inr()` defensive — return `₹0` for `null`/`undefined`/`NaN` instead of dereferencing.
- **Proof:** server route confirmed to return `cgst`/`sgst`/`igst` (`apps/api/src/routes/growth/growth-gst.ts`); mobile screen smoke `apps/mobile/__tests__/smoke/rc-screens.test.tsx` "RC-008 GST report" renders the summary tab from the real `cgst`/`sgst`/`igst` fields without crashing. Mobile tsc clean, 64/64 mobile tests green.
- **Prevention lesson:** the field-name contract between API and client is exactly the thing TypeScript can't check across the wire. When a server response shape changes (a column rename, an aggregation field), grep every client that reads the OLD name — the admin panel was fixed days before the mobile screen still crashed on the same mismatch.

---

## RC-007 — Customer detail screen crashes on `interactions`/purchase totals the teardown removed

- **Component:** `apps/mobile/app/customer/[id].tsx`
- **Commit:** `df63010d`
- **Symptom:** opening a single customer from the customer list showed "Error: Cannot read property 'length' of undefined".
- **Root cause:** the customer-detail screen still treated `interactions`, `total_purchases` and `total_spent` as required fields, but the 2026-08-31 feature teardown (migration 082) dropped the `customer_interactions` table and the checkout/orders data those fields came from — the API now returns a raw customer row without them. `customer.interactions.length` threw immediately, and the stat cards would have hit the same `undefined` crash on the purchase fields.
- **Fix:** make the three fields optional on the local `Customer` type, null-coalesce the stat-card reads (`?? 0`), and gate the "Recent Activity" section on a hoisted `recentInteractions = customer.interactions ?? []` so it hides cleanly when the API returns no interactions instead of crashing.
- **Proof:** mobile tsc clean + 64/64 tests green, including the mobile screen smoke `apps/mobile/__tests__/smoke/rc-screens.test.tsx` "RC-007 customer detail" which renders a teardown-shaped customer (no `interactions`) and asserts the phone, header and purchase-summary cards all render. The section simply renders nothing for a post-teardown customer instead of erroring.
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