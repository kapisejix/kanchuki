# Pre-Launch Fix List — Reviewed Point by Point

**Date:** 2026-08-23
**Context:** User wants to launch within 3 days. Every point below was verified against the actual codebase (file:line references), not assumed. Priority and effort are scoped for a 3-day launch window — anything too big is flagged as "defer" with a smaller substitute.

Legend: 🟢 small/safe (do before launch) · 🟡 medium (do if time allows) · 🔴 big/defer (do not attempt in 3 days)

---

## Status

**Commit:** `9c0231c` — 8 items fixed in one pass.

| # | Item | Status |
|---|------|--------|
| 1 | Try-on hidden on web | ✅ Done |
| 2 | Dashboard views tracking | ✅ Done |
| 3 | Orders tab gated on plan | ✅ Done |
| 4 | Category image picker | 🔲 TODO |
| 5 | Consent text includes Kanchuki | ✅ Done |
| 6 | Family tag autofill name | ✅ Done |
| 7 | Select/Enquire restyle | 🔲 TODO |
| 8 | ReviewForm prefills name/phone | ✅ Done |
| 9 | Back button + bottom nav | ✅ Done |
| 10 | Sticky back/close buttons | ✅ Done |
| 11 | AI Stylist category filter | ✅ Done |
| 12 | AI Stylist product tap | ✅ Done |
| 13 | Automated referral payout | 🔴 Defer |
| 15 | BookingForm prefills name/phone | ✅ Done |
| 16 | Categorized dashboard grid | 🔲 TODO |
| 17 | Kanchuki logo everywhere | 🔲 TODO |

---

## #1 — Completely hide Try-on feature from retailers and customers (buttons only) ✅ DONE

**Answer:** 🟢 Mostly already done — this is a 2-line flip, not new work.

- `apps/mobile/app/product/[id].tsx:47` — `const TRY_ON_ENABLED = false` — **retailer app is already off.**
- `apps/web/src/app/c/[slug]/components/ProductDetailSheet.tsx:20-21` — `const TRY_ON_ENABLED = true` — customer product-detail "Try This On" button (line 754-768) is **still on**.
- `apps/web/src/app/c/[slug]/components/CollectionView.tsx:36-37` — a **second, independent** `const TRY_ON_ENABLED = true` gates the per-card "Try On" button (line 663-676) and mounts `TryOnModal` (line 519-527) — **still on**.

**Why this shape:** there is no single shared feature flag for VTO — each file has its own local `const`. That's why mobile is off but web has two separate switches still on. No DB/config table governs this (unlike the F-010 quota system), so "hide everywhere" = flip these 2 booleans in `apps/web`, not one central toggle.

**Watch out for:** `apps/mobile/app/tryon/in-store.tsx` is a registered route (`_layout.tsx:151`) — hiding the button doesn't unregister the route. If it must be fully unreachable (not just button-hidden), add a guard inside that screen too. On web, `TryOnModal` is state-mounted only from the button handlers — no standalone route, so hiding the two buttons fully removes reachability there (nothing extra needed on web).

**Do NOT touch:** `growth/index.tsx` "Try-on Bookings" and `growth/bookings.tsx` are the **Showroom booking** feature (unrelated), `analytics.tsx`'s `try_on_credits` is a quota counter, and `pricing/page.tsx` mentions are marketing copy already labeled "Coming soon." Don't accidentally hide any of those.

**Effort:** 15 minutes (2 flag flips + 1 optional route guard).

---

## #7 — Hide Try-on button + redesign Select/Enquire buttons

**Your point:** same hide as #1, plus restyle Select and Enquire.

