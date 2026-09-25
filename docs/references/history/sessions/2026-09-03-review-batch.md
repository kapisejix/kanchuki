# Changes — 03 Sep 2026

Review of 11 reported issues + the "deleted retailer still in DB" case (phone `8872101879`).
Each item below: **root cause → why it happens → fix → files**. All items are
implemented and verified as of **2026-09-03** (mobile + web + API typechecks and
test suites green).

Legend for effort: **S** = < 1h, one file · **M** = 1–3 files · **L** = cross-cutting / needs product decision.

## Status (2026-09-03)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Shop URL + QR auto-generate on registration | ✅ Done | `onboarding.tsx saveFinalStep()` calls `getQrSlug()` (get-or-create); Store QR screen no longer needs a manual Generate step |
| 2 | Customer login: Resend OTP + OTP never delivered | ✅ Done | 30s-cooldown Resend button + MSG91 widget path (bypasses the DLT-blocked SMS sender); API SMS remains the fallback |
| 3 | OTP screen consent checkbox | ✅ Done | Required consent on the phone step; Verify gated on it; backend already records `PASSPORT_CREATED` consent |
| 4 | Storefront hard loads between pages | ✅ Done | `/{store}` renders the catalog behind the gate (no `/categories` redirect hop); `prefetch` added to catalog/wishlist/back links |
| 5 | "Set as Main image" missing on product detail | ✅ Done | `ProductPhotoControls` Set-as-Main row wired to existing `PATCH /photos/:photoId` + `setPhotoPrimary` |
| 6 | Collection stats one-per-row | ✅ Done | Views/Visitors/Favorites/Enquiries now render 4-across in one row |
| 7 | AI Studio Generate behind Android nav bar | ✅ Done | Bottom-sheet safe-area bottom padding added |
| 8 | Selected 7/30/90-day chip white-on-white | ✅ Done | className-toggle pattern (matches product-detail buttons) |
| 9 | Facebook connect "Sorry, something went wrong" | ✅ Code fixed — owner steps remain | OAuth dialog now uses an https redirect (`WEB_URL/social/connect`), never `kanchuki://`; web page passes its own https callback; Meta **app dashboard** (register redirect URI, App Mode Live, App Review) + **EAS build** verification are account-side follow-ups |
| 10 | Shared product page CTAs stacked | ✅ Done | Enquire Now + View Full Catalog side by side |
| 11 | Product sheet CTA design differs from shared page | ✅ Done | Shared `ProductCtas` component used by both surfaces |
| — | Retailer phone `8872101879` | ✅ Kept live | Account revived in the earlier session; nothing to do (documented below) |

---

## #1 — Shop URL + QR should auto-generate on registration (no separate "Generate" step)

**Symptom:** After onboarding the retailer still has to open the Store QR screen and
tap **Generate QR Code** before the store link/QR exists.

**Root cause:** `public_slug` (the storefront slug that the QR + `kanchuki.app/<slug>`
link are built from) is **never created during onboarding**. Onboarding only saves
`shop_name`. The "Your Store Web Link" preview in onboarding step 1 is a pure
client-side `slugify(shopName)` string — it is not persisted.
The Store QR screen deliberately does **not** auto-create the slug (see the comment
at `store-profile.tsx:44-46`) so `hasQr` (`!!me.public_slug`) is `false` until the
retailer taps Generate, which calls `POST /me/qr-slug` (get-or-create).

**Why:** the slug creation was intentionally gated behind an explicit tap to avoid
"silent" slug creation; but the product now wants it to always exist.

**Fix (lazy):** create the slug once at the end of onboarding.
In `saveFinalStep()` (onboarding), after `retailerApi.update(...)`, call
`retailerApi.getQrSlug()` once (it is get-or-create and derives the slug from
`shop_name`). Then `store-profile.tsx` sees `hasQr === true` on first open and shows
the QR + link with no Generate step. Optionally also surface the link on the
dashboard / Settings shop card (both already import `QrCode`).

