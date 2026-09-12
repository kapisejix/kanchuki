#!/usr/bin/env node
// inspect-aab-manifest.mjs — decode a built AAB's MERGED Android manifest and report
// what Play will actually scan, without going through Play Console.
//
// WHY THIS EXISTS
//   Play Console reads the *merged* manifest, not the source one, and the two disagree
//   in exactly the cases that cost a release. A permission can be:
//     · added transitively by a Maven AAR (AD_ID arrives this way, via
//       com.facebook.android:facebook-android-sdk -> facebook-core), so it appears in
//       no repo file and in no node_modules/**/AndroidManifest.xml either once Gradle
//       has resolved it;
//     · removed by a `tools:node="remove"` marker, which may or may not win the merge
//       depending on ordering — and `expo prebuild` cannot tell you which.
//   App bundle explorer shows the answer, but only after an upload, and only for a
//   version Play has already accepted. This script answers the same question from the
//   artifact on disk, before upload.
//
// WHY A PROTOBUF WALK AND NOT A SUBSTRING MATCH
//   scripts/check-aab-ad-id.mjs deliberately uses a substring test — for its single
//   yes/no question that is the right trade: fewer moving parts on a path that gates a
//   release. This script has to be exact about *which* element a string belongs to
//   (a permission name inside an unrelated string must not be reported as a declared
//   permission), so it decodes the real structure:
//
//     XmlNode      { 1: element, 2: text, 3: source position }
//     XmlElement   { 1: namespace decls, 2: namespace uri, 3: name,
//                    4: attributes (repeated), 5: children (repeated XmlNode) }
//     XmlAttribute { 1: namespace uri, 2: name, 3: value,
//                    4: source position, 5: resource id, 6: compiled item }
//
//   The one that bites: `XmlElement.child` holds XmlNode WRAPPERS, not elements, and
//   `XmlNode` is a oneof — a whitespace text node has no field 1 at all and carries
//   only `{2: text, 3: source}`. Reading a child as if it were an element therefore
//   picks up its source-position message as the element name and yields binary
//   garbage. decodeNode() exists to do that unwrapping in one place.
//
//   Verified field numbering against real bundles rather than assumed: in the
//   versionCode 4 AAB the root element decodes as name "manifest", its versionCode
//   attribute carries resource id 16843291 (0x0101021b, the platform's
//   android:versionCode id) and value "4" — matching app.json. If a future aapt2
//   renumbers these fields the self-check below fails loudly instead of reporting
//   an empty manifest, which is the failure mode that would matter.
//
// THE TRAP THIS DOCUMENTS
//   A `tools:node="remove"` entry does NOT survive into the bundle as a marker. The
//   merged manifest declares no `tools` namespace at all, and a removed permission is
//   gone completely. So absence proves removal and presence proves a real declaration —
//   which is why the permission list below is trustworthy, and why "but the string is
//   still in the .aab" has never been a valid reading.
//
// USAGE
//   node scripts/inspect-aab-manifest.mjs                    # newest local Gradle output
//   node scripts/inspect-aab-manifest.mjs --aab path/to.aab   # any bundle
//   node scripts/inspect-aab-manifest.mjs --json              # machine-readable
//   node scripts/inspect-aab-manifest.mjs --strict            # exit 1 if AD_ID is declared
//
// Exit codes: 0 = reported successfully (regardless of what was found) · 1 = the
// manifest could not be read, or --strict found AD_ID. A report is not a verdict, so
// finding something alarming is still a successful run — --strict is how you opt into
// turning it into a gate.

import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** What a CI `bundleRelease` produces; matches check-aab-ad-id.mjs on purpose. */
const DEFAULT_AAB = 'apps/mobile/android/app/build/outputs/bundle/release/app-release.aab';

/** Entry inside the AAB holding the merged manifest (aapt2 protobuf). */
export const MANIFEST_ENTRY = 'base/manifest/AndroidManifest.xml';

/** The permission that blocks a Play rollout when the Console declaration says "No". */
export const AD_ID = 'com.google.android.gms.permission.AD_ID';

/**
 * Elements whose `android:name` is a permission the app asks for. Both spellings
 * matter: `uses-permission-sdk-23` is what the platform rewrites minSdk-gated
 * permissions into, and it is a real declaration.
 */
const PERMISSION_ELEMENTS = new Set(['uses-permission', 'uses-permission-sdk-23']);