**✅ Try-on hide: DONE** (flipped both web flags to `false` in same commit as #1). **Redesign: TODO.**

**Answer:** 🟢 Hide = same fix as #1 (only applies to web; mobile has no customer-facing Select/Enquire).

Both buttons live in **one file**: `apps/web/src/app/c/[slug]/components/ProductDetailSheet.tsx`:
- Line 811-824: **Select** (favorite/heart toggle)
- Line 825-836: **Enquire** (`onClick={handleEnquire}`, handler at line 358)
- Also duplicated in the collection grid's sticky bottom bar: `CollectionView.tsx:454-489` (`handleEnquireAll`, line 231)

**Why the redesign is safe and cheap:** both buttons use raw inline Tailwind classes (`cyan-600`, `green-500`, `rose-50`, `gray-100`) — not the shared brand tokens already defined in `apps/web/tailwind.config.ts` (the `ink`/`sand`/`fern` token set from the Black & Gold Elegance / Colabs repaint). Restyling is a class-swap to the existing tokens, no component logic change, no new dependency.

**Effort:** 1-2 hours (2 button locations x class rewrite + a quick visual check on both the sheet and the grid bottom bar).

---

## #2 — Retailer dashboard views not showing up ✅ DONE

**Answer:** 🟡 Root cause found — it's a missing wire, not a display bug, and fixing the real cause needs one new API call added to the customer web app.

**Root cause:** the dashboard's Views card (`apps/mobile/app/(tabs)/index.tsx:130-135`) reads `stats.views_this_month` from `GET /v1/retailers/me/stats`, which counts `CollectionView` rows (`apps/api/src/routes/retailers/retailers-stats.ts:16,29,87`). Those rows are only ever written by `POST /v1/public/collections/:slug/view` (`apps/api/src/routes/public/public-collections.ts:158-209`).

**The bug:** nothing in `apps/web` (the customer-facing storefront that actually renders shared collection links) ever calls that `/view` endpoint. `CollectionView.tsx` posts to `/favorite`, `/enquire`, referral, booking, rating — never to `/view`. So the count is structurally stuck at 0 regardless of real traffic — not a caching issue (Redis cache wraps the GET listing route, not this POST), not a plan/quota gate (none exists on this screen).

**Why not "just a display glitch":** the endpoint and DB write path both work fine — verified independently. The gap is entirely that the customer PWA never triggers it. Fix = add one `fetch(POST .../view)` call when a collection page loads in `apps/web`, e.g. in `CollectionView.tsx`'s mount effect.

**Before fixing:** confirm this isn't "genuinely zero traffic" — ask the retailer reporting it whether they have real customer visits in the affected period.

**Effort:** 30-60 minutes (one POST call + a quick live-traffic smoke test).

---

## #3 — Hide Orders from retailers and customers until cart is active ✅ DONE

**Answer:** 🟢 — reuse an existing flag, don't build a new one. Also: cart/checkout is **not a stub**, it's real and already gated correctly on the web side — the gap is only on mobile.

- **Customer web already does this correctly.** `CHECKOUT_CART` is an existing `PlanFeatureKey` (`packages/db/prisma/schema.prisma:138`), enforced server-side (`checkout-flow.ts:81`, `checkout-payment-account.ts:42,78,188`) and surfaced via `checkout-status/route.ts` → `checkout_enabled`, which `CollectionView.tsx:92-97,459` and `ProductDetailSheet.tsx:782-802` already use to hide Add-to-Cart UI when the flag is off.
- **The retailer mobile app's Orders tab was never wired to this flag.** `apps/mobile/app/(tabs)/_layout.tsx:118-125` renders the Orders tab unconditionally — zero references to `hasFeature`/`CHECKOUT_CART` anywhere in `apps/mobile` (confirmed by grep).
- Real `Order`/`OrderItem` Prisma models exist with Razorpay + GST invoice fields (`schema.prisma:1489,1529,1568`); the checkout flow (`apps/api/src/routes/checkout/*`) is fully built, per-retailer Razorpay account required — so "not active" really means "the retailer hasn't turned it on," which `CHECKOUT_CART` already models.

**Fix:** gate `_layout.tsx:118-125` (and `orders.tsx`/`orders/[id].tsx`) on `hasFeature(retailerId, 'CHECKOUT_CART')` — the exact same check the web app already does. No new plan feature, no schema change.

**Effort:** 30 minutes.

---

## #4 — Pick category image from a product's photo (especially AI Studio Shoot images)

**Your point:** let a category thumbnail be chosen from an existing product photo instead of a fresh upload.

**Answer:** 🟢 DB-compatible today, no schema change needed — this is UI-only.

- `ProductCategory.image_url` / `image_r2_key` (`schema.prisma:446-464`) and `ProductPhoto.url` / `r2_key` (`schema.prisma:633-670`) are the **same storage shape** — a plain R2 public URL + key string.
- AI Studio Shoot (F-032) results are written as ordinary new `ProductPhoto` rows (never overwriting the source), tagged via the `metadata Json?` field — not a separate model. So a studio-shoot image is indistinguishable in structure from any other product photo; no special-casing needed to "reach" it.
- Today's category-image picker (`apps/mobile/app/category/new.tsx:22-53`) only supports picking a **device** photo via `expo-image-picker`, uploading fresh to R2 every time.

**Fix:** add a "choose from an existing product's photos" option to that screen — list `ProductPhoto` rows for a selected product (studio-shoot ones included, since they're just rows with metadata tags) and copy the chosen photo's `url`/`r2_key` straight into `ProductCategory.image_url`/`image_r2_key`. No re-upload, no new fields.

**Effort:** 2-4 hours (product picker UI + list-photos call + copy-on-select — no backend schema work).

---

## #5 — Add "Kanchuki" alongside store name in the phone-number consent text ✅ DONE

**Answer:** 🟢 One-line copy change, and it's legally the more correct version of what exists.

- Found: `apps/web/src/app/[store]/components/ContactGate.tsx:187` — current text:
  > "I agree to share my details with **{profile.shop_name}** and be contacted about products."
- This is the *only* consent copy in the app that names an entity at all. `ReviewForm`, `BookingForm`, `NotifyWhenAvailable`, `TryOnModal` collect phone numbers with **no consent text whatsoever** — just a silent `consent: true` flag.

**Fix:** change line 187 to name both the store and Kanchuki (e.g. "...with {shop_name} and Kanchuki, and be contacted about products, offers, and AI styling features."). Given Kanchuki already states platform ownership in `privacy/page.tsx` (see #17), this is a genuine compliance improvement, not just wording.

**Note:** the other three forms collecting phone with zero consent text are a bigger gap than this one — flagging for after-launch (not requested here, but worth knowing).

**Effort:** 15 minutes.

---

## #6 — Family/gifting relation tags should auto-fill the name textbox ✅ DONE

**Answer:** 🟢 Confirmed bug exactly as reported, trivial fix.

`apps/web/src/app/c/[slug]/components/FamilyProfiles.tsx`:
- Name textbox: lines 146-152 (placeholder "Name (e.g. Mom)")
- Relation tags: lines 154-168, `RELATION_OPTIONS = ['Mom','Sister','Daughter','Wife','Friend','Other']` (line 7)
- Current handler (line 158): `onClick={() => setNewRelation(rel)}` — **only sets the relation, never touches `newName`.**

**Fix:** in that same handler, also set `newName` to the tapped tag when the user hasn't already typed a custom name (e.g. `if (!newName) setNewName(rel)`), so "Other" still allows free typing.

**Effort:** 10 minutes.

---

## #8 — "Rate this product" shouldn't re-ask for name/phone if already saved ✅ DONE

**Answer:** 🟡 This is a genuine gap, not just a "reuse it" bug — the value was never kept anywhere to reuse.

- `StarPicker.tsx` → `ReviewForm` (lines 68-255): Name (optional, 204-215) and Phone (required, 220-231) render unconditionally, no lookup against anything.
- **Why it can't currently be fixed by "just checking session":** the customer PWA has no OTP/auth session at all. The one place name+phone *is* collected — `ContactGate.tsx` (see #5) — only writes a boolean flag to `localStorage['kanchuki_lead_{slug}'] = '1'` on success (line 59). **The actual name/phone value itself is never persisted client-side**, even though the server already has it. So `ReviewForm` has nothing to read back.

**Fix (shared plumbing, not a per-form patch):** have `ContactGate` also persist the real name/phone value (e.g. `localStorage`) alongside the existing flag, then have `ReviewForm` read and prefill/skip those fields if present. This is the same root fix needed for #15 below — do both together.

**Effort:** 2-3 hours (one shared localStorage read/write helper + wiring into `ContactGate`, `ReviewForm`, `BookingForm`).

---

## #9 — Mobile back button exits the store link instead of going back / add bottom nav ✅ DONE

**Answer:** 🟡 Root cause identified precisely — it's a routing-architecture gap, already half-patched once before.

Routing is Next.js App Router with **real routes** for top-level flows (`/cart`, `/checkout`, `/product/[productId]`) navigated via `Link`/`router.push`. But the **grid → product-detail** interaction is *not* a route change — `CollectionView.tsx:69,421` sets local state (`selectedProduct`) and overlays `ProductDetailSheet` on top, with no URL change and no history entry.

**This exact bug was already found and partially fixed once**: `ProductDetailSheet.tsx:137-156` has a comment explaining it and a `window.history.pushState` + `popstate` listener fix, so the product-detail sheet itself now closes correctly on back instead of exiting. **The unpatched cases:** `AIStylist.tsx` (a plain `open` boolean, no history push — back skips straight past it) and any time multiple overlays stack (sheet + try-on modal + booking modal), where back can unwind more than one level at once because none of them coordinate a shared history stack.

**Bottom nav:** confirmed **no bottom tab bar exists anywhere in `apps/web`** today. The retailer app's version (`apps/mobile/app/(tabs)/_layout.tsx:84-140`, Expo Router `<Tabs>`) isn't directly reusable (native library), but the same *layout idea* — a fixed bottom bar with Catalog/Category/Saved — can be added to `apps/web/src/app/c/[slug]/layout.tsx` as a plain fixed-position web component.

**Recommendation for 3 days:** don't attempt full history-stack coordination across all overlays (real but multi-day work). Do the smaller, high-value fix: (a) apply the same `pushState`/`popstate` pattern to `AIStylist`, and (b) add a simple fixed bottom nav bar (Catalog / Saved) so users always have an escape hatch back into their browsing list even if a back-press does exit an overlay unexpectedly. That covers the "lost my list" pain without a full nav-stack rewrite.

**Effort:** 4-6 hours for both partial fixes. Full unified history stack: 🔴 defer, that's a proper rewrite of overlay state management.

---

## #10 — Back/close buttons not sticky, wrong position, need animation ✅ DONE

**Answer:** 🟢 Confirmed and there's already a correct pattern elsewhere in the same codebase to copy.

`ProductDetailSheet.tsx:388-405` — both buttons are `absolute top-4 left-4` / `absolute top-4 right-4` **inside the sheet's own scrollable container** (line 379), so they scroll away with the photo carousel — no scroll listener, no repositioning, no transition (only `active:scale-90` on tap, no animation otherwise).

**The fix already exists in this codebase**, just not applied here: `SharedProductPage.tsx:40` (a different, route-based product page) uses `sticky top-0 z-30` for the same kind of button and it stays correctly in place.

**Fix:** swap `absolute` → `sticky top-0 z-30` (or `fixed` if the buttons should float over the whole viewport, not just the sheet) on both buttons, add a `transition` + subtle scale/opacity pulse for the "highlighted" animation ask.

**Effort:** 1 hour.

---

## #11 — AI Stylist search inaccurate (e.g. "Kurti for office" returns sarees too) ✅ DONE

**Answer:** 🟡 Root cause is precise and fixable, but touches the AI prompt/filter pipeline — test carefully before launch.

Customer-facing AI Stylist: `apps/api/src/routes/public/public-stylist.ts`. **No category/subtype filter is ever applied, before or after the LLM call.** Deterministic pre-filtering (lines 121-148) covers only budget and fabric keywords — there is no category/subtype keyword extraction at all. Up to 60 candidates spanning every category are sent to Claude (lines 150-160) with only a prose instruction ("suggest products that best match") — free-text, unenforced.

**Worse — and higher priority to fix:** both fallback paths — no `ANTHROPIC_API_KEY` (lines 164-180) and Claude API failure (lines 244-260) — **ignore the query entirely** and return `candidates.slice(0, 6)` (top-6 by recency). That means any time the AI call fails or is unconfigured, a "kurti" search can return 100% sarees with certainty. This fallback path is the more urgent bug of the two, since it fails silently and looks like "search doesn't work" rather than "AI is down."

**Fix:**
1. Add a lightweight category/subtype keyword extraction step (same style as the existing budget/fabric extraction) before sending candidates to Claude, so only same-category products are even offered.
2. Fix the two fallback paths to filter `candidates` by extracted keywords before slicing, instead of ignoring the query.

**Effort:** 3-5 hours (extraction logic + wiring into both the main path and both fallbacks + spot-testing a handful of queries).

---

## #12 — AI Stylist result click doesn't open product detail ✅ DONE

**Answer:** 🟢 One-line wiring fix, root cause fully confirmed.

- `AIStylist.tsx:37` declares `onProductTap?: (productId: string) => void`, and each result card's click handler (line 176) calls `onProductTap?.(rec.product_id)`.
- The only place `<AIStylist>` is instantiated — `CollectionView.tsx:531-534` — **passes only `storeSlug` and `storeName`, never `onProductTap`.** The optional-chained call is a silent no-op — this is exactly why it "gets stuck."
- Compare to the normal catalog card (`CollectionView.tsx:421`): `onTap={() => setSelectedProduct(product)}` — this is the pattern to copy.

**Fix:** pass `onProductTap={(id) => { const p = products.find(x => x.id === id); if (p) setSelectedProduct(p); }}` into the `<AIStylist>` call at line 531-534.

**Effort:** 15 minutes.

---

## #13 — Referral tracking: share link → new customer signs up → buys → referrer gets reward {Major Chunk}

**Your point:** track a shared product link back to the referring customer's ID; when the new customer joins with phone+name and buys something, the referrer should automatically get a reward.

**Answer:** 🔴 Defer full automation — it's a real, multi-day feature, not a 3-day-window item. But there's less missing than it looks, and a scoped-down version is realistic in the time you have.

**What already exists (built, not a myth):**
- `Referral` model (`schema.prisma:1977-1991`: `code`, `reward_paise`, `clicks`, `signups`) + `ReferralCredit` (`:1993-2006`, status enum).
- Share-link click tracking: built (`apps/api/src/routes/public/public-growth.ts:13-37`).
- New-customer signup capture (phone+name, tagged `source:'REFERRAL'`): built (`public-growth.ts:42-94`).

**What's actually missing (the part your ask needs):**
- **Purchase attribution is not automatic.** `checkout-webhook.ts`, `checkout-orders.ts`, and `checkout-flow.ts` have **zero references** to `Referral`/`ReferralCredit` (confirmed by grep). The only way a "credit" is created today is `POST /growth/referrals/:id/credit` (`growth-referrals.ts:112-163`), which requires the **retailer to manually pick** which customer converted — it is not triggered by any order/payment event.
- **Reward payout is not automated either.** Credit rows are created `status:'PENDING'`, and the API response literally instructs the retailer to manually apply the discount on the customer's next order (`growth-referrals.ts:160`). No wallet, coupon code, or checkout-time auto-redemption exists.

**Why 3 days isn't enough for the full version:** wiring real purchase-triggered attribution means: linking a `Customer` created via referral to their `Order` at checkout time, adding a webhook/event hook in `checkout-webhook.ts` to auto-create a `ReferralCredit` on successful payment, and building an actual redemption mechanism (coupon/wallet) instead of a manual retailer instruction. That's checkout-flow surgery on money-handling code three days before launch — exactly the kind of change most likely to introduce a payment bug under time pressure.

**Note on docs:** CLAUDE.md feature #52 marks "customer referral rewards" as "✅ Built" — that's **overstated**. It's built through code-generation + share + signup capture. It stops at manual retailer-marked conversion. Recommend correcting that doc line separately (not urgent for launch, but avoids future confusion).

**Recommended scope for launch:** ship what's already there (share, click tracking, signup capture) as-is — it's functional, just not automatic end-to-end. Communicate to retailers that reward crediting is currently a manual step they perform, matching what the API already tells them. Automate the full loop post-launch.

---

## #15 — Book Visit screen re-asks name/phone for known customers ✅ DONE

**Answer:** 🟡 Same root cause as #8 — fix them together as one piece of shared plumbing, not two patches.

`BookingForm.tsx:48-49, 127-150` — same pattern as the review form: plain `useState` inputs, no lookup against anything. Same underlying reason: the customer's phone *is* known server-side (via `ContactGate` → `/api/{slug}/leads`), but the client only keeps a `did-this` boolean flag, never the actual value.

**Fix:** identical to #8 — once `ContactGate` persists the real name/phone value, `BookingForm` reads it the same way `ReviewForm` will.

**Effort:** included in the #8 estimate (2-3 hours covers both forms once the shared helper exists).

---

## #16 — Redesign retailer dashboard: categorized colorful icon grid, real data where available, arrangeable

**Your point:** consolidate Marketing/Growth/Settings/Analytics/Support into small colorful icon blocks, grouped by category, arrangeable by the retailer.

**Answer:** 🟡 The screen inventory to build this from is fully mapped below — but "arrangeable" (drag-to-reorder) has zero existing pattern in this codebase, so scope that part down for launch.

**Current dashboard** (`apps/mobile/app/(tabs)/index.tsx`): greeting → 4 stat cards (Views/Enquiries/Products/Customers) → trending list → one flat wrapping grid of 11 `QuickAction` cards (lines 190-275): Add Product, Categories, Bulk Onboard, Add Customer, New Collection, Orders, Size Charts, Store QR, Growth Tools, AI Search, Analytics, Settings. No categorization today.

**What to group it into (all routes already exist, nothing new to build for content):**
- **Growth Tools hub** (`apps/mobile/app/growth/index.tsx:42-60`) — 17 modules: AI Campaign Assistant, Referrals, Promotions, Suppliers, Try-on Bookings, Inventory Alerts, Product Videos, AI Translate, Marketplace Sync, Incentives, Partners, Social Templates, Lookbooks, Festival Backgrounds, Ratings & Reviews, GST Report, Integrations.
- **Analytics** — `apps/mobile/app/analytics.tsx` (top-level, not nested) backed by `GET /v1/retailers/me/analytics`.
- **Settings** — `apps/mobile/app/settings/index.tsx`: profile/store, staff, WhatsApp catalog, social connections, billing, deleted-products, logout.
- **Support** — there's no standalone "Contact Support" screen for retailers. The closest thing is the "Report a Problem" modal already wired into Settings (`ReportProblem` component, `settings/index.tsx:1442-1447`). Ticket routing exists but is staff-facing only (`apps/mobile/app/staff/*`), not retailer-facing — don't build a new support surface, just surface the existing modal as its own icon.

**Suggested category buckets for the icon grid:** Catalog/Ops (Add Product, Bulk Onboard, Categories, Size Charts, Orders) · Growth (top 4-6 daily-use modules from the 17 — recommend Campaigns, Referrals, Promotions, Inventory Alerts as the "best/most-used") · Marketing/Tracking (Analytics, Growth Analytics, Social Integrations) · Settings/Support (Settings, Report a Problem, Staff).

**On "arrangeable":** confirmed no drag/reorder library or pattern exists anywhere in `apps/mobile` today (no `DraggableFlatList`, no sortable state, no persisted-order field). Adding real drag-to-arrange means a new dependency + a new persisted-order field on the retailer record — doable, but it's net-new infrastructure, not a rewire of existing pieces.

**Recommendation for 3 days:** build the categorized, colorful icon-grid layout (real data where available, icon+name fallback otherwise) — that's a pure UI reshuffle of existing routes, safe and fast. **Defer drag-to-arrange to post-launch** — ship a sensible fixed order now, add reordering once there's time to pick and test a drag library properly.

**Effort:** categorized grid: 4-6 hours. Drag-to-reorder: 🔴 defer (multi-day: library integration + persistence + testing).

---

## #17 — Kanchuki logo in top bar everywhere, theme-aware, centered; update Privacy/Terms for platform ownership

**Your point:** show the full Kanchuki logo on every screen including customer screens, light logo on dark backgrounds and vice versa, and make sure Privacy Policy / Terms reflect that Kanchuki owns the platform.

**Answer:** 🟡 split into three sub-findings — one is smaller than expected, one needs a missing asset, one needs no work at all.

**1. Logo asset — exists, but only in one variant.**
`apps/mobile/assets/kanchuki-full-logo.png` and `apps/web/public/kanchuki-logo.png` are the same 884x176 PNG — a dark-navy wordmark meant for **light backgrounds only**. A theme-aware **light-on-dark variant does not exist as a usable app asset** — it only exists as unused draft SVGs in `scripts/demo/kanchuki-logo/` (`wordmark-dark.svg` etc.), never imported by any app code. **You'll need to export a light/white version of the logo before this can be built** — the code side is not the blocker, the asset is.

**2. No shared header component exists to put the logo in — anywhere.**
- Web marketing site has one shared `Navbar()` (`apps/web/src/components/site/Chrome.tsx:63-160`) that already shows the logo (line 109-116) — but this **only mounts on marketing pages**, not the customer storefront.
- **The actual customer screens (`/c/[slug]`) have no Kanchuki logo at all today** — `CollectionView.tsx:279-326` header shows only the retailer's own shop name/city, no branding.
- **Mobile retailer app has no shared Header/TopBar component** — every screen hand-rolls its own header inline. `_layout.tsx:126-138` sets native `Stack` header options but has no logo slot.
- **No dark/light theme context exists** anywhere in the codebase (`useColorScheme`/`prefers-color-scheme` — zero matches). What exists instead is an **admin-configurable brand-color palette** (`apps/mobile/src/lib/theme.tsx`, `ThemeProvider`/`useTheme()`), not an OS dark-mode toggle. A logo-switching component would need new logic — e.g. checking the configured `backgroundColor`'s luminance — since there's no existing light/dark signal to hook into.

**Why this is bigger than "add an image tag":** doing this properly means (a) getting the missing light-variant asset, (b) building one new shared header/topbar component for the customer storefront (doesn't exist), (c) retrofitting the mobile app's per-screen headers into a shared component (larger refactor — every screen currently owns its own header), and (d) writing the light/dark selection logic against the brand-color luminance since there's no existing toggle. Given a 3-day window, (c) — refactoring every mobile screen's hand-rolled header into a shared component — is the risky, time-consuming part.

**Recommendation for 3 days:** scope down to what's achievable safely — add the logo to the customer storefront header (new, small component, low risk) and to the web marketing `Navbar` (already there, skip). **Defer the full mobile-app header unification** to post-launch; retrofitting every retailer screen's header is a real refactor, not a launch-week change. Use only the existing light-background PNG for now (request/export the dark variant separately) rather than blocking on new asset production.

**3. Privacy Policy / Terms — no rewrite needed, already correct.**
Both already frame Kanchuki as the platform operator:
- `apps/web/src/app/privacy/page.tsx:22-25` — "Kanchuki... provides an AI-powered catalog and commerce platform for clothing retailers."
- `apps/web/src/app/terms/page.tsx:22-25` + §3 (lines 46-53): retailers retain ownership of **their uploaded content** (photos/data) and grant Kanchuki a license to use it — this is standard content-licensing language, not a claim that retailers own the platform. Nothing anywhere claims retailer platform ownership. §7 (lines 85-93) already uses "Kanchuki" as the operating/liable entity throughout.

**No changes needed here** — flagging so you don't spend launch-week time on a document that's already correct.

**Effort:** storefront header + logo: 3-4 hours. Marketing navbar: 0 (already done). Mobile header unification: 🔴 defer. Privacy/Terms: 0 (already correct).

---

## Summary — what to actually do in 3 days

**🟢 Do first (small, safe, high confidence — roughly 1 day total):**
#1 (try-on flags) ✅, #7-hide (same flags) ✅, #3 (Orders gate) ✅, #4 (category image picker), #5 (consent copy) ✅, #6 (family tag autofill) ✅, #10 (sticky buttons) ✅, #12 (AI Stylist click fix) ✅.

**🟡 Do if time allows after the above (needs more care/testing — roughly 1-1.5 days):**
#7-redesign (Select/Enquire styling), #2 (dashboard views wiring) ✅, #8+#15 (shared name/phone persistence) ✅, #9 (AIStylist history fix + basic bottom nav) ✅, #11 (AI Stylist category filtering) ✅, #16 (categorized dashboard layout, no drag-reorder), #17 (storefront logo only, not full header unification).

**🔴 Explicitly defer past launch (real multi-day work, risk of breaking something under time pressure):**
#13 full automated referral payout (ship the existing manual-credit version as-is), #9 full cross-overlay history-stack rewrite, #16 drag-to-arrange, #17 mobile-wide header refactor + new dark-logo asset production.

**Doc note:** point #14 was not included in your list (jumps from #13 to #15) — nothing was skipped on our end, it's absent from the original numbering.