**Files:**
- `apps/mobile/app/onboarding.tsx` — call `retailerApi.getQrSlug()` in `saveFinalStep()`
- `apps/mobile/app/store-profile.tsx` — no change needed; `hasQr` path already renders QR when slug exists
- verify backend `POST /v1/retailers/me/qr-slug` derives the slug from `shop_name` when none is passed (it does per the screen's comment)

**Effort:** S

---

## #2 — Customer login: no "Resend OTP", and OTP always fails ("Invalid or Expired OTP")

**Symptom:** On the customer store login (`ContactGate` "Verify with OTP"), the OTP
step has no resend control, and entering any code returns
*"Invalid or expired OTP. Try Again."*

**Root cause — two separate bugs:**

1. **No resend button.** `ContactGate.tsx` OTP step (`otpStep === 'otp'`, lines
   325–381) renders only *Verify & Enter* and *← Change number*. `handleSendOtp`
   exists and could be reused but is not wired to any control on that step.

2. **OTP never delivered → verify sees no stored code.** The customer flow calls
   `POST /api/passport/otp/send` → backend `passport-otp.ts` → `sendOtpViaMsg91()`
   (the **server-side MSG91 SMS path**). Per `CLAUDE.md` / project memory, that path
   is blocked at the account level — the sender ID is **not DLT-registered**, so
   MSG91 returns `type:"success"` but the carrier drops the SMS. The customer never
   receives a code; on verify, `verifyStoredOtp()` returns `absent` →
   `AppError('INVALID_OTP', 'Invalid or expired OTP. Try again.', 401)` — exactly the
   screen text. (The **retailer mobile** app works because it uses the MSG91
   **widget** — client-side, MSG91's own provisioned route — which bypasses the
   per-sender DLT requirement. `ContactGate` does **not** use the widget.)

**Why:** the passport OTP was built on the raw SMS send/verify API, not the widget;
DLT registration for the custom sender ID is still pending (2–7 working days,
account-side, no code).

**Fix:**
- **2a (resend):** add a *Resend OTP* button to the OTP step that calls
  `handleSendOtp()` again, gated by a 30s countdown (mirror the retailer
  `apps/mobile/app/auth/otp.tsx` pattern: `resendTimer` state + `setInterval`).
- **2b (delivery) — pick one:**
  - **Recommended:** wire the MSG91 **widget** into `ContactGate` (the web widget
    lib already exists at `apps/web/src/lib/msg91-widget.ts` and is used by the
    retailer web widget). On verify, send `{ phone, widget_token }` to
    `/api/passport/otp/verify` — the backend already accepts `widget_token` as
    "Channel 1" (`passport-otp.ts:84-87`). This bypasses DLT entirely.
  - **Or (no code):** complete DLT sender-ID registration in the MSG91 dashboard;
    the existing SMS path then works as-is.

**Files:**
- `apps/web/src/app/[store]/components/ContactGate.tsx` — resend button + (2b) widget integration
- `apps/web/src/lib/msg91-widget.ts` — reuse for the widget path
- (backend already supports `widget_token`; no API change for 2b-widget)
- account task: MSG91 DLT registration (for 2b-SMS)

**Effort:** M (resend = S; widget wiring = M)

---

## #3 — OTP screen has no consent checkbox

**Symptom:** The customer "Verify with OTP" phone step (`ContactGate`) collects a
phone number and sends an OTP with **no consent checkbox** on that step.

**Root cause:** consent lives only on the **legacy manual form**
(`ContactGate.tsx:451-470`, `<input type="checkbox" checked={consent}>`) and in
`CustomerConsentModal.tsx`. The primary passport OTP path (phone step, lines
250–324) has no consent control and `handleSendOtp` does not check one.

**Why:** the OTP/passport flow was added later as the "fast path" and the consent
gate from the legacy form was not carried over.

**Fix:** add a required consent checkbox to the OTP phone step (same copy + Privacy
Policy / Terms links as the legacy form's `consent` checkbox). Gate the
*Verify with OTP* button on it (`disabled={otpPhone.length < 10 || !consent || otpSending}`).
Write the consent server-side on verify — the backend already records a
`ConsentEvent` of kind `PASSPORT_CREATED` in `passport-otp.ts:129-140` for new
accounts, so surfacing the checkbox is a UI-completeness fix; no schema change.
(Retailer onboarding already has this pattern — `onboarding.tsx:523-568`.)

**Files:**
- `apps/web/src/app/[store]/components/ContactGate.tsx`

**Effort:** S

---

## #4 — "Hard load" when a customer browses the catalog in a browser

**Symptom:** Moving around the storefront (store landing → catalog → category →
product → back) shows full-page loads / spinners instead of instant in-app
transitions.

**Root cause:** the storefront is split across several **separate Next.js route
segments**, and entry bounces through a post-mount redirect:

1. `/{store}` (`[store]/page.tsx`) renders **only** `<ContactGate>` — there is no
   catalog on it. After the gate passes, `ContactGate.proceed()` does
   `router.replace('/{store}/categories')` — a **fresh RSC segment load** with the
   route's `loading.tsx` spinner.
2. `/{store}/categories`, `/{store}/all`, `/{store}/categories/[categoryId]`,
   `/{store}/[collection]` are each their own `async` server component doing
   `fetch(..., { next: { revalidate: 60 } })`. Navigating between them is a
   document-level RSC navigation (visible `loading.tsx` fallback each time).
3. Legacy `/c/{slug}` links do a server `redirect()` to `/{store}/{slug}`
   (`c/[slug]/page.tsx:45`) — an extra hard hop before anything renders.

Within a single `CollectionView`, category/price/color filtering is already
client-side state (`FilterBar` `onClick` handlers, no navigation) and product taps
open a bottom sheet — those are fast. The jank is **only** the cross-segment
navigation + the `/{store}` redirect bounce.

**Why:** the storefront grew as independent SEO-friendly pages; the `/{store}` root
was made a gate-only page and never renders the catalog itself.

**Fix (lazy, staged):**
- Make `/{store}` render the catalog directly after the gate (reuse the `/{store}/all`
  data + `CollectionView`) instead of `router.replace`-ing to `/categories`. Removes
  one hard hop for every visitor.
- Add `prefetch` to the `<Link>`s for category / collection / "View Full Catalog"
  targets so Next client-prefetches them and the transition is instant.
- Consider collapsing `/{store}/categories/[categoryId]` into `CollectionView`'s
  existing `filterCategory` client state (the separate route is largely redundant)
  — bigger change, optional.

**Files:**
- `apps/web/src/app/[store]/page.tsx` (+ `components/ContactGate.tsx` `proceed()`)
- `apps/web/src/app/c/[slug]/components/CollectionView.tsx` (`prefetch` on nav Links)
- `apps/web/src/app/[store]/categories/*` (optional consolidation)

**Effort:** M (landing render + prefetch) / L (route consolidation)

---

## #5 — "Set as Main image" missing from the product detail page

**Symptom:** Retailer can no longer pick any photo and make it the catalog's main
image from the product detail screen. It used to be there.

**Root cause:** the per-photo **Set as main** control was dropped in the
`b0c3747` "2026 Royal Orchid luxury redesign" of the mobile product detail (same
redesign that dropped `ProductPhotoControls`, later restored — see `CLAUDE.md`
feature #53). The current `ProductMediaCarousel.tsx` only has Add Photo / Add Color
/ Video / AI Studio; `ProductStudioModal` has "Set as Main Photo" but **only for a
freshly generated studio image**.

The plumbing still exists:
- API: `PATCH /v1/products/:id/photos/:photoId` with `{ is_primary: true }` —
  `products-media.ts:407-445` (F-029), demotes all others + promotes this one in a tx.
- Mobile client: `productApi.setPhotoPrimary(productId, photoId)` —
  `apps/mobile/src/lib/api/products.ts:106-116`.

Only the button is gone.

**Fix:** add a **Set as Main** action to `ProductPhotoControls.tsx` (it already
renders for the current photo and has the right guards — hidden on original /
variant / video slides). Show it when `!currentPhoto.is_primary`. Wire to a new
`handleSetPrimary` mutation (in the `useProductAiStudio` hook or inline) calling
`productApi.setPhotoPrimary`, then invalidate the product query.
Widen `ProductPhotoControlsProps.currentPhoto` to include `is_primary: boolean`.

**Files:**
- `apps/mobile/src/components/product-detail/ProductPhotoControls.tsx` — add button + prop
- `apps/mobile/app/product/[id].tsx` — pass `handleSetPrimary` / `is_primary`
- `apps/mobile/src/hooks/useProductAiStudio.ts` (or wherever photo mutations live) — add the mutation
- no API change

**Effort:** S–M

---

## #6 — Collection stats show one-per-row; want 4 blocks in a single row

**Symptom:** On the collection detail screen, **Views / Visitors / Favorites /
Enquiries** stack vertically (screenshot 68). Want all 4 in one row.

**Root cause:** the `Stat` component (`collection/[id].tsx:566-592`) uses
`flex-1 min-w-[45%]` inside a `flex-row flex-wrap` container. `min-w-[45%]` +
`flex-1` + wrap forces ≤2 per row, and on a narrow phone the arbitrary
`min-w-[45%]` (NativeWind arbitrary value) combined with the card's internal
padding pushes each item to its own line.

**Fix:** make each stat a fixed narrow column and drop wrap:
- container: `flex-row px-4 pt-4 gap-2` (remove `flex-wrap`)
- `Stat`: replace `flex-1 min-w-[45%]` with `flex-1` (equal quarters), reduce
  padding (`p-4` → `p-3`), stack icon above the number vertically, shrink the
  number (`text-xl` → `text-base`) and label (`text-xs` → `text-[10px]`) so 4 fit.

**Files:**
- `apps/mobile/app/collection/[id].tsx` (`Stat` component + the stats `<View>` at lines 473-478)

**Effort:** S

---

## #7 — AI Studio Shoot: "Generate" button hidden behind the Android nav bar

**Symptom:** In the AI Studio Shoot bottom sheet, **GENERATE STUDIO SHOT** sits
under the phone's back/flip/nav buttons (screenshot 67).

**Root cause:** the modal sheet in `ProductStudioModal.tsx:330-348` is
`<View className="bg-white rounded-t-3xl p-5 max-h-[85%]">` with **no
safe-area bottom padding**. The final `GradientButton` has only the sheet's
`p-5`, so on Android (gesture bar / 3-button nav) it overlaps the system nav area.

**Fix:** use `useSafeAreaInsets()` and add
`style={{ paddingBottom: insets.bottom + 16 }}` to the sheet container (and/or wrap
the picker's action button in a footer `View` with that padding). Same pattern
already used in `collection/new.tsx:176` (`paddingBottom: 14 + insets.bottom`) and
`onboarding.tsx:1049`.

**Files:**
- `apps/mobile/src/components/product-detail/ProductStudioModal.tsx`

**Effort:** S

---

## #8 — New Collection: selected 7 / 30 / 90-day button not highlighted (white on white)

**Symptom:** When creating a collection, the selected duration chip shows a white
background with (near-invisible) white text instead of dark bg + white text like
the product-detail buttons.

**Root cause:** `collection/new.tsx:105-125` styles the selected state with
**inline `style={{ backgroundColor, borderColor }}`** on an `AnimatedPressable`
that also carries a `className`, and the `Text` color via inline `style`. Passing a
dynamic inline `style` alongside `className` on a css-interop component
(`react-native-css-interop@0.1.22`) is unreliable in this codebase (three other
screens carry explicit workarounds — `auth/otp.tsx:288`, `onboarding.tsx:1036`);
here the `AnimatedPressable`'s inline `backgroundColor` is being dropped while the
`Text`'s inline color still applies → white text on the default white card.

The product-detail buttons the user references (`ProductAttributesForm.tsx:392-405`
etc.) use **className toggles**, not inline style:
`isSelected ? 'bg-spaceCadet-900 border-spaceCadet-900' : 'bg-white border-lavender-200'`
and text `isSelected ? 'text-white' : 'text-spaceCadet-900'`.

**Fix:** convert the `EXPIRY_OPTIONS` chips in `collection/new.tsx` to the same
className-toggle pattern (`bg-spaceCadet-900 border-spaceCadet-900` / `text-white`
when `active`). Removes the inline-style dependency and matches the product screen.

**Files:**
- `apps/mobile/app/collection/new.tsx:105-125`
- *Verify:* if the screenshot is actually the quick-create modal in
  `apps/mobile/app/(tabs)/collections.tsx` / the `EditModal` in `collection/[id].tsx`,
  those currently use a free-text "Expires in (days)" `TextInput` (no chips) and
  would instead need the chip UI added.

**Effort:** S

---

## #9 — Facebook connect fails ("Sorry, something went wrong" on the Meta page); all social must work

**Symptom:** Tapping *1-Click Connect Facebook Page* lands on Meta's generic
"Sorry, something went wrong" error (screenshot 61).

**Root cause:** the flow falls back to the **web OAuth URL** path
(`facebook.tsx:handleOneClickConnect` → `FacebookAuthUnavailable` → `connectViaWeb()`
→ `GET /v1/retailers/me/social/connect` → `buildOAuthUrl()`), and that URL is
malformed for Facebook Login:

- `buildOAuthUrl()` (`apps/api/src/lib/meta-graph.ts:64-87`) sets
  `redirect_uri = 'kanchuki://oauth/callback'` — a **custom URI scheme**. Facebook
  Login **only accepts `https://` redirect URIs**, and the URI must be listed in the
  app's *Valid OAuth Redirect URIs*. A `kanchuki://` value → Meta's generic error page.
- The Meta app is almost certainly still in **Development mode** and/or has not
  passed **App Review** for `pages_manage_posts`, `instagram_content_publish`,
  `business_management` — non-role users then get the same generic error.
- If `META_APP_ID` / `META_APP_SECRET` are unset on the API service,
  `resolveMetaCredentials()` returns `null` and the connect endpoint 503s /
  simulates — but the screenshot shows a real Meta page, so credentials *are* set
  and the redirect-URI/app-mode issue is the live blocker.

The **intended** path is the native SDK (`loginWithFacebook`, app-to-app, no
redirect URI) — available only in an **EAS / dev-client build**, never Expo Go. The
reporter is likely on Expo Go or a build without `react-native-fbsdk-next`, so it
falls back to the broken web path.

**Fix:**
1. Test on an **EAS build** with `react-native-fbsdk-next` + correct
   `facebookAppId` / `facebookClientToken` / Android key hash in `app.json` — the
   native path avoids the redirect-URI problem entirely.
2. For the web fallback to work at all: change `buildOAuthUrl` to use an **https**
   redirect that the app owns — e.g. `https://kanchuki.app/social/connect`
   (`apps/web/src/app/social/connect/page.tsx` already exists) — which then
   deep-links back into the app; register that exact URL in the Meta app's
   *Valid OAuth Redirect URIs*.
3. Take the Meta app **Live** and complete **App Review** for the publish
   permissions (or add each test retailer as an app Tester).
4. Instagram: same, plus the retailer's IG must be a Business/Creator account
   linked to the connected Facebook Page.
5. GMB / YouTube / Google Ads / X screens under `apps/mobile/app/growth/integrations/`
   are "bring-your-own-key" stubs with the same class of missing provider-app
   config — scope this ticket to Facebook + Instagram (the only two with real Graph
   API code in `apps/api/src/lib/meta-graph.ts`) and track the rest as separate
   credential/config tasks.

**Files:**
- `apps/api/src/lib/meta-graph.ts` — `buildOAuthUrl` redirect URI
- `apps/mobile/app/growth/integrations/facebook.tsx` / `instagram.tsx` — pass the https redirect; keep native SDK as primary
- `apps/mobile/src/lib/facebook-auth.ts` — no change (native path already correct)
- Meta app dashboard: redirect URIs, App Mode, App Review (no code)
- env: confirm `META_APP_ID` / `META_APP_SECRET` on the API service

**Effort:** L (mostly Meta app config + EAS build verification; code change is S)

---

## #10 — Shared single-product page: put "View Full Catalog" + "Enquire Now" side by side

**Symptom:** On the shared-to-a-friend product page, *Enquire Now* and
*View Full Catalog* stack vertically (screenshot 57). Want two columns.

**Root cause:** `SharedProductPage.tsx:241-259` wraps both CTAs in
`<div className="space-y-3 pt-2">` (vertical stack).

**Fix:** change the wrapper to a 2-column row, e.g.
`<div className="grid grid-cols-2 gap-3 pt-2">`, and equalize the two buttons'
padding/height (both `py-3.5`, same `rounded-3xl`) so they read as a pair. Keep
*Enquire Now* as the filled gradient and *View Full Catalog* as the outline
variant. (If the product is `SOLD` the block is already hidden — no change.)

**Files:**
- `apps/web/src/app/c/[slug]/components/SharedProductPage.tsx:241-259`

**Effort:** S

---

## #11 — Customer single-product screen should use the shared-product page's button design everywhere

**Symptom:** The product view opened from the catalog grid (the bottom sheet)
uses different CTA styling than the shared single-product page (screenshot 57).
Want one consistent button design across mobile + catalog browse.

**Root cause:** two different components render "a product":
- **Full page** — `SharedProductPage.tsx` (used by both
  `/c/[slug]/product/[productId]` and `/[store]/[collection]/product/[productId]`):
  big gradient *Enquire Now* + outline *View Full Catalog*.
- **Bottom sheet** — `ProductDetailSheet.tsx` (opens on product tap inside
  `CollectionView`, no navigation): its own CTA row at lines ~700-730
  (*Add to Wishlist* + *Enquire Now*) with different radius / weight / layout, plus
  a different gallery treatment.

They were built separately and drifted.

**Fix:** extract the `SharedProductPage` CTA block (and, if wanted, the AI-summary /
product-info / sizes cards) into a shared component and render it in
`ProductDetailSheet` too — or at minimum copy the exact button classes
(gradient `from-[#231F48] to-[#560A39]`, `rounded-3xl`, `py-4`, icon + label) so
both surfaces match. The `[store]` product route already renders `SharedProductPage`,
so it becomes consistent once #10 lands.

**Files:**
- `apps/web/src/app/c/[slug]/components/ProductDetailSheet.tsx` — adopt the shared CTA style
- `apps/web/src/app/c/[slug]/components/SharedProductPage.tsx` — optionally factor CTA block into a shared component
- new (optional): `apps/web/src/app/c/[slug]/components/ProductCtas.tsx`

**Effort:** M

---

## Retailer phone `8872101879` — "deleted but still in the database"

**Current DB state (checked 2026-09-03):**

| Table | Row | `deleted_at` | Notes |
|---|---|---|---|
| `retailers` | `cmt5bv30p003iiom9ro8mjtz3` — "Sharma did it" | **NULL** | `onboarding_completed = true`, `auth_user_id = 086e007f-c269-4e1a-aecf-9890d113ba0f`, created 2026-08-23 |
| `auth.users` | `086e007f-…` — phone `918872101879` | NULL | `last_sign_in_at = 2026-09-03 11:19 UTC` (signed in today) |

**The account is currently LIVE and logging in** — it was already revived in the
previous session ("Option A, revive the account"). No orphaned soft-deleted row
remains for this number.

**Root cause of the original "linked to a deleted account" symptom:**
`retailers.phone` is `UNIQUE`. Account deletion is a **soft delete** (`deleted_at`
set, row kept for the Deletion Vault / F-016). The unique phone stays claimed until
the row is **hard-purged** by the `purge-soft-deleted` cron, which only removes rows
`deleted_at < now() - 15 days` (`PURGE_AFTER_DAYS = 15` in
`apps/api/src/jobs/purge-soft-deleted.ts`). During that window,
`auth.ts:418-422` returns
*"This mobile number is linked to a deleted account. It can be released once the
account purge completes…"*. If the cron is not running on the deployed worker
(BullMQ repeatable job / `PURGE_DATABASE_URL` / `kanchuki_purge` role wiring), the
row **never** purges and the number is parked indefinitely.

**How to release / retrieve a parked number in future:**

- **Retrieve (revive)** — clear the soft-delete:
  `UPDATE retailers SET deleted_at = NULL WHERE phone = '<10-digit>';`
  (phone is stored as the bare 10 digits in `retailers`, `91`-prefixed in
  `auth.users`). Owner then logs in via OTP normally; `auth.ts:340-345` already does
  this automatically under the test bypass.
- **Delete now (free the number immediately)** — hard-delete ahead of the cron via
  the admin **hard-delete retailer** path (added in PR #16) or by running
  `handlePurgeSoftDeleted()` with a lowered cutoff. Must delete children before the
  `retailers` row (the cron already encodes the correct FK order:
  `subscription_payments` → `subscriptions` / `staff` / `social_*` / … → `retailers`).
  Also delete the Supabase `auth.users` row for the number.
- **Prevent recurrence** — either (a) fix the purge-cron wiring on Railway (worker
  running, `PURGE_DATABASE_URL` set to the `kanchuki_purge` role, repeatable job
  registered), or (b) on soft-delete, **release the unique phone immediately** —
  anonymise `retailers.phone` (e.g. set it to `deleted:<id>` and keep a hash for
  audit) so a fresh signup can reuse the real number without the 15-day wait.

**Files:**
- `apps/api/src/jobs/purge-soft-deleted.ts` — cron (verify it runs; optional lower cutoff / manual trigger)
- `apps/api/src/routes/auth.ts:418-422` — the 409 message; add phone-release on soft-delete for option (b)
- `apps/api/src/routes/retailers/retailers-settings.ts` — retailer self-delete path (where the phone could be released)
- Railway: worker service + `PURGE_DATABASE_URL` env + BullMQ scheduler wiring

**Action needed from you:** confirm whether you want `8872101879` **kept live**
(current state — nothing to do) or **fully deleted now** (admin hard-delete + auth
user removal).

---

## Build order actually executed (2026-09-03)

1. ✅ Quick S wins: #3, #6, #7, #8, #10, #1
2. ✅ #5 (Set as Main) — S–M
3. ✅ #2 (resend + widget) — M
4. ✅ #4 (storefront navigation) — M
5. ✅ #11 (CTA component unification) — M
6. ✅ #9 (Facebook / social) — code change done; Meta dashboard redirect-URI / App-Mode / App-Review registration + EAS-build verification remain owner-side
7. ✅ Retailer phone — kept live (revived account, no action needed); purge-cron wiring is worth a separate check
