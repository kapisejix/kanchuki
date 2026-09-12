# Meta Dashboard Setup — Facebook One-Tap Login (retailer app)

**Status:** operator runbook. Everything here is Meta-dashboard / Play-Console work —
no code change is needed for the login itself. The code side is already shipped
(see `docs/social-connect-native.md`).
**Last verified against the repo:** 2026-09-12.
**Why this exists:** "Connect Facebook" kept returning to the login screen. The code
bug behind that is fixed (RC-018), but a correct client cannot complete a login
that Meta rejects — and Meta rejects it for configuration reasons that are
invisible from inside the app. This is the list of them.

> Meta renames dashboard labels periodically. The **paths** below were correct when
> written; if a label has moved, the section still describes what you are looking
> for. When in doubt, use the app-scoped deep links in §2.

---

## 0. The short version

Three things cause "still not connected", in order of how often they bite:

| # | Cause | Where it's fixed |
|---|-------|------------------|
| 1 | The signing key hash of the **installed** app isn't registered | §3 — and read the Play App Signing trap, it is the usual real answer |
| 2 | The Facebook app isn't installed on the test device, so the SDK has nothing to hand off to | §9 |
| 3 | The Meta app is in Development mode and the test account has no role | §7 |

Meta's own error for (1) is `Invalid key hash` — but the Android SDK often just
returns **no access token** instead of surfacing it, which the app reports as:

```
Facebook returned no access token. This usually means the Android release key
hash / bundle ID is not registered on the Meta app, or the app is not in Live mode.
```

That message is accurate. Treat it as "go do §3".

---

## 1. Facts you need in hand

Already in the repo — do not re-derive these:

| Thing | Value | Source |
|---|---|---|
| Meta **App ID** | `1758308975480748` | `apps/mobile/app.json` → `react-native-fbsdk-next` plugin |
| App ID scheme | `fb1758308975480748` (must be `fb` + App ID) | same |
| Android package | `app.kanchuki.retailer` | `apps/mobile/app.json` → `android.package` |
| iOS bundle ID | `app.kanchuki.retailer` | `apps/mobile/app.json` → `ios.bundleIdentifier` |
| Web URL (for redirects) | `https://kanchuki.app` | `WEB_URL` — `docs/DEPLOY.md:164` |
| Server secrets | `META_APP_ID`, `META_APP_SECRET` | read by `apps/api/src/lib/meta-graph.ts:117` from the F-012 secrets table / env |

The **Client Token** lives at Settings → Advanced → Client token, and is already
pasted into `app.json` as `clientToken`. If you ever change Meta apps, five things
must change together — `appID`, `clientToken`, `scheme`, and `META_APP_ID` +
`META_APP_SECRET` on the API service. Miss any one and the SDK logs into one app
while the server exchanges tokens against another, which surfaces as
`Failed to obtain a long-lived token`.

> `META_APP_SECRET` is a real secret: server-side only, never in `app.json`, never
> in a doc. The client token is not — it ships inside the app binary by design.

---

## 2. Open the right app

The app that already holds `META_APP_ID` / `META_APP_SECRET`:

```
https://developers.facebook.com/apps/1758308975480748/
```

If that URL 404s, you are either signed into the wrong Facebook account or the
app has been deleted — stop and resolve that first, because every step below
writes to a specific app and a second app is how the token-exchange mismatch from
§1 happens.

---

## 3. Register the key hash (do this first)

Meta will not let the Android SDK complete a login unless the **SHA-1 of the
certificate that signed the installed APK** is registered on the Meta app.

### ⚠️ The Play App Signing trap — read before generating anything

If the app on your phone was installed from **Play Console** (internal /
closed / open testing — which is how the testers get it), Google **re-signs** it.
The certificate on that installed app is **Play's App Signing key**, *not* your
upload keystore. Registering only your upload keystore's hash produces exactly
the reported symptom: build is correct, code is correct, login never completes.

**Register both.** They are different values and Meta accepts a list:

