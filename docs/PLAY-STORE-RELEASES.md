# Play Store Release Log

> Play Console's "highest versionCode ever uploaded" is state that lives on Google's
> servers, not in this repo — nothing in git can be diffed against it. This file is
> the substitute source of truth. **Rule: before triggering any AAB build, read this
> file and use `last row's versionCode + 1`.** Add a row after every successful
> upload (Play Console accepts it, not just "build succeeded").
>
> **This rule is now enforced** — `scripts/check-android-version-code.mjs` fails both
> CI and the AAB dispatch when `app.json`'s versionCode is not higher than the last
> row below. See [CI guard](#ci-guard--the-versioncode-rule-is-enforced-not-just-documented).

## Uploads

| versionCode | version | uploaded | track | CI run | commit | notes |
|---|---|---|---|---|---|---|
| 2 | 1.0.0 | 2026-09-09 | Closed testing | `34348392715` | `6fc542ae` | media-permissions hardening, OTP keyboard fix |
| 3 | 1.0.0 | 2026-09-11 | Open testing | `34617176198` *or* `34619372677` | `c14cc6f3` *or* `0305d589` | AD_ID strip (`b1ccefce`), OTP double-send (RC-015), FB reconnect loop (RC-016), AI Studio tab bug (RC-017), AI Studio pick-reset + FB login loop fixed (RC-017/RC-018), CI lint fully green — **see the ambiguity note below** |

### 🚧 In flight — versionCode 5 is built and merged-manifest-verified, awaiting upload; versionCode 4 is superseded

`apps/mobile/app.json` was bumped to **`versionCode: 4`** on 2026-09-12, and the AAB
was built from `10c8f2d` and uploaded the same day. **Play never accepted it** — the
release is blocked in review by *"Incomplete advertising ID declaration"* (see
`PLAY-STORE-LAUNCH-CHECKLIST.md` §3), so it gets **no Uploads row**. This log records
what Play accepted, and the guard reads it.

**versionCode 4 is now superseded** and `app.json` is bumped to **`versionCode: 5`**.
Two reasons 4 could not simply be reused: `RECORD_AUDIO` was still shipping in the v4
bundle, so the fix needs a fresh build; and **Play refuses a versionCode it has already
received even if the release is discarded**, so 4 is spent regardless of whether it is
ever accepted. The v5 build carries `android.permission.RECORD_AUDIO` in
`blockedPermissions`, plus the new `scripts/check-aab-ad-id.mjs` CI step.

**v5 build — recorded at trigger time:**

| Field | Value |
|---|---|
| CI run | `34693579778` |
| Commit | `066ee6b2` |
| Triggered | 2026-09-12 12:24:25 UTC |
| Outcome | **success** (21m) — all 13 steps, including the new AD_ID guard |
| Uploaded to Play | **not yet** |

**The RECORD_AUDIO removal is now verified against the real merged manifest, not
inferred.** Decoded from the downloaded artifact with
`scripts/inspect-aab-manifest.mjs`:

| | v4 (shipped) | v5 |
|---|---|---|
| requested permissions (`uses-permission*`) | 18 | **17** |
| `android.permission.RECORD_AUDIO` | PRESENT | **absent** |
| `com.google.android.gms.permission.AD_ID` | absent | absent |
| min / target SDK | 24 / 36 | 24 / 36 |

The permission sets differ by **exactly one entry, the intended one** — removed
`RECORD_AUDIO`, nothing added. That also settles the residual doubt left when the
`blockedPermissions` entry was added: a source-manifest marker only proves the plugin
*ran*, whereas this proves it won the merge.

Still no Uploads row — that is added when Play **accepts** the release, per the rule
at the top of this file. When it is accepted, the row goes above and the next number is
reserved in the same commit.

The last accepted row above is 3, which is exactly why 4 was reserved: a rebuild at
versionCode 3 would be rejected, the same way `34612919927` built versionCode 2 after
2 was already used.

When the build is uploaded, **add a new row above with the run ID and SHA recorded at
trigger time, and reserve the next number in the same commit.**

**The rule this section previously stated was wrong** — *"do not bump until Play
accepts it, and revert `app.json` rather than skip a number"* assumes an unaccepted
release is still free to reuse. It is not: a versionCode is spent at **upload**, not at
acceptance. So the next number is reserved as soon as a build is **triggered**, and an
abandoned release is recorded as *superseded* rather than silently reverted. Reverting
would point `app.json` at a number Play has already seen, and that only surfaces at the
end of the following build cycle — the exact failure this log exists to prevent.

The bump belongs in the same commit as the row because of the invariant the CI guard
enforces: **the log holds the USED numbers, `app.json` holds the NEXT one.** The
moment 4 is recorded as used without reserving 5, `app.json` names a consumed number
and CI goes red until the next release is prepared.

### ⚠️ The versionCode 3 row is ambiguous — do not trust the commit cell

Four `android-release.yml` runs on 2026-09-11, and nobody recorded which artifact was
actually downloaded and uploaded:

| Run | Triggered (UTC) | Commit | versionCode at that HEAD | Outcome |
|---|---|---|---|---|
| `34612164008` | — | — | — | **cancelled** |
| `34612919927` | 14:54 | `ae6e32dd` | 2 | built, but versionCode 2 was already used → upload rejected |
| `34617176198` | 15:36 | `c14cc6f3` | 3 | built |
| `34619372677` | 15:59 | `0305d589` | 3 | built |

Both surviving v3 runs contain the same code (only a docs diff between them), so the
app behaves identically either way — but the provenance is unproven. **A screenshot
cannot tell you which one is installed; the build-info footer can** (see below).

### ℹ️ The AD_ID strip shipped in versionCode 3, not 2

This log previously credited **versionCode 2** with the AD_ID strip. It could not have
contained it: the plugin (`apps/mobile/plugins/withRemoveAdId.js`, `b1ccefce`) was
committed **2026-09-10**, one day *after* versionCode 2 was uploaded on 2026-09-09, and
`6fc542ae` is only a one-line versionCode bump. VersionCode 2 therefore shipped with
`com.google.android.gms.permission.AD_ID` present — merged in at Gradle build time by
the Facebook Android SDK AAR (`com.facebook.android:facebook-android-sdk:18.+` via
`react-native-fbsdk-next`), which is why no `git` grep and no `expo prebuild` can see
it.

This matters for the Play Console advertising-ID declaration: answer **No** only for a
release the strip actually reached (versionCode 3 onward). `android-release.yml` runs
`expo prebuild --clean` before Gradle, so every CI-built AAB from `b1ccefce` onward
carries it — confirm under App bundle explorer → the uploaded version →
**Permissions**, which reads the merged manifest and is the only trustworthy place to
check.

## CI guard — the versionCode rule is enforced, not just documented

`scripts/check-android-version-code.mjs` compares `apps/mobile/app.json`'s
`expo.android.versionCode` against the highest versionCode in the **Uploads** table
above, and fails unless it is strictly higher. It runs in two places:

| Where | When | Why there |
|---|---|---|
| `.github/workflows/ci.yml` (`quality`) | every push / PR | catches the mistake at review time, before a release is ever triggered |
| `.github/workflows/android-release.yml` | at dispatch, before the install, prebuild and Gradle steps | a doomed build dies in seconds instead of after ~10 minutes |

This exists because the failure it prevents is invisible until the worst moment: Play
accepts or rejects an upload at the END of the cycle, so a stale number wastes the
whole build. That has already happened twice — `34612919927` built versionCode 2 when
2 was in use, and on 2026-09-12 `app.json` was found sitting at versionCode 3 while 3
was already live.

It **fails closed**: an unreadable `app.json`, a non-integer versionCode, a missing
`## Uploads` section, or a table whose rows carry no upload date are all failures
rather than silent passes. In particular a row has to carry an upload date to count,
which is what keeps the ambiguous-builds table above from being read as an upload —
the guard that read it as one produced a false `versionCode 34619372677`.

Run it locally the same way CI does:

```
node scripts/check-android-version-code.mjs
```

## How to trace an installed build back to its CI run

The footer at the bottom of mobile Settings reads `BUILD <7-char-sha>` with
`<channel> · <YYYY-MM-DD HH:MM UTC>` beneath it; tapping it copies
`build <7-char-sha> · ci · <UTC>`. Then:

```
gh run list --workflow=android-release.yml --limit 10 \
  --json databaseId,headSha,createdAt,conclusion
```

Match the footer's SHA against `headSha`. That is the whole point of the footer —
before it existed, "I rebuilt and it still doesn't work" was unverifiable because
nothing tied an installed binary to a commit.

## Rule added 2026-09-12

**Record the run ID and commit SHA in the upload row at the moment you trigger the
build, not afterwards.** Reconstructing it after the fact is what produced the
ambiguous v3 row above. If you trigger a build and then trigger another before
uploading, the second one overwrites your only signal of which is which.

If the artifact is ever in doubt, the signing certificate identifies it without any
Play Console access — see `docs/references/guides/meta-facebook-login-setup.md` §3, "Verifying which
key signed a shipped `.aab`".

## Verified provenance (2026-09-12)

The `app-release-aab` artifact from run `34619372677` was downloaded and its
signature block inspected. It is signed by the upload key with SHA-1
`16:3B:21:32:B6:DB:00:C4:0D:AF:04:2F:ED:10:3D:8D:87:CC:AF:45`
(Meta key hash `FjshMrbbAMQNrwQv7RA9jYfMr0U=`), alias `f8de0ed2…`, signature file
`META-INF/F8DE0ED2.RSA`.

Two things this establishes:

1. The CI secret `ANDROID_KEYSTORE_BASE64` holds the **same** keystore as the local
   EAS copy `apps/mobile/@s.numbhraal__kanchuki.jks` — a fact GitHub secrets cannot
   otherwise reveal, since they are write-only.
2. `apps/mobile/@s.numbhraal__kanchuki_OLD_1.jks` is **not** a rotated key: it holds
   the identical certificate and 2026-09-02 → 2054 validity. Nothing needs
   re-registering because of it.

Note this is the **upload** key. Testers installing from Play get an app re-signed by
Google's **Play App Signing** key, whose hash is a different value that only the Play
Console shows — both must be registered with Meta. See
`docs/references/guides/meta-facebook-login-setup.md` §3.

---

## Play Store Launch Checklist

> Merged from the former `docs/references/guides/play-store-launch-checklist.md`.


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

#### 1. Store listing (Play Console)

| # | Item | Status |
|---|---|---|
| 1.1 | App name, short & full descriptions, primary category (**Business**) | Copy drafted — paste-ready in `PLAY-STORE-LISTING.md`; enter into Console |
| 1.2 | Icon (in `apps/mobile/app.json`) done; feature graphic 1024×500 still needs a design pass — `generate-brand-assets.mjs` only builds web icons, not the feature graphic | Icon done, graphic Yours |
| 1.3 | Phone screenshots (min 2; 8 recommended) — shot list in `PLAY-STORE-LISTING.md`; capture from next EAS build on a seeded demo store | Yours |
| 1.4 | Contact details + `support@kanchuki.app` | Yours |
| 1.5 | Content rating questionnaire (see §4) | Yours |

#### 2. Data Safety form — exact answers

**Entry question:** *Does your app collect or share users' personal or sensitive
user data?* → **Yes**

Privacy policy URL: `https://kanchuki.app/privacy` (updated Aug 10, 2026 —
discloses KYC/Aadhaar photos, body-measurement photos, AI-provider processing,
GST retention; matches this form). **Must also disclose store-location capture
(see below) — added back in commit `b4270e4`.**

##### Declared data types

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

##### Audio — the form answers "No" even though the permission is declared

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

**Resolved 2026-09-12 — removed, and verified against a real merged manifest.**
`"android.permission.RECORD_AUDIO"` is now in `expo.android.blockedPermissions` in
`apps/mobile/app.json` (the same mechanism that already removes the `READ_MEDIA_*
group`), and versionCode 5 — built from `066ee6b2` (CI run `34693579778`) — no longer
declares it. Decoded with `scripts/inspect-aab-manifest.mjs`:

| | v4 (shipped) | v5 |
|---|---|---|
| requested permissions | 18 | **17** |
| `RECORD_AUDIO` | PRESENT | **absent** |

v4 and v5 differ by **exactly one permission, the intended one** — nothing added.
The microphone permission had shipped in **every** release from v1 to v4 (measured on
all five bundles), so this is the first build without it; the store listing therefore
advertised a Microphone permission the app never used up to and including v4.

##### Sentry — what actually leaves the device (added 2026-09-12)

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

##### Security section

| Question | Answer |
|---|---|
| All user data encrypted in transit? | **Yes** (HTTPS/TLS) |
| Mechanism for users to request deletion? | **Yes** — in-app Settings → Delete Account + `kanchuki.app/account-deletion` |

#### 3. Permissions

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
> **`RECORD_AUDIO` — resolved 2026-09-12: it was genuinely declared, and is now
> removed.** This doc first claimed it was "trimmed", then hedged that its presence
> proved nothing. It does prove something: removal leaves no trace (see the correction
> below), so the permission in the shipped `.aab` was real. It came from `expo-camera`'s
> library manifest, and `recordAudioAndroid: false` never stripped it. It is now in
> `blockedPermissions` and absent from versionCode 5 — verified on the built bundle, not
> inferred. §2 "Audio" has the root cause, the Data safety decision, and the v4/v5 diff;
> §2 and §7 have both been updated.

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

| AAB versionCode | requested | `…permission.AD_ID` | `…permission.RECORD_AUDIO` |
|---|---|---|---|
| 1 | 23 | **DECLARED** | present |
| 2 | 23 | **DECLARED** | present |
| 3 | 18 | absent | present |
| 4 | 18 | absent | present |
| **5** | **17** | absent | **absent** — removed |

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

##### Clearing the "Incomplete advertising ID declaration" Play block

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

#### 4. Content rating questionnaire (IARC)

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

#### 5. Target API level — ✅ resolved

| Date | Requirement | Kanchuki status |
|---|---|---|
| After **Aug 31, 2026** | New apps target **API 36** | ✅ Expo SDK 54 defaults `targetSdkVersion` 36 |

No action. `expo-modules-core`'s Gradle plugin
(`useDefaultAndroidSdkVersions` → `compileSdk`/`targetSdk` 36, `minSdk` 24) and
no override in `apps/mobile/android/gradle.properties` mean production builds
already target API 36. No SDK 55 bump, no Play Console extension request.

#### 6. Closed testing → production access

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

#### 7. Launch-critical things already handled

No action needed on these **except the two ⚠️ items**, which this re-verification
surfaced and which need a Console check or a form edit before submitting.

- ✅ Play Billing compliance — app has **no in-app purchases**; subscriptions/add-ons
  sold on `kanchuki.app/billing` (web OTP login). The one in-app payment
  (catalog-upload service) is a physical on-site service, Play-exempt.
- ✅ Privacy policy — public, current, matches the Data Safety form.
- ✅ Account deletion — in-app (Settings, typed DELETE) + web page.
- ✅ **`RECORD_AUDIO` — resolved 2026-09-12: it *was* declared, and is now removed.**
  The name in the shipped v1–v4 bundles was a real permission, not a leftover removal
  marker — removal leaves no trace (§3). It came from `expo-camera`'s library manifest,
  and `recordAudioAndroid: false` never stripped it (§2 "Audio"). The
  `app.json` `blockedPermissions` entry is in place and versionCode 5 no longer declares
  it (17 permissions vs v4's 18). Data safety answers **No** for audio either way,
  because nothing records it.
- ⚠️ **Location is NOT trimmed.** `expo-location` is still used for the optional
  store pin (`app/onboarding.tsx`), which is why §2 declares it. This line used to
  claim location was trimmed, which contradicted §2.
- ✅ App signing/icon/adaptive icon/splash configured; `eas.json` production
  profile → `api.kanchuki.app`.
- ⚠️ Migrations **in the repo** run through `099` (`packages/db/prisma/migrations`) —
  this line previously said 048, which was five weeks of drift. Confirm the admin
  runner has applied them in prod (`_prisma_migrations` needed reconciling through
  089 in the past) before building against them.

#### 8. Post-launch reminders

- **Billing rule (doesn't change):** when paid plans return, they must be either
  (a) billed on the web via Razorpay (as now) or (b) in-app via Google Play
  Billing — **never** in-app via Razorpay. Adding billing later costs no extra
  review step beyond the normal update review.
- Every app update re-runs Play review; keep the Data Safety form in sync if
  data collection changes.

---

Related docs: `docs/references/guides/hosting-and-app-store.md` (hosting + store strategy),
`docs/references/history/reports/launch-readiness-audit.md` (general launch audit), `docs/SECURITY.md`
(governance).

---

## Play Store Listing Copy

> Merged from the former `docs/references/guides/play-store-listing.md`.


Companion to `docs/references/guides/play-store-launch-checklist.md` §1. Copy below is written
to the **current** feature set — no Virtual Try-On, no "Fashion DNA matching",
no showroom booking (all removed in `chore/remove-unwanted-features`). Keep it
in sync with the marketing pages (`apps/web/src/app/for-retailers`,
`how-it-works`, `pricing`).

---

#### App name

```
Kanchuki
```

#### Primary category

**Business** (content rating category: Business / Productivity / Tools — see checklist §4)

#### Short description (max 80 chars)

```
AI photo catalog + WhatsApp collections for Indian clothing shops. No website.
```
(76 chars)

#### Full description (max 4000 chars)

```
Kanchuki turns your clothing shop into an online store you run from your phone —
no website, no computer, no tech skills.

Take a photo of a dress. Kanchuki writes the catalog entry, cleans up the photo,
and gives you a link to share on WhatsApp. Your customers browse it like a real
store and message you when they want something.

WHAT THE APP DOES

- The catalog that writes itself - photograph a garment and AI fills in category,
  subtype, colour, fabric and occasion, writes a short description, suggests a
  name and generates a SKU. Edit anything it gets wrong; your picks always win.

- Photos that look like a big brand's - background removal, auto-contrast
  backdrops, ghost-mannequin fill for hollow necklines, rotate and retouch.
  No photographer needed.

- Sell on WhatsApp - pick the pieces you want to show, get a collection link,
  share it. Customers browse, favourite and tap Enquire to message you directly.
  No app for them to install.

- Your own store page - every shop gets a free storefront at its own link, with
  your shop name, logo and categories, plus a QR code you can print for the
  counter.

- Know your customers - save each customer's colour, style, budget and occasions,
  so your next WhatsApp shows them the right things.

- In-store AI search - type "pink cotton suit under 2000" and find any piece on
  your racks in seconds. Understands Hindi-transliterated terms too.

- Scan-to-sell - print the SKU + QR tag for each design. When a piece sells, scan
  the tag and it's marked SOLD, even if your internet is down. Syncs when you're
  back online.

- Offline-first - built for shops where the network is patchy. Browse your
  catalog and change a product's status; it queues up and syncs when the
  connection returns.

- Bulk onboarding - got hundreds or thousands of SKUs from a supplier? Import the
  supplier PDF/catalog, or shoot your racks shelf-by-shelf and let AI detect each
  item.

- Team logins - add staff with their own accounts so a helper can scan-to-sell or
  add products without touching your account.

BUILT FOR INDIA

- INR pricing only, UPI first (Google Pay, PhonePe, Paytm), cards and netbanking
- GST invoices for every payment
- Works on a low-cost Android phone with a patchy connection

PRICING

14-day free trial, no credit card. Plans start low and scale with your catalog
size. Subscriptions are managed on kanchuki.app/billing.

Privacy policy: https://kanchuki.app/privacy
Delete your account: https://kanchuki.app/account-deletion
Support: support@kanchuki.app
```

---

#### Phone screenshots - shot list (8)

Portrait, from an EAS build on a real phone or emulator. Use a store seeded with
real-looking products (the DB is currently empty - seed a demo retailer first).

| # | Screen | Route / how to reach |
|---|--------|----------------------|
| 1 | Product catalog grid | `app/(tabs)/index.tsx` - catalog tab, ~8 products visible |
| 2 | Add product - AI tagging running in background | `app/product/add.tsx` after tapping Save (AI chip "tagging...") |
| 3 | Photo cleanup result (before/after background) | product detail -> photo controls |
| 4 | WhatsApp collection link - share sheet | collection builder -> Share |
| 5 | Customer list + preferences | `app/(tabs)/customers.tsx` -> a customer with colour/style/budget filled |
| 6 | In-store AI search result | search bar -> "pink cotton suit under 2000" |
| 7 | Scan-to-sell - tag scanned, marked SOLD | scan screen success state |
| 8 | Store page + QR code | Settings -> Store / QR |

Optional caption strip per screenshot (keep to ~4 words): "AI writes your
catalog", "Photos like a big brand", "Share on WhatsApp", "Know every customer",
"Find any piece fast", "Scan when it sells", "Your own store page".

#### Feature graphic (1024 x 500 px)

Not auto-generated - `scripts/generate-brand-assets.mjs` only builds the web
favicon/icon set. Needs a design pass. Content:

- Kanchuki wordmark / logo, brand palette (see `apps/web` tokens / `COLORS` module)
- Tagline: **"Your clothing shop, online - from your phone."**
- A phone mockup showing the catalog grid or a WhatsApp collection
- No text in the outer 5% safe margin; readable as a thumbnail

#### App icon

512 x 512 PNG - already in `apps/mobile` (`app.json` -> `icon` / `android.adaptiveIcon`).

---

#### Owner checklist (Play Console - cannot be done from the repo)

- [ ] Paste short + full description, set category **Business**
- [ ] Capture the 8 screenshots above from the next EAS build
- [ ] Produce the 1024x500 feature graphic
- [ ] Contact details + `support@kanchuki.app`
- [ ] Content rating questionnaire (checklist §4)
