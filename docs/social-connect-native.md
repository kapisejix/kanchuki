# Social Connect — Native Facebook SDK (app-to-app, no OTP)

**Status:** code shipped; needs an EAS build + Meta App Dashboard config before it works on a real phone.

## What changed

The retailer used to tap "Connect Facebook", get bounced to a **web page** that
asked for a **phone OTP**, then a Facebook web login. That flow can never work
cleanly from the app — Facebook Login rejects custom-scheme (`kanchuki://`)
redirect URIs.

Now: tap "Connect" → the **Facebook app opens** → "Continue as …" → back in
Kanchuki. No web page, no OTP.

| Piece | File |
|---|---|
| Native login wrapper | `apps/mobile/src/lib/facebook-auth.ts` (`loginWithFacebook`) |
| Config plugin | `apps/mobile/app.json` → `react-native-fbsdk-next` plugin block |
| Dependency | `apps/mobile/package.json` → `react-native-fbsdk-next@^13.4.1` |
| Mobile API client | `apps/mobile/src/lib/api/social.ts` → `socialApi.connectWithToken()` |
| Server route | `POST /v1/retailers/me/social/connect-native` in `apps/api/src/routes/retailers/retailers-social.ts` |
| Token exchange | `exchangeUserTokenForLongLived()` in `apps/api/src/lib/meta-graph.ts` |
| Screens rewired | `app/settings/social.tsx`, `app/growth/integrations/facebook.tsx`, `app/growth/integrations/instagram.tsx` |

The old web OAuth-URL flow stays as a **fallback** — it only runs when the
native SDK is missing (Expo Go), so day-to-day Expo Go development still has a
path.

## Flow

1. `loginWithFacebook()` → `LoginManager.logInWithPermissions([...])` opens the
   FB app, returns a **short-lived user token** on-device.
2. `socialApi.connectWithToken(token, 'facebook')` → `POST /social/connect-native`.
3. Server `exchangeUserTokenForLongLived()` → `fb_exchange_token` → long-lived
   (~60d) user token.
4. Server `listPages()` → upsert the first `SocialAccount` row (encrypted token).

No OAuth `code`, no `redirect_uri`, no Redis `state`, no web callback.

## Setup required before it works

### 1. Meta App Dashboard (developers.facebook.com/apps)

Same app that already holds `META_APP_ID` / `META_APP_SECRET` on the server.

- **Settings → Basic**: note the **App ID**. Add the **Android** platform
  (package `app.kanchuki.retailer`, and the release **key hashes** — get them
  from the EAS credentials, `eas credentials`) and the **iOS** platform (bundle
  `app.kanchuki.retailer`).
- **Settings → Advanced**: copy the **Client Token**.
- **Products → Facebook Login → Settings**: ensure "Client OAuth Login" +
  "Embedded Browser OAuth Login" are on. No redirect URI needed for the native SDK.
- **App Review**: request `pages_show_list`, `pages_read_engagement`,
  `pages_manage_posts`, `business_management` (add `instagram_basic`,
  `instagram_content_publish` if IG publishing is in scope). ~1–3 days.
  Until approved, only users with a **role on the app** (admins/testers/devs)
  can connect.

### 2. `apps/mobile/app.json`

Replace the three placeholders in the `react-native-fbsdk-next` plugin block:

```jsonc
"appID": "<Facebook App ID>",
"clientToken": "<Client Token from Settings → Advanced>",
"scheme": "fb<Facebook App ID>"   // literally the string "fb" + the numeric App ID
```

### 3. Build

Native module — **not in Expo Go**. Needs a dev client or a store build:

```
cd apps/mobile
eas build --profile development --platform android   # or ios
```

## Testing checklist (real device, EAS build)

- [ ] Tap "Connect Facebook Page" in Settings → Social Media → FB app opens
- [ ] Approve → returns to Kanchuki, "Connected! Linked <Page name>"
- [ ] `GET /v1/retailers/me/social/accounts` shows the Page
- [ ] Post a product → lands on the Page
- [ ] Same from Growth → Integrations → Facebook and → Instagram
- [ ] Expo Go: tapping Connect falls back to the web flow (no crash)
