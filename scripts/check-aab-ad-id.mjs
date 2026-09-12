#!/usr/bin/env node
// check-aab-ad-id.mjs — fail the release build when the shipped AAB still declares AD_ID.
//
// THE BUG THIS PREVENTS
//   `com.google.android.gms.permission.AD_ID` is not declared by this repo. It arrives
//   as a transitive Maven AAR, `com.facebook.android:facebook-android-sdk:18.+` (pulled
//   in by react-native-fbsdk-next), whose `facebook-core` manifest declares it. That
//   manifest is merged by Gradle at build time, so the permission is invisible to every
//   `git` grep, to every `node_modules` scan, and to `expo prebuild`. The only thing
//   removing it is `apps/mobile/plugins/withRemoveAdId.js`.
//
//   If that plugin is ever dropped from app.json's `plugins` array, renamed, or broken
//   by an SDK upgrade, the permission silently comes back and nothing fails — the build
//   succeeds, the AAB uploads, and the problem surfaces at the very end of the release
//   cycle as a Play review block: "This version includes the
//   com.google.android.gms.permission.AD_ID permission, but your Play Console
//   declaration indicates that your app doesn't use any advertising IDs." That block
//   costs the whole build. This has been observed on real artifacts: the versionCode 1
//   and 2 bundles declare AD_ID, versionCode 3 and 4 do not (the plugin landed in
//   b1ccefce, after versionCode 2).
//
// WHY THE AAB AND NOT THE SOURCE MANIFEST
//   Checking `android/app/src/main/AndroidManifest.xml` would only prove the plugin ran
//   — it writes a `tools:node="remove"` marker there. It would NOT prove the marker
//   actually won the manifest merge. The AAB holds the merged result, which is what
//   Play scans, so it is the only artifact worth asserting on.
//
// WHY A SUBSTRING TEST IS CORRECT HERE
//   `tools:*` attributes are build-time directives that the manifest merger consumes;
//   the merged manifest declares no `tools` namespace at all. Measured across the real
//   bundles: a removed permission leaves *no* trace, so absence is genuine absence. The
//   same artifacts prove the converse — a declared AD_ID appears as a plain string.
//
// THE INVARIANT
//   The AAB's merged manifest must not contain com.google.android.gms.permission.AD_ID,
//   while still containing at least one permission that is definitely declared.
//   That second half is not decoration: it is what stops an unreadable or empty
//   extraction from looking like a clean "absent" pass.
//
// USAGE
//   node scripts/check-aab-ad-id.mjs
//   node scripts/check-aab-ad-id.mjs --aab path/to/app-release.aab
//
// Exit code 0 = AD_ID is absent and the manifest was readable, 1 = anything else
// (including every parse failure — a guard that passes because it could not read its
// input is worse than no guard, so every "I don't know" path fails here).

import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** What a CI `bundleRelease` produces. */
const DEFAULT_AAB = 'apps/mobile/android/app/build/outputs/bundle/release/app-release.aab';

/** Entry inside the AAB holding the merged manifest (aapt2 protobuf). */
const MANIFEST_ENTRY = 'base/manifest/AndroidManifest.xml';

/** The permission this guard exists to keep out. */
export const AD_ID = 'com.google.android.gms.permission.AD_ID';

/**
 * A permission that is unconditionally declared (expo-camera, and not blocked in
 * app.json). Used purely as a read-sanity anchor: if this is missing, the extraction
 * is untrustworthy and absence of AD_ID means nothing.
 */
export const ANCHOR_PERMISSION = 'android.permission.CAMERA';

/**
 * Pull permission names out of the protobuf manifest.
 *
 * Matched from the leading lowercase segment so the length-prefix byte that precedes
 * each string in the protobuf is not captured as part of the name — a naive
 * /permission\.\w+/ leaves artefacts like "0android.permission.CAMERA".
 */
export function extractPermissions(manifestBytes) {
  const text = Buffer.isBuffer(manifestBytes)
    ? manifestBytes.toString('latin1')
    : String(manifestBytes);
  const matches = text.match(/(?:[a-z][a-z0-9_]*\.)+permission\.[A-Z][A-Z0-9_]*/g) ?? [];
  return [...new Set(matches)].sort();
}

