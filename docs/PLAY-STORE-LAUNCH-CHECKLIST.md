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
`com.google.android.gms.permission.AD_ID` — answer **App content → Advertising ID**
and the **Data safety** advertising-ID row **No**, and flip both in the *same*
release that ships the strip, never before; see §3 for the exact steps and why the
order matters), device IDs (no device-ID SDK), messages, contacts, calendar,
audio (see "Audio" below — not collected, but the permission *is* declared), files
& docs, web browsing.

### Audio — the form answers "No" even though the permission is declared

**Decision (2026-09-12): do NOT declare audio on the Data safety form.** The form asks
what the app *collects or shares*, and no audio is captured at all — there is no
`expo-audio` or `expo-av` dependency, no `recordAsync`, no `requestAudioPermissions`,
and all four `CameraView` call sites (`product/add.tsx`, `product/scan.tsx`,
`product/[id]/add-photos.tsx`, `product/[id]/add-color.tsx`) are photo/barcode capture,
not `mode="video"`. `expo-video` is playback-only. Declaring audio would over-claim
collection, which is its own inaccuracy.

**But the permission genuinely IS declared, and `recordAudioAndroid: false` is why that
was missed for so long.** That option removes nothing: `expo-camera`'s plugin only calls
`AndroidConfig.Permissions.withPermissions(config, ['android.permission.CAMERA',
recordAudioAndroid && 'android.permission.RECORD_AUDIO'].filter(Boolean))` — so when the
flag is false it merely declines to *add* the permission. It never removes the
declaration `expo-camera`'s own library manifest (`android/src/main/AndroidManifest.xml`)
makes unconditionally, and a library manifest merges in regardless. The option is a
no-op for removal, so `RECORD_AUDIO` was always going to reach the bundle. Confirmed by
decoding the shipped bundles: it is present in versionCode 4, and since removal markers
leave no trace (§3), its presence proves a real declaration rather than a leftover.
Data safety is about collected/shared data, so this does *not* force an audio row — but
the permission is not decorative either.

**To actually remove it** (optional; needs a rebuild): add
`"android.permission.RECORD_AUDIO"` to `expo.android.blockedPermissions` in
`apps/mobile/app.json` — the same mechanism that already removes the `READ_MEDIA_*`
group. Until then the store listing advertises a Microphone permission the app never
exercises, which a reviewer may query.

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
> **`RECORD_AUDIO` — resolved 2026-09-12: it is genuinely declared.** This doc first
> claimed it was "trimmed", then hedged that its presence proved nothing. It does prove
> something: removal leaves no trace (see the correction below), so the permission in
> the shipped `.aab` is real. It comes from `expo-camera`'s library manifest, and
> `recordAudioAndroid: false` does not strip it. §2 "Audio" has the root cause, the Data
> safety decision, and how to remove it; §2 and §7 have both been updated.

**Why the `.aab` **is** authoritative — corrected 2026-09-12 (this section had it backwards).**
It previously claimed that a permission removed via `tools:node="remove"` leaves its
name behind in the bundle as a removal marker, so a scan of the `.aab` could not tell
*declared* from *removed*. **Measured against the real bundles, that is false.**
`tools:*` are build-time directives the manifest merger consumes: the merged manifest
inside the AAB declares no `tools` namespace at all, and a removed permission is
gone completely — the same bundles prove it, because `READ_MEDIA_IMAGES` carries a
remove marker in the source manifest and appears nowhere in the shipped versionCode 4
manifest. So absence proves removal, and presence proves a real declaration.

Decoded from `base/manifest/AndroidManifest.xml` in the downloaded CI artifacts:

| AAB versionCode | `com.google.android.gms.permission.AD_ID` |
|---|---|
| 1 | **DECLARED** |
| 2 | **DECLARED** |
| 3 | absent |
| 4 | absent |

That is the expected history — the strip landed in `b1ccefce` (2026-09-10), *after*
versionCode 2. It also settles the open `RECORD_AUDIO` question below: `RECORD_AUDIO`
**is** present in versionCode 4, so it is genuinely declared, not a leftover marker.

> The residual caveat: the `.aab` holds the *merged* manifest, which is not
> necessarily byte-for-byte what Play's automated scan reads. App bundle explorer
> remains the tie-breaker.

