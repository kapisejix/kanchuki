// Dynamic Expo config.
//
// `app.json` remains the single source of truth for everything else — this file
// only merges `extra.buildInfo` on top, so a build can identify itself.
//
// WHY (2026-09-11): four Android builds ran in one day and nobody could say
// which commit the uploaded .aab came from, or which build a tester's phone was
// running. A screenshot of the Settings footer now answers both (see
// src/lib/build-info.ts). `android-release.yml` also injects the same values as
// EXPO_PUBLIC_* so the CI-shipped bundle carries them regardless of whether the
// embedded config is readable at runtime.
//
// SHA sources, most authoritative first: EAS build → CI build → local checkout
// → 'unknown'. None of this is secret (a SHA and a timestamp are already public
// in the repo); no key, token or URL is read here.
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

module.exports = ({ config }) => {
  const sha = resolveSha();

  return {
    ...config,
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
