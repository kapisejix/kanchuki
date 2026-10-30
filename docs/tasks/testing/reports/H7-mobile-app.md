# H7 — Mobile app (`apps/mobile`), hacker mode

- **Task:** H7 (`task-4-hacker.md`): extract API URL + keys from the bundle (`app.json`, `eas.json`, JS), token storage, deep-link hijack (RC-041), traffic interception/replay (no pinning), debug flags/dev menus in release
- **Date:** 2026-10-26
- **Branch:** `fix/team-otp-fail-closed-rc085` (no code changes)
- **Target:** code/config-only review. No APK was built or decompiled, no device or proxy was used, and no MSG91/Meta calls were made. Nothing is "Confirmed".
- **Tooling note:** `rtk` is not installed. Plain `grep`/`sed`/`git` via Git Bash were used.
- **Secrets:** reported by location only; values are not reproduced here.

## Commands run

```
ls apps/mobile; cat apps/mobile/eas.json; sed apps/mobile/app.config.ts; grep apps/mobile/app.json
git ls-files apps/mobile | grep -iE "jks|keystore|credentials|google-services|p12|p8|env"
git check-ignore -v apps/mobile/*.jks ; git log --all -- "*.jks" "*.keystore"
grep SecureStore / AsyncStorage / console.* token / EXPO_PUBLIC_* in apps/mobile/src, app
grep intentFilters / associatedDomains / assetlinks; AndroidManifest.xml (local prebuild output)
sed packages/shared/src/constants/app-identity.ts; apps/web/src/app/social/connect/page.tsx; join/page.tsx
sed apps/api/src/routes/retailers/retailers-social/retailers-social-connect.ts (state binding)
sed apps/api/src/routes/auth.ts:365-400 + lib/msg91-otp.ts verifyMsg91WidgetToken
grep expo-dev-client / flipper / expo-updates / pinning; src/lib/sentry.ts
```

## Result summary

| Severity | Count | IDs |
| --- | --- | --- |
| Critical | 0 | — |
| High | 0 | — |
| Medium | 1 | H7-1 |
| Low | 3 | H7-2, H7-3, H7-4 |
| Not exploitable (attack disproved) | 7 | A1–A7 below |

All findings are **Plausible** (code/config-only), except H7-3, which is informational. None applied.

## Findings table

