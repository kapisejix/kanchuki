# Kanchuki — Google Play Store Launch Checklist (consolidated)

**Status snapshot: 2026-09-12.** Re-verified this session against `c7d85382` and
the shipped `.aab` (run `34619372677`). The original pass was 2026-08-10 against
`b29b316`; **six answers had gone stale since** — five because later work
contradicted them, one plain drift — each called out inline in §2, §3, §6 and §7.

It consolidates the Data Safety form answers, the content-rating questionnaire,
the closed-testing requirement, and the target-API timeline into one actionable
checklist.

**App identity**

| Item | Value |
|---|---|
| Android package | `app.kanchuki.retailer` |
| App name | Kanchuki |
| EAS project ID | `ecad74e1-8f22-4c83-9043-a9fbd33e62a9` |
| Privacy policy URL | `https://kanchuki.app/privacy` |
| Account-deletion URL | `https://kanchuki.app/account-deletion` |
| Billing (web-only, Play-compliant) | `https://kanchuki.app/billing` |
| Support email | `support@kanchuki.app` |
| Play developer account | **Yours** — register + $25 + identity verification (govt ID / D-U-N-S) |

> ✅ **Target API level — resolved (see §5).** New apps submitted after
> Aug 31, 2026 must target **API 36**. Expo SDK 54 already defaults to
> `targetSdkVersion` 36 (`expo-modules-core` Gradle plugin; no override in
> `android/gradle.properties`), so the app is compliant with no SDK 55 bump
> and no Play Console extension request.

---

## 1. Store listing (Play Console)

| # | Item | Status |
|---|---|---|
| 1.1 | App name, short & full descriptions, primary category (**Business**) | Copy drafted — paste-ready in `PLAY-STORE-LISTING.md`; enter into Console |
| 1.2 | Icon (in `apps/mobile/app.json`) done; feature graphic 1024×500 still needs a design pass — `generate-brand-assets.mjs` only builds web icons, not the feature graphic | Icon done, graphic Yours |
| 1.3 | Phone screenshots (min 2; 8 recommended) — shot list in `PLAY-STORE-LISTING.md`; capture from next EAS build on a seeded demo store | Yours |
| 1.4 | Contact details + `support@kanchuki.app` | Yours |
| 1.5 | Content rating questionnaire (see §4) | Yours |

## 2. Data Safety form — exact answers

**Entry question:** *Does your app collect or share users' personal or sensitive
user data?* → **Yes**

Privacy policy URL: `https://kanchuki.app/privacy` (updated Aug 10, 2026 —
discloses KYC/Aadhaar photos, body-measurement photos, AI-provider processing,
GST retention; matches this form). **Must also disclose store-location capture
(see below) — added back in commit `b4270e4`.**

### Declared data types

For each: **Collected** ✓ / **Not shared** · Encrypted in transit **Yes** ·
User can request deletion **Yes** (Settings → Delete Account + web page).

| Data type | Required/Optional | Purpose |
|---|---|---|
| **Location — precise** | ✓ **DECLARED** · Optional | App functionality — retailer taps "Get Location" in onboarding to pin the shop; the shop's lat/long shows a Google Maps directions link on the customer storefront. One-shot foreground capture, not tracked. |
| **Location — approximate** | ✓ **DECLARED** · Optional | Same as precise — Android grants coarse alongside fine. |
| Personal info — Name | Required | App functionality, Account management |
| Personal info — Email address | Optional | App functionality |
| Personal info — Phone number | Required | App functionality, Account management |
| Personal info — Address | Optional | App functionality |
| Personal info — Other info (GSTIN) | Optional | App functionality, Fraud prevention/security/compliance |
| Photos & videos — Photos (product, KYC/Aadhaar) | Required | App functionality, Personalization |
| App activity — Other user-generated content (customer preferences, budget, notes) | Optional | App functionality, Personalization |
| **Crash logs** | ✓ **DECLARED** (was missing) | App functionality — Sentry crash + native-crash reports; see the Sentry note below |
| **Diagnostics** | ✓ **DECLARED** (was missing) | App functionality — ANR/stall tracking, frame drops, performance traces |
| **App activity — App interactions** | ✓ **DECLARED** (was missing) | App functionality — Sentry user-interaction tracing (taps, navigation breadcrumbs) |

**Location note:** `expo-location` is used only in onboarding (`app/onboarding.tsx`,
`handleGetLocation`) — `requestForegroundPermissionsAsync` + one
`getCurrentPositionAsync` + `reverseGeocodeAsync` to auto-fill the address. Value
stored as `retailers.latitude`/`longitude`, surfaced on `/c/[slug]` as a
`maps/dir/?api=1&destination=` link. No background location, no tracking, no
`ACCESS_BACKGROUND_LOCATION`.

**Changed since August — the three `DECLARED` rows added above.** This doc used to
list crash logs / diagnostics / app-interaction analytics as *not collected*, on the
grounds that there was "no crash SDK". That stopped being true on 2026-09-04
(`3ede356`), when `@sentry/react-native` was wired into the mobile app. It is active
in every release build, so those rows have to be declared.