| Hash to register | Where it comes from | Needed for |
|---|---|---|
| **Play App Signing key** SHA-1 | Play Console → your app → **Release → Setup → App signing** → "App signing key certificate" → SHA-1 certificate fingerprint | every install that came from Play Console ← **the one that's been missing** |
| **Upload keystore** SHA-1 | the `release.jks` the CI workflow signs with (steps below) | locally-built release APKs / AABs, and `eas build` artifacts sideloaded directly |
| **Debug keystore** SHA-1 | `~/.android/debug.keystore` (alias `androiddebugkey`, store & key password `android`) | `expo run:android` dev builds on your machine |

The upload keystore value is already extracted below. **The Play App Signing value
cannot be derived from this repo** — it is Google's key, readable only from Play
Console (or from an APK Play installed on a device). That is the one to go and get.

### The upload keystore's key hash — already extracted

```
SHA-1:          16:3B:21:32:B6:DB:00:C4:0D:AF:04:2F:ED:10:3D:8D:87:CC:AF:45
META KEY HASH:  FjshMrbbAMQNrwQv7RA9jYfMr0U=
```

Paste the **META KEY HASH** value. Verified 2026-09-12 two ways that agree exactly:
by reading the local EAS keystore, and by inspecting the signature block of the
`.aab` artifact from CI run `34619372677` (versionCode 3) — so this is the key that
signed what is on Play, not just what is on disk. See
`docs/PLAY-STORE-RELEASES.md` § Verified provenance.

> Both local files — `apps/mobile/@s.numbhraal__kanchuki.jks` and
> `…_OLD_1.jks` — hold the **same** certificate. The `_OLD_1` name suggests a
> rotation that never happened; nothing extra needs registering for it.

### Regenerating it (or hashing any other key)

```bash
# The common case: convert a hex SHA-1 (Play Console, `eas credentials`) to
# Meta's format. No keystore, no JDK required.
node scripts/meta-android-key-hash.mjs --sha1 "AB:CD:EF:..."

# Read the certificate straight out of a JKS — no password, no JDK
node scripts/meta-android-key-hash.mjs --keystore apps/mobile/@s.numbhraal__kanchuki.jks

# From an APK (needs the Android SDK build-tools + a JDK for apksigner)
node scripts/meta-android-key-hash.mjs --apk app-release.apk
```