/**
 * The single decision the guard makes, kept pure so it is testable.
 *
 * Fails closed on an unreadable manifest: an empty extraction cannot distinguish
 * "no permissions" from "wrong bytes", and only one of those is safe to ship.
 */
export function evaluateManifest(manifestBytes) {
  if (!manifestBytes || manifestBytes.length === 0) {
    throw new Error(`the AAB has no ${MANIFEST_ENTRY} (or it is empty)`);
  }

  const permissions = extractPermissions(manifestBytes);

  if (!permissions.includes(ANCHOR_PERMISSION)) {
    // An empty or garbled extraction looks exactly like "no AD_ID" — the one failure
    // mode a permission-absence check cannot tolerate, so it is fatal rather than a pass.
    throw new Error(
      `${ANCHOR_PERMISSION} is missing, so the manifest was not read correctly — absence of AD_ID would prove nothing.`,
    );
  }

  const adId = permissions.filter((p) => p === AD_ID);
  return { ok: adId.length === 0, permissions, adId };
}

/** Read the merged manifest out of the AAB. Requires `unzip` on PATH. */
export function readMergedManifest(aabPath) {
  try {
    return execFileSync('unzip', ['-p', aabPath, MANIFEST_ENTRY], {
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (err) {
    // Distinguish "unzip is not installed" from "the entry is missing" — the fixes differ.
    const message = String(err?.message ?? err);
    if (err?.code === 'ENOENT') {
      throw new Error('`unzip` was not found on PATH, so the AAB cannot be inspected');
    }
    throw new Error(`could not extract ${MANIFEST_ENTRY} from the AAB: ${message.split('\n')[0]}`);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key.slice(2)] = 'true';
    } else {
      args[key.slice(2)] = next;
      i += 1;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const aabPath = resolve(REPO_ROOT, args.aab ?? DEFAULT_AAB);
  const shown = args.aab ?? DEFAULT_AAB;

  if (!existsSync(aabPath)) {
    throw new Error(
      `no AAB at ${shown} — build it first (./gradlew :app:bundleRelease), or pass --aab <path>`,
    );
  }
  if (statSync(aabPath).size === 0) {
    throw new Error(`${shown} is 0 bytes`);
  }

  const manifest = readMergedManifest(aabPath);
  const { ok, permissions, adId } = evaluateManifest(manifest);

  console.log('\n🔍 AD_ID permission guard');
  console.log(`   AAB:      ${shown}`);
  console.log(`   manifest: ${manifest.length} bytes (${MANIFEST_ENTRY})`);
  console.log(`   permissions found: ${permissions.length}`);

  if (ok) {
    console.log(`\n✅ Pass — ${AD_ID} is absent from the merged manifest.`);
    console.log('   Play Console → App content → Advertising ID should stay "No".\n');
    return 0;
  }

  console.log('\n❌ FAIL — the shipped AAB still declares AD_ID:');
  for (const entry of adId) console.log(`     · ${entry}`);
  console.log('\n   This AAB cannot pass Play review while the declaration says "No", and');
  console.log('   declaring "Yes" would be untrue. The likely causes, in order:');
  console.log('     · ./plugins/withRemoveAdId.js dropped from app.json\'s "plugins" array');
  console.log('     · the plugin ran but lost the manifest merge (check its tools:node marker)');
  console.log('     · a new dependency declares AD_ID and something re-adds it after removal\n');
  return 1;
}

/**
 * Only self-execute when invoked directly.
 *
 * Without this, `import('./check-aab-ad-id.mjs')` in a test would run the guard and
 * call process.exit — the exported helpers above would be unreachable, which is the
 * opposite of why they are exported. Paths are realpath'd and lowercased because
 * Windows may hand back different casing or separators than import.meta.url.
 */
function isDirectRun() {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    const invoked = realpathSync(arg).toLowerCase();
    const self = realpathSync(fileURLToPath(import.meta.url)).toLowerCase();
    return invoked === self;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(`\n\n❌ AD_ID permission guard FAILED — ${err.message}`);
    console.error('   The guard could not confirm the AAB is free of AD_ID, so it fails rather');
    console.error('   than let a release ship that Play will block at upload time.\n');
    process.exit(1);
  }
}