| ID | Sev | File:line | Issue | Fix |
| --- | --- | --- | --- | --- |
| H7-1 | Medium | `apps/mobile/eas.json` (preview + production `env`), `apps/mobile/src/lib/msg91-otp.ts:52-53` | The MSG91 widget id and its `tokenAuth` ship in every APK and are committed to the public repo (hardcoded fallback + `eas.json`). Anyone can drive MSG91 `sendOTP` directly, bypassing every API rate limit (SMS pumping / OTP-bombing billed to Kanchuki). | MSG91 dashboard: captcha, per-mobile/IP limits, +91 only, daily cap; rotate the token; delete the hardcoded fallback |
| H7-2 | Low | `apps/web/src/app/social/connect/page.tsx:94`, `apps/web/src/app/join/page.tsx:58`, `app-identity.ts:92-94` | The OAuth `code`+`state` and the staff-invite `token` are handed to the app over the custom scheme `kanchuki://`, with no Android App Links. Any installed app can register the same scheme and receive them. | Android App Links (`https` + `autoVerify` + `assetlinks.json`) for `join` and the OAuth callback |
| H7-3 | Low (info) | — (no pinning anywhere) | No TLS pinning. Interception needs the attacker's own rooted device with a system CA, so a replay only ever replays their own session. | No change needed; server-side enforcement is what matters (H1–H6) |
| H7-4 | Low | `apps/mobile/@s.numbhraal__kanchuki.jks`, `…_OLD_1.jks` | Android signing keystores sit inside the repo working tree, protected only by `.gitignore:100`. Not committed and not in history, but one `git add -f`, a folder zip, or a gitignore-unaware upload would publish them to a public repo. | Move them out of the repo (e.g. `%USERPROFILE%\keys\`) or rely on EAS-managed credentials |

---

### H7-1 MSG91 widget credentials are public, so OTP SMS can be sent without the API             Severity: Medium
Attacker: anonymous (anyone with the APK or the public GitHub repo)
Goal: send unlimited OTP SMS through Kanchuki's MSG91 account, either to burn SMS credit (toll fraud / SMS pumping to premium ranges, if non-India numbers are allowed) or to OTP-bomb a victim's phone. This skips the API, so none of the API's limits apply (`/otp/send` per-route limits, RC-087, RC-015 double-send guard).
Preconditions: the widget allows `sendOTP` with just `widgetId` + `tokenAuth`, which is how the client-side widget is designed to work. The MSG91 dashboard's widget limits are unknown (owner check).
Steps:
1. Read the widget id and `tokenAuth`: `apps/mobile/eas.json` (both profiles' `env.EXPO_PUBLIC_MSG91_WIDGET_ID` / `EXPO_PUBLIC_MSG91_TOKEN_AUTH`), or the hardcoded fallbacks at `apps/mobile/src/lib/msg91-otp.ts:52-53`, or `strings`/Hermes-decompile on the release APK (`EXPO_PUBLIC_*` is inlined into the bundle).
2. Call the MSG91 widget send endpoint the SDK uses, with those two values and any `identifier` (mobile), in a loop. (Not executed; no MSG91 calls in this session.)
3. Each call sends one SMS charged to Kanchuki.
Impact: SMS cost (a direct ₹ bill) and harassment of victims. Login is **not** bypassed: the server re-verifies the widget access token with the server-side authkey and requires the token's mobile to equal the claimed phone (`apps/api/src/lib/msg91-otp.ts:340-356`, `auth.ts:393-395`).
Evidence: `apps/mobile/eas.json` (preview/production `env` blocks); `apps/mobile/src/lib/msg91-otp.ts:52-53`; the repo is public (SC-2).
Fix:
- Owner, MSG91 dashboard → OTP Widget (config only): turn on captcha / invisible captcha; set per-mobile and per-IP send limits and a low daily cap; restrict to country code 91; then **rotate** `tokenAuth` (the current value is in public git history, so rotating is the only way to retire it). Set the new value only as an EAS env var / GitHub secret.
- Code (stop re-committing the value):
```diff
--- a/apps/mobile/src/lib/msg91-otp.ts
+++ b/apps/mobile/src/lib/msg91-otp.ts
@@
-const WIDGET_ID = process.env.EXPO_PUBLIC_MSG91_WIDGET_ID || '<redacted>'
-const TOKEN_AUTH = process.env.EXPO_PUBLIC_MSG91_TOKEN_AUTH || '<redacted>'
+// Build-time only (EAS env / CI secret). Unset = widget disabled; the API OTP path still works.
+const WIDGET_ID = process.env.EXPO_PUBLIC_MSG91_WIDGET_ID ?? ''
+const TOKEN_AUTH = process.env.EXPO_PUBLIC_MSG91_TOKEN_AUTH ?? ''
```
  Move the two values out of `eas.json` into EAS environment variables (`eas env:create`). Check before applying: the file's header comment (`msg91-otp.ts:7`) describes the unset behaviour; confirm the widget-disabled path falls back to API OTP rather than breaking login. The value stays extractable from the APK whatever you do; the dashboard limits are the real control.
Status: Plausible

---

### H7-2 OAuth code and staff-invite token go over a hijackable custom scheme             Severity: Low
Attacker: a malicious app on the retailer's/staff member's phone that registers the `kanchuki` scheme
Goal: capture the Meta OAuth `code`+`state`, or a staff invite `token`.
Preconditions: the malicious app is installed; Android shows a chooser, or the malicious app wins resolution. `AndroidManifest.xml` (prebuild output) declares `<data android:scheme="kanchuki"/>` with no `autoVerify` https App Link; `app.json` has no `intentFilters`/`associatedDomains`; the web app serves no `assetlinks.json`.
Steps:
1. Victim taps Connect Instagram → Meta → https redirect to `/social/connect` → `window.location.href = kanchuki://oauth/callback?code=…&state=…` (`social/connect/page.tsx:89-97`).
2. The malicious app receives the intent.
Impact: small, because the server holds the important checks:
- OAuth: `consumeOAuthState` must return the **calling** retailer (`retailers-social-connect.ts:69-72,336-339`), and exchanging a Meta code needs the app secret, so the thief can use neither. The real effect is that the victim's connect fails, because state/code are single-use (a DoS).
- Invite: `kanchuki://join?token=` (`join/page.tsx:58`). The token alone shows the shop name, role and masked bound phone (`app/join.tsx:42-48`); joining needs the OTP sent to the bound phone (`join.tsx:73-84`). The impact is information disclosure.
Evidence: files above.
Fix: Android App Links. Add an `intentFilters` entry in `app.json` (`"autoVerify": true`, `scheme: "https"`, `host: <web host>`, `pathPrefix: "/join"` and `"/social/connect"`), serve `/.well-known/assetlinks.json` from `apps/web` with the release signing SHA-256, and switch `appLink('join'| 'oauth/callback')` callers to the https URL. iOS: `associatedDomains` + AASA. The redirect URI registered with Meta does not change. Low priority; do it with the F-035 Embedded Signup work, which touches the same flow.
Status: Plausible

---

### H7-3 No certificate pinning             Severity: Low (informational)
Attacker: the app's own user on a rooted device with a system-installed CA (Android ≥7 apps ignore user CAs by default)
Goal: read and replay API traffic.
Steps: Frida/objection, or a system CA plus mitmproxy.
Impact: the attacker sees only their own token and requests. A replay is the same as using their own session, which is why every check must be server-side (as H1–H6 tested). For a third party, interception needs a CA compromise. Pinning adds rotation risk (an outage when the certificate changes) for little gain here.
Evidence: `grep -rn "pinning|TrustKit|network_security_config"` over `apps/mobile` → no hits.
Fix: none recommended.
Status: Not exploitable

---

### H7-4 Release keystores stored inside the repo working tree             Severity: Low
Attacker: none (insider/accident)
Goal: obtain the Android upload/signing key, so updates can be signed as Kanchuki (combined with Play account access) or a lookalike APK passes signature-continuity checks for sideloads.
Preconditions: an accidental `git add -f`, a zip of `apps/mobile` sent to someone, a backup/sync tool, or any uploader that ignores `.gitignore`.
Steps: n/a.
Impact: today the files are **not tracked** (`git ls-files` → none), **not in history** (`git log --all -- "*.jks" "*.keystore"` → empty) and are ignored by `.gitignore:99-101`. A single ignore line is all that stands between them and a public repo.
Evidence: `apps/mobile/@s.numbhraal__kanchuki.jks`, `apps/mobile/@s.numbhraal__kanchuki_OLD_1.jks` (present on disk); `.gitignore:100`.
Fix: move both files outside the repo, or delete the local copies if EAS-managed credentials hold the canonical key (`eas credentials` shows it). Keep an offline backup of the upload key. No code change.
Status: Plausible

---

## Attacks disproved (Not exploitable, with proof)

| # | Attack | Result | Proof |
| --- | --- | --- | --- |
| A1 | Server secrets in the bundle (`app.json`, `eas.json`, `EXPO_PUBLIC_*`) | None found. Bundle-visible values are the API URL, the MSG91 widget id/token (H7-1), the Sentry DSN (designed to be public) and the Facebook appID + client token (Meta designs the client token to be embedded). A scan for `sk_`, `rzp_live/test`, `AKIA`, `-----BEGIN`, `service_role` → no hits | `eas.json`; `app.json:77-81`; grep of `src`, `app` |
| A2 | Steal tokens from device storage / backups | Tokens are in `expo-secure-store` (Keystore-backed) via `src/lib/storage.ts:15-32`. No `AsyncStorage` use for tokens. `allowBackup="true"` but `fullBackupContent`/`dataExtractionRules` = Expo's `secure_store_*` rules, which exclude SecureStore | `src/lib/storage.ts`; `AndroidManifest.xml:23` |
| A3 | Tokens leaked through logs / crash reports | Sentry: `sendDefaultPii: false` and `beforeSend` deletes `Authorization` (`src/lib/sentry.ts:54-59`). No `console.*` of a token value (one `console.warn` logs the error object only, `app/auth/otp.tsx:253`) | grep `console.*(token\|otp\|Authorization)` |
| A4 | Dev menu / debugger / OTA update hijack in release | `expo-dev-client`, Flipper, Reactotron and `expo-updates` are not dependencies (`package.json`), so there is no dev launcher in release and no OTA channel to hijack | `grep` of `apps/mobile/package.json` → no hits |
| A5 | Forge a widget login for another phone | Server re-verifies `msg91_token` with MSG91 using the server-side authkey and requires an exact phone match | `apps/api/src/routes/auth.ts:393-395`; `apps/api/src/lib/msg91-otp.ts:340-356` |
| A6 | Use an intercepted OAuth code/state on the attacker's own account | `consumeOAuthState` result must equal `request.retailerId`, else 422; the code exchange needs the app secret | `retailers-social-connect.ts:69-72,336-339` |
| A7 | Committed native project with debug flags (`debuggable`, cleartext) | `apps/mobile/android/` is not tracked (CI generates it via `expo prebuild`). The local manifest has no `debuggable`/`usesCleartextTraffic`. Release cleartext could not be checked without a build | `git ls-files apps/mobile/android` → empty |

## Not checked / follow-ups

- **APK not built or decompiled** (no device, time). A future check: build `preview`, then `apktool d` + `strings index.android.bundle | grep -i "EXPO_PUBLIC\|https://"` to confirm A1/A7 on the real artefact.
- **Owner checks:** MSG91 widget settings (captcha, rate limits, country restriction), which decide H7-1's severity. Whether the release signing key exists in EAS credentials, so the local `.jks` copies can go (H7-4).
- Not reviewed: iOS build config (no `ios/`); `src/lib/facebook-auth.ts` token handling after native login; `expo-notifications` push token registration payload (F-046, covered in H1/H2 scope); the API's `http://localhost:3001` fallback (`src/lib/api/client.ts:11`) if CI ever ships without `EXPO_PUBLIC_API_URL` (fails closed, not a security issue).
- Cross-refs: RC-041 (app identity; H7-2 is the custom-scheme half), RC-015/RC-021 (OTP double-send; H7-1 bypasses the API entirely), RC-087 (API rate limits; not reached by H7-1), RC-085/RC-086/RC-088, SC-2 (public repo), F-035.