**Verify it yourself, no Console needed (added 2026-09-12):**

```
node scripts/inspect-aab-manifest.mjs --aab path/to/app-release.aab
```

Decodes the merged manifest and prints the package, `versionCode`, the full
permission list grouped by family, the AD_ID verdict, plus `--json` for a
machine-readable dump and `--strict` to exit non-zero when AD_ID is declared.

**Read permission counts carefully — a naive grep of the `.aab` is wrong in both
directions.** For versionCode 4 the three categories are:

| Category | Count | Meaning |
|---|---|---|
| `uses-permission` / `uses-permission-sdk-23` | **18** | actually requested — what the Data safety form is compared against |
| `<permission>` declarations | 1 | offered to *other* apps (`…DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`) |
| `android:permission` on a component | 2 | required **of callers** — `DUMP` on a `<receiver>`, `BIND_JOB_SERVICE` on a `<service>` |

A regex for `\.permission\.[A-Z_]+` returns 19 for this bundle, which is *neither*
number: it over-counts the two caller requirements and misses the custom permission
entirely (that name contains no `.permission.` segment). The two errors happen to
cancel, so 19 looks plausible. **18 is the number that matters.**

### Clearing the "Incomplete advertising ID declaration" Play block

Surfaced 2026-09-12 on the versionCode 4 upload from `10c8f2d`:

> Incomplete advertising ID declaration. All developers targeting Android 13 or later
> are required to let us know if their app uses advertising ID.

This is a **Console form that was never completed**, not a manifest problem — the
strip is in the bundle. `react-native-fbsdk-next` pulls
`com.facebook.android:facebook-android-sdk:18.+`, whose `facebook-core` AAR declares
`com.google.android.gms.permission.AD_ID`. That AAR manifest is merged at Gradle
time, so the permission is visible to no `git` grep and to no `expo prebuild`, and
`plugins/withRemoveAdId.js` exists to remove it. (In `node_modules` nothing declares
it — not even `react-native-fbsdk-next`'s own manifest, which carries only an
`AD_SERVICES_CONFIG` property.)

Resolve it in two steps, **in this order**:

1. **Confirm the strip reached the bundle first.** Your app → **App bundle explorer**
   → the uploaded version → **Permissions**. `com.google.android.gms.permission.AD_ID`
   must be absent. This tab is the only place the *merged* manifest is readable — see
   the note above on why the `.aab` on disk is misleading. No new build is needed:
   versionCode 3 onward already carries the strip.
2. **Policy → App content → Advertising ID** (the error banner links there). Answer
   **No** and save.

⚠️ **The order is not optional.** Answering **No** while the permission *is* present
triggers the opposite and harder block: *"This version includes the
`com.google.android.gms.permission.AD_ID` permission, but your Play Console
declaration indicates that your app doesn't use any advertising IDs."* And an
unanswered declaration blocks rollout outright — *"You cannot rollout releases
targeting Android 13 until you have completed this declaration."* Both messages are
Play policy, not repo state: [Advertising ID — Play Console
Help](https://support.google.com/googleplay/android-developer/answer/6048248).

**Data safety carries a separate advertising-ID row** (§2) — the two answers must
agree. This block is the **App content** declaration, not the Data safety row.

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

No action needed on these **except the two ⚠️ items**, which this re-verification
surfaced and which need a Console check or a form edit before submitting.

- ✅ Play Billing compliance — app has **no in-app purchases**; subscriptions/add-ons
  sold on `kanchuki.app/billing` (web OTP login). The one in-app payment
  (catalog-upload service) is a physical on-site service, Play-exempt.
- ✅ Privacy policy — public, current, matches the Data Safety form.
- ✅ Account deletion — in-app (Settings, typed DELETE) + web page.
- ✅ **`RECORD_AUDIO` — resolved 2026-09-12: it *is* declared.** The name in the
  shipped `.aab` is a real permission, not a leftover removal marker — removal leaves
  no trace (§3). It comes from `expo-camera`'s library manifest, and
  `recordAudioAndroid: false` does not strip it (§2 "Audio"). Data safety still answers
  **No** for audio, because nothing records it. Removing the permission itself needs an
  `app.json` `blockedPermissions` entry plus a rebuild.
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
