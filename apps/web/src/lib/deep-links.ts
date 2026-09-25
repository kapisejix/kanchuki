/**
 * Deep links into the Kanchuki **retailer app** — the web app's entry point.
 *
 * RC-041 lived here. This module used to own its own copies of the scheme and the
 * Android package, cross-checked against nothing, and `/join` shipped an
 * `intent://` link naming `in.kanchuki.app` — an app that does not exist. An
 * `intent://` naming an uninstalled package is not an error the browser reports;
 * Android falls through to default intent resolution, so "Open with Android app"
 * simply did nothing. It survived because the plain `kanchuki://` scheme link
 * beside it (no package to get wrong) works, and because that page's test
 * asserted the scheme link and never the `intent://` one.
 *
 * The values now live exactly once, in `@kanchuki/shared`
 * (`constants/app-identity.ts`), which the API (`buildStaffInviteUrl`) and the
 * mobile app read too — the API was the third hand-written copy. This file stays
 * as the web app's entry point so its call sites don't need to know where the
 * constants moved, and it holds no literals of its own:
 * `__tests__/deep-links.test.ts` fails if `intent://`, `kanchuki://`, a
 * `package=` literal, the package id or the RC-041 value reappears anywhere under
 * `apps/web/src` outside a test.
 */
export {
  ANDROID_PACKAGE,
  APP_SCHEME,
  IOS_BUNDLE_ID,
  androidIntentUrl,
  appLink,
  type AppLinkParams,
} from '@kanchuki/shared';