/**
 * Human-readable grouping. Not a source attribution — these are families, and the
 * note says who usually contributes them rather than claiming provenance this script
 * cannot prove from the merged manifest alone.
 */
const FAMILIES = [
  {
    match: (p) => p === AD_ID,
    label: 'Advertising ID',
    note: 'must be absent / declared "No" — see docs/PLAY-STORE-LAUNCH-CHECKLIST.md §3',
    flag: true,
  },
  {
    match: (p) => p.includes('.ACCESS_ADSERVICES_'),
    label: 'Privacy Sandbox / Ad services',
    note: 'shipped by the Facebook SDK alongside the advertising-ID concern',
    flag: true,
  },
  {
    match: (p) => p === 'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
    label: 'Install referrer',
    note: 'Meta/Facebook SDK attribution',
    flag: false,
  },
  {
    match: (p) => p === 'android.permission.RECORD_AUDIO',
    label: 'Microphone',
    note: "declared by expo-camera's library manifest; blocked via app.json blockedPermissions",
    flag: true,
  },
  {
    match: (p) => /^android\.permission\.READ_MEDIA_|READ_EXTERNAL_STORAGE$/.test(p),
    label: 'Media / storage read',
    note: 'blocked in app.json while the gallery save is write-only',
    flag: true,
  },
  {
    match: (p) => /android\.permission\.(ACCESS_FINE|ACCESS_COARSE)_LOCATION$/.test(p),
    label: 'Location',
    note: 'optional one-shot store pin — declared on the Data safety form',
    flag: false,
  },
  {
    match: (p) => p === 'android.permission.CAMERA',
    label: 'Camera',
    note: 'core product-capture permission',
    flag: false,
  },
];

