// ─── Retailer app identity (scheme + application ids) ──────────────
//
// WHY THIS FILE EXISTS (RC-041)
//
// The app's URL scheme and its application id are properties of the **mobile
// app**, and three codebases were writing them out by hand:
//
//   apps/mobile/app.json              scheme + android.package + ios.bundleIdentifier
//   apps/api/src/lib/staff-invite.ts  `kanchuki://join?token=…`
//   apps/web/src/lib/deep-links.ts    `kanchuki://…` + `intent://…#package=…`
//
// Nothing cross-checked any of them against the manifest, so a typo shipped
// silently, and one had: `/join`'s `intent://` named `in.kanchuki.app`, an app
// that does not exist, so "Open with Android app" could never open Kanchuki —
// Android falls through to default intent resolution and the tap looks inert.
// It survived a year of use because the plain `kanchuki://` scheme link directly
// above it (no package to get wrong) works, and because that page's test
// asserted the scheme link and never the `intent://` one.
//
// THE SHAPE OF THE FIX
//
// One place, consumed by every app that links into the mobile app or names it.
// The literal now appears exactly once — here — and every consumer imports it:
// the API and the web app build their links from it, and the mobile app's
// *manifest* is generated from it by `apps/mobile/app.config.ts` (2026-09-25).
// Drift is a red suite.
//
// HOW THE MANIFEST READS THIS MODULE — and the one trap in doing so
//
// `apps/mobile/app.json` used to keep its own copy, because Expo resolves the
// manifest before any TypeScript runs. What changed is that the resolution no
// longer needs the static file: `app.config.ts` imports these constants. Two
// details make that work, and both were measured rather than assumed:
//
//   - Expo transpiles **only the config file itself** (sucrase +
//     `require-from-string`), so a `require` written in it goes through Node's
//     ordinary resolver. That rules out importing the built package: `dist/` is
//     gitignored and the release path never builds it — `android-release.yml`
//     runs `pnpm install` → `expo prebuild` → Gradle, and `pnpm install` executes
//     only `packages/db`'s postinstall. Measured result: the config died with
//     `Cannot find module .../dist/index.js` before Gradle ever ran, which is an
//     unbuildable app rather than a dead link.
//   - So the config registers sucrase's TS hook and requires this file's
//     **source**, through the `./constants/app-identity` subpath — whose
//     `default` condition deliberately points at `src/`. No `dist`, no build
//     step, no ESM/CJS interop, and the literal still exists exactly once.
//
// That leaves one rule to keep: `@kanchuki/shared/constants/app-identity` is for
// **build-time config only**. App runtime code imports `@kanchuki/shared` like
// every other consumer — the subpath resolves to TypeScript and only loads with
// that hook registered.
//
// `IOS_BUNDLE_ID` and `ANDROID_PACKAGE` are separate constants on purpose: they
// happen to be equal today, and Apple and Google issue them independently, so a
// test that asserted equality would be inventing a rule neither store has.

/** Custom URL scheme — `apps/mobile/app.json` → `expo.scheme`. */
export const APP_SCHEME = 'kanchuki';

/** Android application id — `apps/mobile/app.json` → `expo.android.package`. */
export const ANDROID_PACKAGE = 'app.kanchuki.retailer';

/** iOS bundle identifier — `apps/mobile/app.json` → `expo.ios.bundleIdentifier`. */
export const IOS_BUNDLE_ID = 'app.kanchuki.retailer';

/**
 * Query params for a deep link. A param whose value is `undefined` is omitted
 * rather than emitted as `key=` — most app routes treat a present-but-empty
 * param differently from an absent one.
 */
export type AppLinkParams = Record<string, string | undefined>;

function query(params: AppLinkParams): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  if (entries.length === 0) return '';
  const pairs = entries.map(
    ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
  );
  return `?${pairs.join('&')}`;
}

/**
 * `kanchuki://<host>?a=b` — the custom-scheme link.
 *
 * Use where the app is known to be installed, or where the surrounding copy
 * offers both routes: a custom scheme with no registered handler fails in the
 * browser, which is why the web bridge pages render this next to the Play Store
 * badge rather than alone.
 */
export function appLink(host: string, params: AppLinkParams = {}): string {
  return `${APP_SCHEME}://${host}${query(params)}`;
}

/**
 * `intent://<host>?a=b#Intent;scheme=…;package=…;end` — the Android link.
 *
 * `package=` is what makes this a *targeted* intent: Android opens that
 * application directly instead of showing a chooser, which is the only reason to
 * prefer `intent://` over the custom scheme. Naming a package that is not
 * installed is not an error the browser reports — Android falls through to
 * default intent resolution, so the link looks like it does nothing (RC-041).
 */
export function androidIntentUrl(host: string, params: AppLinkParams = {}): string {
  return (
    `intent://${host}${query(params)}` +
    `#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};end`
  );
}