**Not declared (verified — no SDK or code collects):** financial info (Razorpay
hosted pages only), **advertising ID** (`plugins/withRemoveAdId.js` strips
`com.google.android.gms.permission.AD_ID` — keep Play Console → Data safety →
advertising ID set to **No**, and flip it in the *same* release that ships the
strip, never before), device IDs (no device-ID SDK), messages, contacts, calendar,
audio (`recordAudioAndroid: false`), files & docs, web browsing.

### Sentry — what actually leaves the device (added 2026-09-12)

`initSentry()` is called at **module scope** in `app/_layout.tsx`, with a live
production DSN compiled in from `eas.json` and `android-release.yml`. It is not
conditional on a dev flag, so treat all of this as active in production:

| Enabled | Config |
|---|---|
| JS + native crash capture | `enableNativeCrashHandling` — exceptions, native crashes, unhandled rejections |
| ANR / stall / frame tracking | `enableStallTracking`, `enableNativeFramesTracking` |
| Performance tracing | `tracesSampleRate: 0.2` in production (1.0 in dev) |
| Session Replay | `replaysSessionSampleRate: 0.1`, `replaysOnErrorSampleRate: 1.0` |
| Screenshot + view hierarchy on error | `attachScreenshot`, `attachViewHierarchy` |
| User-interaction tracing | `enableUserInteractionTracing` (taps, navigation breadcrumbs) |
| Auto session tracking | `enableAutoSessionTracking`, 30s interval |

Deliberately **not** sent: `sendDefaultPii: false`, so no IP address; and the
`beforeSend` hook deletes the `Authorization` / `x-admin-key` headers and masks any
10-digit string in breadcrumbs (phone numbers). `setSentryUser()` exists but has
**no call sites** in the app, so no retailer id or shop name is attached to events
today — if that is ever wired up, add **Personal info → User IDs** here.

> ⚠️ **Session Replay is the one to think about before signing the form.** It
> reconstructs the screen, and `replaysOnErrorSampleRate: 1.0` means a crash on a
> screen showing phone numbers or GSTIN is always captured. The config sets no
> explicit masking options, so whether that text is masked is whatever the SDK's
> default is. Confirm it in Sentry → your project → Replay settings rather than
> assuming — "crash logs" understates a screen recording.

**AI-provider note:** photos are transmitted to Claude/OpenAI/Gemini/NVIDIA for
tagging, background cleanup, and measurement extraction. These are service
**processors** (no training, no independent use) → answered as **Collected, not
shared**. Keep contracts on standard API ToS that exclude training.

### Security section

| Question | Answer |
|---|---|
| All user data encrypted in transit? | **Yes** (HTTPS/TLS) |
| Mechanism for users to request deletion? | **Yes** — in-app Settings → Delete Account + `kanchuki.app/account-deletion` |

## 3. Permissions

**The list below was stale.** It previously named `READ_MEDIA_IMAGES` and
`READ_EXTERNAL_STORAGE` as app permissions; `8de9ff91` **blocked** both when the
gallery save moved to write-only.

**What `apps/mobile/app.json` declares:**

- `android.permission.CAMERA` — explicit, from `expo-camera`
- `ACCESS_FINE_LOCATION` · `ACCESS_COARSE_LOCATION` — auto-added by `expo-location`;
  foreground-only, one-shot store pin in onboarding (matches §2's Location rows)
- `WRITE_EXTERNAL_STORAGE` — from `expo-media-library` (gallery save)
- whatever `@sentry/react-native` and `react-native-fbsdk-next` bring in

**Explicitly blocked** since `8de9ff91`: `READ_MEDIA_IMAGES` ·
`READ_MEDIA_VIDEO` · `READ_MEDIA_AUDIO` · `READ_EXTERNAL_STORAGE`. `expo-camera` is
configured `recordAudioAndroid: false`, and `plugins/withRemoveAdId.js` strips
`com.google.android.gms.permission.AD_ID`.

> ⚠️ **Read the authoritative list from Play Console before submitting:** your app →
> **App bundle explorer** → the uploaded version → **Permissions**. That is the list
> the automated scan compares against your form answers, and it is the only place it
> is trustworthy — see the note below on why the `.aab` on disk is misleading.
>
> **Specifically confirm `RECORD_AUDIO`.** §2 and §7 assert the app does not use the
> microphone, and this doc previously claimed it was "trimmed" — but
> `android.permission.RECORD_AUDIO` **is** present in the shipped `.aab`'s manifest.
> A removed permission can still leave its name behind (that is exactly how
> `withRemoveAdId.js` works), so that presence neither proves nor disproves anything.
> If Console shows it active, §2 and §7 both need to change.

**Why the `.aab` is not authoritative:** permissions removed via
`tools:node="remove"` are expressed as a `<uses-permission android:name="…">` node
carrying a removal marker, so the name remains in the manifest as a string. A scan
of the file therefore cannot distinguish *declared* from *removed* — reading it out
of the bundle is how this section went wrong the first time.

## 4. Content rating questionnaire (IARC)

**Category:** Business / Productivity / Tools

**Expected rating: 12+ (Teen / PEGI 12)** — driven by *unfiltered
user-generated content* (retailer product catalogs published to public
storefront URLs). This is honest and normal for a B2B app. Do **not** claim
"fully moderated" to chase 3+ — there is no content-moderation pipeline.

| Question | Answer |
|---|---|
| Alcohol, tobacco, drugs | No |
| Violence (cartoon/realistic/blood) | No |
| Sex & nudity | No |
| Language / profanity | No |
| Horror / fear | No |
| Gambling (simulated or real) | No |
| Unrestricted web access | No (curated links only: kanchuki.app, WhatsApp, policy, support) |
| User-generated content | **Yes** (product catalogs) |
| → Content filtered/moderated before sharing | **No** → drives 12+ |
| Share user's location with other users | No (the retailer's *own shop* address is published on their storefront by their choice — not personal location sharing between users) |
| Digital purchases — physical goods/services | **Yes** (paid catalog-upload service via Razorpay; the removed customer checkout/orders flow never fed this answer) |
| Digital purchases — in-app digital content | **No** (subscriptions/add-ons moved to web billing) |
| Ads | No |
| Facial/voice recognition | No |
| Personal data: name/email/phone/address/photos/videos/ID numbers | Yes |
| Personal data collected: location | **Yes** — precise, foreground-only, optional (store pin; see §2) |
| Personal data: audio/health/financial/contacts/messages/browsing | No |
| Personal data shared with third parties | No (AI processors only) |

