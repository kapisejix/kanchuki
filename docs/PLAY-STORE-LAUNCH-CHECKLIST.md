# Kanchuki — Google Play Store Launch Checklist (consolidated)

**Status snapshot: August 10, 2026.** Everything in this doc is grounded in the
current codebase (commit `b29b316`). It consolidates the Data Safety form
answers, the content-rating questionnaire, the closed-testing requirement, and
the target-API timeline into one actionable checklist.

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
| 1.1 | App name, short & full descriptions, primary category (**Business**) | Yours |
| 1.2 | Icon + feature graphic (Loom brand assets exist in `scripts/generate-brand-assets.mjs`) | Mostly done |
| 1.3 | Phone screenshots (min 2; 8 recommended — product catalog, scan-to-sell, customer list, settings) | Yours |
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
| Personal info — Other info (GSTIN, body measurements) | Optional | App functionality, Fraud prevention/security/compliance |
| Photos & videos — Photos (product, KYC/Aadhaar, measurement) | Required | App functionality, Personalization |
| App activity — Other user-generated content (customer preferences, budget, notes) | Optional | App functionality, Personalization |

**Location note:** `expo-location` is used only in onboarding (`app/onboarding.tsx`,
`handleGetLocation`) — `requestForegroundPermissionsAsync` + one
`getCurrentPositionAsync` + `reverseGeocodeAsync` to auto-fill the address. Value
stored as `retailers.latitude`/`longitude`, surfaced on `/c/[slug]` as a
`maps/dir/?api=1&destination=` link. No background location, no tracking, no
`ACCESS_BACKGROUND_LOCATION`.

**Not declared (verified — no SDK or code collects):** financial info (Razorpay
hosted pages only), crash logs / diagnostics (no crash SDK), device IDs (no
device-ID SDK), messages, contacts, calendar, audio (`recordAudioAndroid: false`),
files & docs, web browsing, app-interaction analytics.

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

No microphone. Location is foreground-only (store pin in onboarding):

`CAMERA` · `READ_MEDIA_IMAGES` · `READ_EXTERNAL_STORAGE` ·
`ACCESS_FINE_LOCATION` · `ACCESS_COARSE_LOCATION` (auto-added by `expo-location`)

The AAB uploaded for testing must come from the **next EAS build**. Play's
automated scan compares the binary against the declared form answers — the
location permissions must match the "Location — precise/approximate" rows
declared in §2.

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
> your Data Safety answers — make sure it's the post-location-removal build.

## 7. Launch-critical things already handled (no action)

- ✅ Play Billing compliance — app has **no in-app purchases**; subscriptions/add-ons
  sold on `kanchuki.app/billing` (web OTP login). The one in-app payment
  (catalog-upload service) is a physical on-site service, Play-exempt.
- ✅ Privacy policy — public, current, matches the Data Safety form.
- ✅ Account deletion — in-app (Settings, typed DELETE) + web page.
- ✅ `RECORD_AUDIO` trimmed; location trimmed (Aug 10, 2026).
- ✅ App signing/icon/adaptive icon/splash configured; `eas.json` production
  profile → `api.kanchuki.app`.
- ✅ Migrations applied through 048.

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
