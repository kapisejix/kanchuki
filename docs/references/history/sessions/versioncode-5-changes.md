# versionCode 5 changes — 4 reported bugs, root-caused and fixed

**Date:** 2026-09-13
**Branch:** `main` (uncommitted this session)
**Requested by:** owner, via screenshots (`shared image (88/89/90).jpg`) + description

Each item below: symptom → root cause → fix. RC-### ids are the full write-ups in
`docs/root-cause/root-cause issues.md` (newest first there too).

---

## #1 — OTP appears twice on screen (RC-020)

**Symptom:** the 6-digit code seemed to render in two places — once in the app's own
digit boxes, once somewhere else near the keyboard.

**Root cause:** `apps/mobile/app/auth/otp.tsx` hides the real, focusable `TextInput`
behind a fake digit-box UI (an intentional trick from an earlier fix, commit
`0c005303`, for "OTP keyboard never opens on Android") by mirroring the typed code as
the field's own `value` and styling it `color: 'transparent'`. Some Android OEM
keyboards/autofill overlays force-render a field's actual text once autofill inserts
into it, ignoring that transparent styling — the real input briefly shows the code on
top of the app's own boxes, which are already showing the same digits.

**First attempt (reverted, owner rejected):** `importantForAutofill="no"` stopped the
duplicate but also disabled Android autofill entirely — not acceptable, autofill must
keep working on both platforms.

**Fix:** kept the autofill hints (`textContentType="oneTimeCode"` for iOS QuickType,
`autoComplete="sms-otp"` for Android SMS Retriever) and instead stopped relying on
`color: transparent`. The field's own `value` is now a permanent `""` — every keystroke
or autofilled code arrives once via `onChangeText`, gets folded into the `otp` state the
boxes render, and the native field is left with nothing to ever visually reveal, no
matter what an OEM skin overrides. Backspace (no longer visible to delete) is handled
explicitly via `onKeyPress`.

**File:** `apps/mobile/app/auth/otp.tsx`

---

## #2 — Two different OTP SMS per real phone number (RC-021)

**Symptom:** entering a real number produced two SMS from two different senders —
`CP-KCUKI3-S` ("...for KANCHUKI... — Sejix Technologies", the DLT-registered template)
**and** `CP-DSHOTP-S` ("...--Dash"). Two different codes, not a duplicate of the same
message.

**This is a different bug from RC-015** (2026-09-11, "OTP sent twice per request").
RC-015 fixed a re-entrancy race (keyboard-submit + button-tap both firing before React
state committed, sending the *same* request twice). That fix (a `sendingRef` guard) is
still in place and still correct — it just wasn't the cause of *this* symptom.

**Root cause:** `apps/mobile/app/auth/phone.tsx`'s `handleSend` calls the backend's
`POST /otp/send` first (to check the pre-production `OTP_TEST_BYPASS` phone list), then
— for any real phone, unconditionally — *also* calls the native MSG91 Widget SDK's own
`sendOTP`. Nobody told the backend that the widget was about to send its own OTP: when
the server has MSG91 credentials configured (the production case), that first call to
`/otp/send` **already** dispatches a real SMS via the classic v5 OTP API
(`sendOtpViaMsg91`, using `MSG91_TEMPLATE_ID` — the DLT-registered template). So every
real-phone login fired both the classic-API send *and* the widget's independent send,
each using its own separately-configured MSG91 template/sender ID. Two real, different,
correctly-delivered OTPs — just one too many.