/** Read the merged manifest out of the AAB. Requires `unzip` on PATH. */
export function readMergedManifest(aabPath) {
  try {
    return execFileSync('unzip', ['-p', aabPath, MANIFEST_ENTRY], {
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (err) {
    if (err?.code === 'ENOENT') {
      throw new Error('`unzip` was not found on PATH, so the AAB cannot be inspected');
    }
    throw new Error(
      `could not extract ${MANIFEST_ENTRY} from the AAB: ${String(err?.message ?? err).split('\n')[0]}`,
    );
  }
}

/**
 * Read a base-128 varint.
 *
 * Accumulated with arithmetic rather than `|` / `<<`: lengths in this manifest exceed
 * 2^31 (the root node is ~30 KB but the varint encoding is byte-oriented), and 32-bit
 * bitwise ops would silently corrupt values above 2^31 — a wrong length slices the
 * buffer in the wrong place and yields a plausible-looking but wrong permission list.
 */
function readVarint(buf, start, end) {
  let result = 0;
  let shift = 0;
  let i = start;
  while (i < end) {
    const byte = buf[i];
    i += 1;
    result += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return [result, i];
    shift += 7;
  }
  throw new Error('truncated varint — the manifest is malformed or not a protobuf');
}

/**
 * Iterate the protobuf fields in `[start, end)`.
 *
 * Yields `{ field, wire }` plus either `value` (wire 0) or `start`/`end` (wire 2).
 * Wire types 1 and 5 are skipped by width — this manifest only uses 0 and 2, but
 * bailing out on an unexpected type would turn an unrelated aapt2 addition into a
 * hard failure, whereas skipping it cannot affect the fields we read.
 */
export function* fields(buf, start = 0, end = buf.length) {
  let i = start;
  while (i < end) {
    const [tag, afterTag] = readVarint(buf, i, end);
    i = afterTag;
    const field = Math.floor(tag / 8);
    const wire = tag % 8;

    if (wire === 0) {
      const [value, next] = readVarint(buf, i, end);
      yield { field, wire, value };
      i = next;
    } else if (wire === 2) {
      const [length, next] = readVarint(buf, i, end);
      yield { field, wire, start: next, end: next + length };
      i = next + length;
    } else if (wire === 1) {
      yield { field, wire };
      i += 8;
    } else if (wire === 5) {
      yield { field, wire };
      i += 4;
    } else {
      throw new Error(`unsupported protobuf wire type ${wire} at byte ${i}`);
    }
  }
}

/**
 * Unwrap one XmlNode and return the XmlElement inside it, or null.
 *
 * Null is the correct answer for a text node (whitespace between elements): those
 * carry no field 1, so there is no element to return. Callers skip nulls — they are
 * the overwhelming majority of nodes in a real manifest.
 */
export function decodeNode(buf, start, end) {
  for (const field of fields(buf, start, end)) {
    if (field.wire === 2 && field.field === 1) {
      return decodeElement(buf, field.start, field.end);
    }
  }
  return null;
}

/** Decode one XmlElement (fields as numbered in the header comment). */
export function decodeElement(buf, start, end) {
  const element = { name: '', attributes: new Map(), children: [] };

  for (const field of fields(buf, start, end)) {
    if (field.wire !== 2) continue;

    if (field.field === 3) {
      element.name = buf.toString('utf8', field.start, field.end);
    } else if (field.field === 4) {
      const attr = decodeAttribute(buf, field.start, field.end);
      if (attr.name) element.attributes.set(attr.name, attr.value);
    } else if (field.field === 5) {
      // Field 5 is repeated XmlNode, so unwrap before recursing — see decodeNode().
      const child = decodeNode(buf, field.start, field.end);
      if (child) element.children.push(child);
    }
  }

  return element;
}

/** Decode one XmlAttribute. `name`/`value` are what matter; the rest is ignored. */
export function decodeAttribute(buf, start, end) {
  const attribute = { name: '', value: '' };

  for (const field of fields(buf, start, end)) {
    if (field.wire !== 2) continue;
    if (field.field === 2) attribute.name = buf.toString('utf8', field.start, field.end);
    else if (field.field === 3) attribute.value = buf.toString('utf8', field.start, field.end);
  }

  return attribute;
}

/** Depth-first walk of the element tree. */
function* walkElements(element) {
  yield element;
  for (const child of element.children) yield* walkElements(child);
}

/**
 * Decode the merged manifest into the facts worth reporting.
 *
 * Fails closed on a manifest that does not look like one. Without that check a
 * misparse returns zero permissions and a confident `versionCode: null`, which reads
 * as "this build is clean" — the one wrong answer worse than an error.
 */
export function decodeManifest(buf) {
  if (!buf || buf.length === 0) {
    throw new Error(`the AAB has no ${MANIFEST_ENTRY} (or it is empty)`);
  }

  // The entry file IS an XmlNode; its element is the <manifest> tag.
  const root = decodeNode(buf, 0, buf.length);

  if (!root || root.name !== 'manifest') {
    throw new Error(
      `the root element decoded as ${JSON.stringify(root?.name ?? null)}, not "manifest" — refusing to report on an unreliable read`,
    );
  }

  const permissions = [];
  const declaredPermissions = [];
  const requiredPermissions = [];
  let usesSdk = null;

  for (const element of walkElements(root)) {
    if (PERMISSION_ELEMENTS.has(element.name)) {
      const name = element.attributes.get('name');
      if (name) permissions.push(name);
    } else if (element.name === 'permission') {
      // <permission> DECLARES a permission the app offers to others. Kept separate:
      // it is not something this app requests, and counting it as one would overstate
      // what Play compares against the Data safety answers.
      const name = element.attributes.get('name');
      if (name) declaredPermissions.push(name);
    } else if (element.name === 'uses-sdk') {
      usesSdk = {
        minSdkVersion: Number(element.attributes.get('minSdkVersion') ?? Number.NaN) || null,
        targetSdkVersion: Number(element.attributes.get('targetSdkVersion') ?? Number.NaN) || null,
      };
    }

    // `android:permission` on a component is a permission the CALLER must hold — the
    // exact inverse of a requested permission. A substring scan cannot tell them apart
    // and so over-reports: in the versionCode 4 bundle this is where
    // android.permission.DUMP (<receiver>) and BIND_JOB_SERVICE (<service>) come from,
    // and neither is something the app asks for. Reported, but never merged into the
    // requested list.
    const required = element.attributes.get('permission');
    if (required && !PERMISSION_ELEMENTS.has(element.name)) {
      requiredPermissions.push(`${required}  (required by <${element.name}> callers)`);
    }
  }

  const versionCode = Number(root.attributes.get('versionCode') ?? Number.NaN);

  return {
    packageName: root.attributes.get('package') ?? null,
    versionCode: Number.isInteger(versionCode) ? versionCode : null,
    versionName: root.attributes.get('versionName') ?? null,
    permissions: [...new Set(permissions)].sort(),
    declaredPermissions: [...new Set(declaredPermissions)].sort(),
    requiredPermissions: [...new Set(requiredPermissions)].sort(),
    usesSdk,
    hasAdId: permissions.includes(AD_ID),
  };
}

/** Group a permission list by family; anything unmatched lands in "Other". */
export function groupPermissions(permissions) {
  const groups = [];
  const remaining = new Set(permissions);

  for (const family of FAMILIES) {
    const members = [...remaining].filter((p) => family.match(p)).sort();
    if (members.length === 0) continue;
    for (const member of members) remaining.delete(member);
    groups.push({ ...family, members });
  }

  if (remaining.size > 0) {
    groups.push({
      label: 'Other',
      note: 'framework permissions',
      flag: false,
      members: [...remaining].sort(),
    });
  }

  return groups;
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
  const json = Boolean(args.json);
  const strict = Boolean(args.strict);

  if (!existsSync(aabPath)) {
    throw new Error(
      `no AAB at ${shown} — build one (apps/mobile: ./gradlew :app:bundleRelease), or pass --aab <path>`,
    );
  }

  const buffer = readMergedManifest(aabPath);
  const manifest = decodeManifest(buffer);
  const groups = groupPermissions(manifest.permissions);
  const sizeKb = (statSync(aabPath).size / 1024).toFixed(1);

  if (json) {
    console.log(
      JSON.stringify(
        {
          aab: shown,
          aabSizeBytes: statSync(aabPath).size,
          manifestBytes: buffer.length,
          ...manifest,
          groups: groups.map((g) => ({ label: g.label, members: g.members })),
        },
        null,
        2,
      ),
    );
    return strict && manifest.hasAdId ? 1 : 0;
  }

  console.log('\n📋 AAB merged-manifest inspection');
  console.log(`   AAB:      ${shown} (${sizeKb} KB)`);
  console.log(`   manifest: ${buffer.length} bytes (${MANIFEST_ENTRY})`);
  console.log(`   package:  ${manifest.packageName ?? '?'}`);
  console.log(
    `   version:  versionCode ${manifest.versionCode ?? '?'}${
      manifest.versionName ? ` · versionName ${manifest.versionName}` : ''
    }`,
  );
  if (manifest.usesSdk) {
    console.log(
      `   sdk:      min ${manifest.usesSdk.minSdkVersion ?? '?'} · target ${manifest.usesSdk.targetSdkVersion ?? '?'}`,
    );
  }

  console.log(`\n   ${manifest.permissions.length} permissions requested:\n`);
  for (const group of groups) {
    console.log(`   ${group.flag ? '⚠️ ' : '   '}${group.label} — ${group.note}`);
    for (const member of group.members) console.log(`        ${member}`);
  }

  if (manifest.declaredPermissions.length > 0) {
    console.log(
      `\n   ${manifest.declaredPermissions.length} permission(s) DECLARED for other apps`,
    );
    console.log('   (offered to callers, not requested by this app):');
    for (const member of manifest.declaredPermissions) console.log(`        ${member}`);
  }

  if (manifest.requiredPermissions.length > 0) {
    console.log(`\n   ${manifest.requiredPermissions.length} permission(s) REQUIRED OF CALLERS`);
    console.log('   (the inverse of a request — a grep for "permission" counts these too):');
    for (const member of manifest.requiredPermissions) console.log(`        ${member}`);
  }

  console.log('\n   ── Advertising ID ──');
  if (manifest.hasAdId) {
    console.log(`   ❌ ${AD_ID} IS DECLARED.`);
    console.log('      Play blocks the rollout while the Console declaration says "No".');
    console.log('      Check ./apps/mobile/plugins/withRemoveAdId.js is still in');
    console.log('      app.json\'s "plugins" array, then rebuild.');
  } else {
    console.log(`   ✅ ${AD_ID} is absent.`);
    console.log('      Play Console → App content → Advertising ID should stay "No".');
  }

  console.log('\n   Reminder: `tools:*` markers do not survive into the bundle, so this');
  console.log('   list is declaration-accurate — absent means removed, present means real.\n');

  return strict && manifest.hasAdId ? 1 : 0;
}

/**
 * Self-execute only when invoked directly, so the exported helpers stay importable
 * from a test or another script. realpath + lowercase because Windows may hand back
 * different casing or separators than import.meta.url.
 */
function isDirectRun() {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return (
      realpathSync(arg).toLowerCase() === realpathSync(fileURLToPath(import.meta.url)).toLowerCase()
    );
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(`\n\n❌ AAB manifest inspection FAILED — ${err.message}`);
    console.error('   No report was produced: an unreliable read would have looked like a');
    console.error('   clean manifest. Fix the input above and re-run.\n');
    process.exit(1);
  }
}
