// Dynamic Expo config.
//
// `app.json` remains the single source of truth for everything else — this file
// merges `extra.buildInfo` on top, so a build can identify itself — and since
// 2026-09-25 it also owns the app's **identity** (URL scheme + application ids),
// which it imports from `@kanchuki/shared` instead of repeating the literals.
// (Named `app.config.ts`, not `.js`: Expo prefers this file over `app.config.js`
// when both exist, so a stale `.js` beside it would be read by nobody.)
//
// WHY (`extra.buildInfo`, 2026-09-11): four Android builds ran in one day and
// nobody could say which commit the uploaded .aab came from, or which build a
// tester's phone was running. A screenshot of the Settings footer now answers
// both (see src/lib/build-info.ts). `android-release.yml` also injects the same
// values as EXPO_PUBLIC_* so the CI-shipped bundle carries them regardless of
// whether the embedded config is readable at runtime.
//
// SHA sources, most authoritative first: EAS build → CI build → local checkout
// → 'unknown'. None of this is secret (a SHA and a timestamp are already public
// in the repo); no key, token or URL is read here.
//
// The type-only import is erased by sucrase before this file runs; it exists so
// `tsc` checks the shape of what we hand back against Expo's own config type. An
// unrecognised key here is not an error at build time — Expo ignores it — which
// is how a misspelled field would silently stop doing anything.
import type { ConfigContext } from '@expo/config';

// ─── App identity: imported, never re-typed (RC-041) ───────────────────
//
// WHY A SOURCE IMPORT AND A TRANSPILE HOOK — measured 2026-09-25, not assumed.
//
// Expo evaluates this file with sucrase + `require-from-string`, so **only this
// file is transpiled**: a `require` written here goes through Node's ordinary
// resolver. That leaves exactly two ways to reach the shared constants, and the
// obvious one is the broken one:
//
//   - `require('@kanchuki/shared')` — the built package. Its `import`/`default`
//     map to `dist/`, which is gitignored and is **not built on the release
//     path**: `android-release.yml` runs `pnpm install` → `expo prebuild` →
//     Gradle, and no step compiles `packages/shared` (`pnpm install` executes
//     only `packages/db`'s postinstall — measured). So the config resolved
//     `dist/index.js` and died with `Cannot find module` before Gradle ever ran.
//     A manifest that cannot load is an unbuildable app, not a broken link, so
//     this failure mode is not tolerable.
//   - register sucrase's TS hook and require shared's **source** — what this
//     file does. No `dist`, no build step, no ESM/CJS interop, and the literal
//     still exists in exactly one place.
// `@kanchuki/shared/constants/app-identity` is the subpath that exists for this,
// and it maps to shared's source *on purpose*. Do not use it from app runtime
// code: the app imports `@kanchuki/shared` (the built entry) like every other
// consumer.
require('sucrase/register/ts');

const { ANDROID_PACKAGE, APP_SCHEME, IOS_BUNDLE_ID } = require('@kanchuki/shared/constants/app-identity');
const { execSync } = require('node:child_process');

function resolveSha() {
  const fromEas = process.env.EAS_BUILD_GIT_COMMIT_HASH;
  if (fromEas) return fromEas;

  const fromCi = process.env.GITHUB_SHA;
  if (fromCi) return fromCi;

  try {
    return execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // No git (tarball checkout) — 'unknown' is the honest answer.
    return 'unknown';
  }
}

function resolveBuiltAt() {
  // EAS provides an ISO timestamp; SOURCE_DATE_EPOCH is seconds since epoch.
  if (process.env.EAS_BUILD_STARTED_AT) return process.env.EAS_BUILD_STARTED_AT;

  if (process.env.SOURCE_DATE_EPOCH) {
    const seconds = Number(process.env.SOURCE_DATE_EPOCH);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }

  // Config is evaluated at the start of `expo prebuild`, i.e. immediately
  // before the native build, so this is the build time to within a minute.
  return new Date().toISOString();
}

function resolveChannel() {
  if (process.env.EAS_BUILD_PROFILE) return process.env.EAS_BUILD_PROFILE;
  if (process.env.CI) return 'ci';
  return 'local';
}

module.exports = ({ config }: ConfigContext): ConfigContext['config'] => {
  const sha = resolveSha();

  return {
    ...config,
    // `expo prebuild` reads these to generate the application id in Gradle and
    // Xcode — the reason a wrong value here is an unbuildable app rather than a
    // dead deep link (RC-041). `android`/`ios` are spread, not replaced, so the
    // keys `app.json` still owns (versionCode, permissions, blockedPermissions,
    // infoPlist, supportsTablet, …) survive untouched.
    scheme: APP_SCHEME,
    android: { ...config.android, package: ANDROID_PACKAGE },
    ios: { ...config.ios, bundleIdentifier: IOS_BUNDLE_ID },
    extra: {
      ...config.extra,
      buildInfo: {
        sha,
        shortSha: sha.slice(0, 7),
        builtAt: resolveBuiltAt(),
        channel: resolveChannel(),
      },
    },
  };
};