## 5. Target API level — ✅ resolved

| Date | Requirement | Kanchuki status |
|---|---|---|
| After **Aug 31, 2026** | New apps target **API 36** | ✅ Expo SDK 54 defaults `targetSdkVersion` 36 |

No action. `expo-modules-core`'s Gradle plugin
(`useDefaultAndroidSdkVersions` → `compileSdk`/`targetSdk` 36, `minSdk` 24) and
no override in `apps/mobile/android/gradle.properties` mean production builds
already target API 36. No SDK 55 bump, no Play Console extension request.

## 6. Closed testing → production access

1. Build with `eas build --platform android --profile production` (picks up all
   current changes).
2. Upload the `.aab` to a **closed testing track** in Play Console.
3. Add **≥20 testers** (opt-in link; any 20 emails — can be your own accounts).
4. Keep the test version live for **14 consecutive days** (testers should
   actually install + use it; Google checks participation).
5. When the 14 days are up, request **production access** in the Play Console →
   review (usually 7 days or less).
6. After approval: promote the same AAB to production.

> The closed-test build is also the one Play's pre-review scan checks against
> your Data Safety answers — make sure §2's two Location rows are declared
> *before* uploading. Location is **back in** this build (the optional store pin,
> `b4270e4`); this line previously said "post-location-removal build", which would
> have left them undeclared.

## 7. Launch-critical things already handled

No action needed on these **except the three ⚠️ items**, which this re-verification
surfaced and which need a Console check or a form edit before submitting.

- ✅ Play Billing compliance — app has **no in-app purchases**; subscriptions/add-ons
  sold on `kanchuki.app/billing` (web OTP login). The one in-app payment
  (catalog-upload service) is a physical on-site service, Play-exempt.
- ✅ Privacy policy — public, current, matches the Data Safety form.
- ✅ Account deletion — in-app (Settings, typed DELETE) + web page.
- ⚠️ **`RECORD_AUDIO` unconfirmed — verify in Console (§3).** Not to be assumed
  either way: its name is still in the shipped `.aab`'s manifest.
- ⚠️ **Location is NOT trimmed.** `expo-location` is still used for the optional
  store pin (`app/onboarding.tsx`), which is why §2 declares it. This line used to
  claim location was trimmed, which contradicted §2.
- ✅ App signing/icon/adaptive icon/splash configured; `eas.json` production
  profile → `api.kanchuki.app`.
- ⚠️ Migrations **in the repo** run through `099` (`packages/db/prisma/migrations`) —
  this line previously said 048, which was five weeks of drift. Confirm the admin
  runner has applied them in prod (`_prisma_migrations` needed reconciling through
  089 in the past) before building against them.

## 8. Post-launch reminders

- **Billing rule (doesn't change):** when paid plans return, they must be either
  (a) billed on the web via Razorpay (as now) or (b) in-app via Google Play
  Billing — **never** in-app via Razorpay. Adding billing later costs no extra
  review step beyond the normal update review.
- Every app update re-runs Play review; keep the Data Safety form in sync if
  data collection changes.

---

Related docs: `docs/HOSTING-AND-APP-STORE-GUIDE.md` (hosting + store strategy),
`docs/LAUNCH-READINESS-AUDIT.md` (general launch audit), `docs/SECURITY.md`
(governance).