**Fix:**
- `POST /otp/send` accepts an optional `widget: boolean` field. When `true` (and the
  phone isn't a test-bypass number), the route skips its own classic-API dispatch and
  just returns — the caller's widget will send its own OTP.
- The mobile app now passes `widget: isMsg91OtpConfigured()` on that first call. If the
  widget's own send then fails to produce a usable `reqId`/token, the app explicitly
  calls `/otp/send` again *without* the widget flag, so a real OTP still goes out — the
  classic dispatch only happens once, on whichever path actually needs it.

**Files:** `apps/api/src/routes/auth.ts`, `apps/mobile/app/auth/phone.tsx`,
`apps/mobile/src/lib/api/auth.ts`

**Note on the screenshot's fabric-chip overlap** (image 90, product detail screen):
static review of `ProductAttributesForm.tsx`'s Fabrics section found nothing wrong —
standard `flex-row flex-wrap gap-2`, same pattern used for Categories/Styles/Sizes on
the same screen, and those aren't reported as broken. Left untouched: fixing something
that reads correctly in code, on a report with no reliable repro, risks a real
regression for a rendering artifact (most likely a stale animation frame from
`AnimatedPressable` mid-reflow, caught by the screenshot) that may not be a real bug at
all. Flag it again with a screen recording if it's reproducible and we'll take another
look.

---

## #3 — Top/bottom safe-area insets "gone" on inner screens — no code regression found

**What was checked:** the 2026-09-06 safe-area standardization (`useScreenInsets()` in
`apps/mobile/src/lib/safe-area.ts`, BUILD-LOG §65) is fully intact on `main`:

- 64 of the ~68 migrated screens still call `useScreenInsets()` and apply
  `headerPaddingTop` / `screenPaddingBottom` / `tabScrollPaddingBottom`.
- The 6 screens still on raw `useSafeAreaInsets()` (`auth/phone.tsx`, `auth/otp.tsx`,
  `onboarding.tsx`, `join.tsx`, `staff/retailer-onboard.tsx`, `(tabs)/_layout.tsx`) are
  the documented exceptions (centered forms with tuned symmetric insets, or the tab bar
  itself) — same as BUILD-LOG §65 describes, not new gaps.
- 6 modal-style screens (`category/new.tsx`, `product/scan.tsx`,
  `product/[id]/add-color.tsx`, `product/[id]/add-photos.tsx`,
  `showcase-designs/new.tsx`, `showcase-designs/[id].tsx`) import the hook but read
  `insets.bottom`/`insets.top` directly instead of the named helpers — also documented
  behavior for pageSheet modals, not a regression.
- No `StatusBar`/`SystemBars` override, no edge-to-edge config change, and no recent
  commit (since 2026-09-06) touches `app/_layout.tsx`, `(tabs)/_layout.tsx`, or
  `app.json` in a way that would affect inset math. The Expo SDK 52→54 jump that made
  Android edge-to-edge mandatory happened in July 2026, well before the safe-area fix
  was built and verified against it.

**Conclusion:** the fix from 2026-09-06 is present and unchanged in the code the app
would build from today. No root cause was found on `main`, so nothing was changed here
— changing working code without a reproducible cause would risk introducing a real
regression to chase a phantom one. The most likely explanation on the device side is a
stale installed build (the versionCode 3/4 builds from 2026-09-11/12 should include the
fix, but Play's closed-testing rollout + the tester's own "update from Play" step can
lag a new upload by hours). **If it's still visibly missing on a build confirmed to be
versionCode 4 or later, that's new information — flag which screen(s) specifically and
we'll dig further from there,** ideally with the build's git SHA (see
`docs/PLAY-STORE-RELEASES.md`, a process gap already called out in
`docs/tasks/2026-09-11-otp-fb-aistudio-lint-session.md` §4.1: nothing currently proves
which commit produced an installed `.aab`).

---

## #4 — Facebook share: no Shop button, no photo on link/collection-link posts, no preview (RC-022, RC-023)

**"Add a Shop button by default"** — checked against Meta's Graph API first: organic
Facebook Page posts (photo, video, or link) **have no API-exposed "Shop Now" CTA
button** — that capability exists only for Ads and for the separate Facebook/Instagram
Shopping catalog integration (already built — WhatsApp/Facebook Catalog Sync,
BUILD-LOG §49), not the general publish endpoint this composer uses. A clickable
image + a visible link in the post is the closest equivalent the platform allows for an
organic post, so that's what these fixes target.

**#4a — no shop link by default (RC-023).** The composer's "Add link" section
(none/collection/storefront/product) defaulted to `'none'`, and a retailer had to
manually turn it on every single time. Most didn't, so most posts had no way back to
the shop at all. **Fix:** default to `'storefront'` (always resolves — every retailer
has a `public_slug`); switching between post types no longer drops back to `'none'`.

**#4b — Collection-Link posts (and their preview) carry no photo (RC-022).** A
"Collection link" post (the link-only sub-format) sends no product `items` by design —
so nothing ever supplied a photo. The API called `publishLinkPost(...)` without its
optional `pictureUrl` argument even though the function supports one, and the
composer's own Preview section returned no media for this format regardless. **Fix:**
the fan-out route now resolves a cover photo from the collection's own products (first
one with a photo) and passes it through to Facebook; the composer fetches the same
collection detail for the link sub-format (previously only fetched for the carousel
sub-format) and shows that same cover photo in the Preview.

**Files:** `apps/api/src/routes/retailers/retailers-social/retailers-social-fanout.ts`,
`apps/mobile/app/social/create.tsx`,
`apps/mobile/src/components/social/collection-carousel.ts`

---

## Verification

- `apps/api` — `retailers-social-fanout.test.ts` (50/50), `auth-otp-bypass.test.ts`
  (11/11), `auth-msg91.test.ts` (12/12), `tsc --noEmit` clean.
- `apps/mobile` — `collection-carousel.test.ts` (7/7), `auth/*` tests (10/10),
  `tsc --noEmit` clean, `expo lint` clean on every touched file.
- No pre-existing code paths were changed beyond what's described above (bug-fix
  scoped diffs only — no refactors, no unrelated cleanup).

## Still open / not done here

- Matching rows in the `CLAUDE.md` Root-Cause Tracker (§ RC-### table) and What's-Built
  index — `CLAUDE.md` requires explicit human approval to edit per the AI Agent
  Operational Control Policy, so those rows are left for the owner to add (same as the
  prior 2026-09-11 session left RC-018/RC-019).
- The #3 safe-area report — no code fix applied since no regression was found; see
  above for what to check next if it recurs on a confirmed-current build.
- The stray fabric-chip overlap in screenshot 90 — not reproduced from code; needs a
  screen recording if it keeps happening.
