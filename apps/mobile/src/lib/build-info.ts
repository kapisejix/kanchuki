import Constants from 'expo-constants';

/**
 * Which code is actually running — baked in at build time, shown in Settings.
 *
 * WHY THIS EXISTS (2026-09-11): four separate Android builds ran in one day and
 * two rounds of "the fix didn't work on a fresh .aab" happened because nobody
 * could say which commit an uploaded .aab contained, or which build a tester's
 * phone was actually running — a screenshot could not distinguish "the fix
 * isn't in the build" from "the phone is still on the old release". This makes
 * both answerable from one photo of the Settings footer.
 *
 * Sources, most specific first:
 *  1. `EXPO_PUBLIC_BUILD_*` — inlined into the JS bundle by Metro at bundle
 *     time. Set by `.github/workflows/android-release.yml` (real commit) and
 *     `eas.json`; guaranteed to survive into the shipped JS.
 *  2. `Constants.expoConfig.extra.buildInfo` — the resolved Expo config
 *     embedded in the binary, populated by `app.config.js`.
 *  3. `'unknown'` / `null` — a local dev build with neither.
 *
 * Nothing here is a secret: a commit SHA and a timestamp are already public in
 * the repo, and no API URL, key or token is read.
 */
export interface BuildInfo {
  /** First 7 chars of the commit, or 'unknown'. */
  shortSha: string;
  /** ISO-8601 build timestamp, or null when unavailable. */
  builtAt: string | null;
  /** Where it came from: 'ci', an EAS profile name, or 'local'. */
  channel: string;
}

interface EmbeddedBuildInfo {
  sha?: string;
  shortSha?: string;
  builtAt?: string;
  channel?: string;
}

/** Reads the values Metro inlined into the bundle. */
function fromEnv(): Partial<BuildInfo> {
  // Dot notation on purpose: `expo/no-dynamic-env-var` rejects the equivalent
  // `process.env['EXPO_PUBLIC_*']` form, and this is the shape Metro inlines.
  const sha = process.env.EXPO_PUBLIC_BUILD_SHA;
  const builtAt = process.env.EXPO_PUBLIC_BUILD_TIME;
  const channel = process.env.EXPO_PUBLIC_BUILD_CHANNEL;
  return {
    ...(sha ? { shortSha: sha.slice(0, 7) } : {}),
    ...(builtAt ? { builtAt } : {}),
    ...(channel ? { channel } : {}),
  };
}

/** Reads the resolved Expo config embedded in the binary (app.config.js). */
function fromEmbeddedConfig(): Partial<BuildInfo> {
  const extra = (Constants.expoConfig?.extra ?? {}) as { buildInfo?: EmbeddedBuildInfo };
  const info = extra.buildInfo;
  if (!info) return {};
  const shortSha = info.shortSha ?? info.sha?.slice(0, 7);
  return {
    ...(shortSha && shortSha !== 'unknown' ? { shortSha } : {}),
    ...(info.builtAt ? { builtAt: info.builtAt } : {}),
    ...(info.channel ? { channel: info.channel } : {}),
  };
}

/**
 * Resolves the running build's identity. Never throws — a build without any
 * provenance metadata reports `unknown`, which is itself the useful answer.
 */
export function getBuildInfo(): BuildInfo {
  const merged = { ...fromEmbeddedConfig(), ...fromEnv() };
  return {
    shortSha: merged.shortSha ?? 'unknown',
    builtAt: merged.builtAt ?? null,
    channel: merged.channel ?? 'local',
  };
}

/**
 * `2026-09-11 15:36 UTC` — deliberately UTC, not device-local: the timestamp is
 * read against CI logs and GitHub run pages, which are all UTC.
 */
export function formatBuildTime(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())} ` +
    `${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())} UTC`
  );
}

/** The full string a tester can copy and paste into a bug report or chat. */
export function formatBuildInfo(info: BuildInfo = getBuildInfo()): string {
  const time = formatBuildTime(info.builtAt);
  const parts = [`build ${info.shortSha}`, info.channel];
  if (time) parts.push(time);
  return parts.join(' · ');
}