The script prints the hex **and** the Meta value, and self-checks the result two
ways (Node's X.509 fingerprint, and that the certificate is genuinely self-signed)
so a misread container can't silently produce a wrong hash.

**Why it can read a JKS without the password:** in a JKS the certificate chain is
stored as plaintext DER — only the private key bytes are encrypted. The signing
certificate is public data. That matters here because the Android builds run in CI
and a dev machine often has **no JDK at all**, so `keytool` may not be available.

If you prefer raw `keytool`:

```bash
# Materialise the same keystore CI signs with (it is write-only as a GH secret,
# so use your local EAS copy — verified to be the same key)
keytool -list -v -keystore apps/mobile/@s.numbhraal__kanchuki.jks -alias <alias>  # copy the SHA1 line
```

> The CI workflow uses `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` /
> `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`
> (`.github/workflows/android-release.yml:54-88`).

### Pasting it in

**Product → Facebook Login → Settings**, or **Settings → Basic → Android**
(depending on how the app was created) → **Key hashes** → paste → **Save changes**.

No rebuild is needed — the hash is sent by the client at login and validated
server-side by Meta, so an already-installed build picks up the new entry. Retry
the connect; a force-stop first is harmless insurance against stale in-process SDK
state.

### Verifying which key signed a shipped `.aab`

Worth doing whenever "which build is on Play" is in question — it answers it from the
artifact itself, with no Play Console access. A JAR signature block is named after
the **first 8 characters of the signing alias**, so the check starts for free:

```bash
# 1. The signature file name tells you the alias. For this project it is
#    META-INF/F8DE0ED2.RSA  ← matches alias f8de0ed2… from the keystore.
unzip -l app-release.aab | grep -i 'META-INF/.*\.\(RSA\|DSA\|EC\)'

# 2. Read the certificate out of that signature block
unzip -p app-release.aab 'META-INF/*.RSA' > signer.pkcs7
openssl pkcs7 -inform DER -in signer.pkcs7 -print_certs -out certs.pem
openssl x509 -in certs.pem -noout -fingerprint -sha1

# 3. Compare with the keystore's own certificate
node scripts/meta-android-key-hash.mjs --keystore apps/mobile/@s.numbhraal__kanchuki.jks
```

Identical SHA-1 on both sides means the shipped artifact was signed by that key. If
they differ, the keystore you are hashing is **not** the one CI signed with — stop
and find the real one before registering anything with Meta.

Download a run's artifact with
`gh run download <run-id> -n app-release-aab -D <dir>` (see
`docs/PLAY-STORE-RELEASES.md` for run IDs).

> `unzip` may not be present in Git Bash on Windows; any zip tool works — the point
> is step 1, which needs no crypto at all.

---

## 4. Register the platforms

**Settings → Basic → Add platform.**

**Android**
- Google Play Package Name: `app.kanchuki.retailer`
- Class Name: leave blank (only used by older SDK integrations)
- Key Hashes: every hash from §3

**iOS**
- Bundle ID: `app.kanchuki.retailer`
- iPhone Store ID / iPad Store ID: blank until App Store listing exists

> Save the package name and **every** key hash in the same step. A package entry
> with a partial hash list is the most common way to end up with logins that work
> on one machine or one install and fail on every other.

---

## 5. Facebook Login product settings

**Products → Facebook Login → Settings:**

| Toggle | Set to | Why |
|---|---|---|
| Client OAuth Login | **On** | nothing works without it |
| Web OAuth Login | **On** | only needed for the web-OAuth fallback path — turn it on so Expo Go development still has a path |
| Embedded Browser OAuth Login | **On** | the SDK's own WebView dialog is what you get when the Facebook app isn't installed (§9). With this off, that fallback doesn't render at all |
| Login from Devices | Off | TV/console flow, irrelevant |
| Force Web OAuth Reauthentication | Off | leaving it **On** is what makes Facebook re-ask for the password every single time — it defeats one-tap by design |
| Use Strict Mode for redirect URIs | On (fine) | only affects the web flow; our redirect URI is an exact https URL, so strict mode is safe |
| Enforce HTTPS | On | same |

**Valid OAuth Redirect URIs** — add both, exactly:

```
https://kanchuki.app/social/connect
https://kanchuki.app/social/connect/callback
```

Those are the two the API actually sends. `defaultOAuthRedirect()`
(`retailers-social-connect.ts:28`) builds the first; the web callback page uses
the second (`retailers-social-connect.ts:350`). **A custom scheme is rejected by
Meta** — `kanchuki://oauth/callback` produces Meta's generic "Sorry, something
went wrong" page, which is why the redirect is an https URL the platform owns
even for the mobile app. Do not add a `kanchuki://` URI here; the deep link back
into the app is a client-side hop that Meta never sees.

> The native one-tap flow (§9) does **not** use a redirect URI at all. These two
> exist only so the Expo Go fallback and the web connect page keep working.

---

## 6. Settings → Basic — compliance fields

Meta blocks App Review (and sometimes the login dialog itself) until these are
filled. These pages already exist on the deployed web app:

| Field | Value |
|---|---|
| Privacy Policy URL | `https://kanchuki.app/privacy` |
| Terms of Service URL | `https://kanchuki.app/terms` |
| User Data Deletion → Instructions URL | `https://kanchuki.app/account-deletion` |
| App Category | Business and pages / Shopping |
| App Icon | 1024×1024 |
| Business Use / Data Use Checkup | complete the questionnaire; Meta re-asks annually and silently blocks login when it lapses |

The data-deletion field is the one most often left blank — it must be a URL that
explains *how a user asks Kanchuki to delete their data*, not a callback endpoint.

---

## 7. Roles and App Mode

**App Roles → Roles** (also reachable as **App Roles → Test Users**):

- Add every Facebook account that will test as **Tester** (or **Developer**/**Admin**).
- The account must accept the invitation — an unaccepted invitation behaves exactly
  like no role, and login fails with `No Facebook Pages found on this account…`
  even when the account clearly administers a Page.

**App Mode** (top bar toggle):

| Mode | Effect |
|---|---|
| **Development** | Only accounts with a role on the app can complete login. Correct while testing. |
| **Live** | Anyone can. Required before real retailers connect. |

Stay in Development until §8 lands, but make sure every tester account is listed —
this is the second-most-common cause of the reported symptom.

---

## 8. App Review — the publish permissions

Until these are granted with **Advanced Access**, connects succeed only for role
accounts. This is the step that takes calendar time (~1–3 days per submission,
sometimes longer), so start it early.

The app requests these on every Facebook login
(`apps/mobile/src/lib/facebook-auth.ts`):

| Permission | Why it's needed | Where in App Review |
|---|---|---|
| `public_profile` | baseline, no review needed | — |
| `pages_show_list` | list the Pages the retailer manages, so we can pick one to publish to | **Advanced** |
| `pages_read_engagement` | read Page/engagement data for the analytics surfaces | **Advanced** |
| `pages_manage_posts` | actually publish the product/collection post to the Page | **Advanced** |
| `business_management` | required by Graph to read Pages through the Business asset API | **Advanced** |
| `instagram_basic` | resolve the IG Professional account linked to the Page | **Advanced** (only if IG publishing is in scope) |
| `instagram_content_publish` | publish to the linked IG account | **Advanced** (same) |

**Before submitting:** record a screencast of the real flow (Settings → Social
Media → Connect → Facebook app opens → approve → "Connected! Linked &lt;Page&gt;" →
post a product → it appears on the Page). Meta rejects submissions that describe
the permission without demonstrating it. Also fill **App Review → Permissions and
Features** with the reviewer instructions box (test account credentials, or state
that role accounts are provided).

---

## 9. The device — what actually makes it *one-tap*

The SDK's Android default login behaviour is `NATIVE_WITH_FALLBACK`: try the
Facebook app, else fall back to the SDK's own WebView dialog.

**If the Facebook app is not installed on the test device, the fallback is not a
bug — it is the only path available, and it will ask for an email and password.**

So: **install the Facebook app on the test device and sign into it** before
testing connect. Then the flow is a single "Continue as &lt;name&gt;" tap, and the
app is not involved in the authentication at all.

If you want to *prove* which behaviour ran, the SDK exposes it —
`LoginManager.setLoginBehavior('native_only')` forces the Facebook app only
(`'native_with_fallback'` | `'native_only'` | `'web_only'`, see
`react-native-fbsdk-next` `src/FBLoginManager.ts`). With `native_only`, a device
without the Facebook app fails loudly instead of quietly showing a password form,
which is a useful diagnostic but a worse shipping default — leave the code as-is
unless you are deliberately isolating this.

---

## 10. Verifying each layer independently

Do not test "does connect work" as one opaque thing. Each layer is separately
observable, and knowing which one broke is the whole point of this doc.

| Layer | How to check | Pass looks like |
|---|---|---|
| Meta app has the right ID | `apps/mobile/app.json` `appID` === `META_APP_ID` on the API service | identical strings |
| Keystore hash registered | `keytool -list -v` vs Play Console app-signing cert, both compared against Meta's Key Hashes list | all present in Meta |
| SDK loaded | tap Connect in an EAS/dev build; Expo Go → `FacebookAuthUnavailable` → web fallback | no `Facebook SDK could not be loaded in this build` error |
| Native login returned a token | the app's red banner text | no `Facebook returned no access token` |
| Server accepted the token | `GET /v1/retailers/me/social/accounts` | a `FACEBOOK` row with the Page name |
| Page token usable | post a product → open the Page in Facebook | the post is there |

Failure text maps to a layer — the connect screens show the **real** API error in
a red banner (not a generic Alert), so the banner text is the diagnostic:

| Banner / error code | Layer | Fix |
|---|---|---|
| `Facebook returned no access token…` | key hash / App Mode | §3, §7 |
| `Invalid key hash` (SDK text) | key hash | §3 |
| `App not active` (SDK text) | App Mode | §7 — app is in Dev mode and this account has no role |
| `Facebook SDK failed to initialise: …` | `app.json` plugin config | plugin block appID/clientToken/scheme, then rebuild (§1) |
| `Social publishing is not configured yet` (503) | server | `META_APP_ID` / `META_APP_SECRET` not set on the API service |
| `Failed to obtain a long-lived token` | app mismatch | server `META_APP_ID`/`_SECRET` belong to a different Meta app than the SDK logged into |
| `NO_PAGES_FOUND` (404) | roles / Pages | the FB account admins no Page, **or** it has no role on the app (§7) |
| `NO_PAGE_TOKEN` (502) | permissions declined | re-connect and grant all permissions — the consent screen hides per-permission toggles behind "Edit access" |
| `NO_IG_FOUND` (404) | IG account setup | the Page has no linked IG **Professional** account; link one, then retry |
| `Facebook login was cancelled` | nothing | the retailer backed out of the dialog |

Error codes come from `apps/api/src/routes/retailers/retailers-social/retailers-social-connect.ts`.

---

## 11. What this doc cannot fix

- **Code bugs in the login attempt itself** — RC-018 (`LoginManager.logOut()`
  before every login, which forced the credentials form every time) is already
  fixed in `apps/mobile/src/lib/facebook-auth.ts`. If the installed app predates
  that commit you will still see the old behaviour no matter how correct the
  dashboard is. Confirm the build first: the footer at the bottom of Settings
  reads `BUILD <7-char-sha>` with `<channel> · <YYYY-MM-DD HH:MM UTC>` beneath it,
  and tapping it copies `build <7-char-sha> · ci · <UTC>` — check that SHA against
  the `android-release.yml` run you downloaded the `.aab` from.
- **A build without the native SDK** — Expo Go has no `react-native-fbsdk-next`.
  It falls back to the web OAuth flow by design. Test one-tap on an EAS or
  Play-installed build only.
- **WhatsApp / Messaging permissions** — unrelated; see
  `docs/tasks/whatsapp-embedded-signup-managed-sending.md`.

---

## 12. Checklist

Copy into the task tracker; tick in order.

- [ ] Confirmed `https://developers.facebook.com/apps/1758308975480748/` is the app holding `META_APP_ID`
- [ ] Upload keystore hash `FjshMrbbAMQNrwQv7RA9jYfMr0U=` added to Meta Key Hashes (§3 — already extracted)
- [ ] **Play App Signing certificate SHA-1 → base64, added to Meta Key Hashes**
- [ ] Debug keystore SHA-1 added (for `expo run:android`)
- [ ] Android platform: package `app.kanchuki.retailer`
- [ ] iOS platform: bundle `app.kanchuki.retailer`
- [ ] Facebook Login → Client OAuth Login **On**
- [ ] Facebook Login → Embedded Browser OAuth Login **On**
- [ ] Facebook Login → **Force Web OAuth Reauthentication Off**
- [ ] Valid OAuth Redirect URIs: `/social/connect` + `/social/connect/callback` (https, no `kanchuki://`)
- [ ] Settings → Basic: Privacy Policy, Terms, **Data Deletion Instructions** URLs set
- [ ] Data Use Checkup completed
- [ ] Every tester account added as a **role** and has **accepted**
- [ ] App Review submitted for `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management` (+ `instagram_basic`, `instagram_content_publish` if IG is in scope)
- [ ] Facebook app installed and signed in on the test device
- [ ] Install the build containing the RC-018 fix, then confirm Settings → build-info footer shows the expected commit
- [ ] Tap Connect Facebook → single "Continue as …" tap → "Connected! Linked &lt;Page&gt;"
- [ ] Flip App Mode to **Live** once App Review is approved

---

## 13. Related

| Doc | Covers |
|---|---|
| `docs/social-connect-native.md` | the code/architecture side — flow, files, API routes, error-code map |
| `docs/root-cause/root-cause issues.md` | RC-016 / RC-018 — why connect looped back to the login screen |
| `docs/tasks/2026-09-11-otp-fb-aistudio-lint-session.md` | the session that diagnosed it, incl. build-provenance footer |
| `docs/PLAY-STORE-RELEASES.md` | versionCode release log — which `.aab` went to which track |
| `docs/LAUNCH-READINESS-AUDIT.md` | pre-launch gate this setup is an input to |
