#!/usr/bin/env node
// check-android-version-code.mjs — fail CI when the next Play upload would be rejected.
//
// THE BUG THIS PREVENTS
//   Play rejects an upload whose versionCode has already been used, and that
//   rejection happens at the END of a release cycle — after the build, at upload
//   time. It has already happened twice here: run 34612919927 built versionCode 2
//   when 2 was in use, and app.json sat at versionCode 3 while 3 was already on
//   Play (caught by hand on 2026-09-12, not by CI).
//
// WHY THE RELEASE LOG IS THE SOURCE OF TRUTH
//   "Highest versionCode ever uploaded" lives on Google's servers. Nothing in git
//   can be diffed against it, so docs/PLAY-STORE-RELEASES.md stands in for it.
//   This guard is what makes that file load-bearing instead of decorative: if the
//   log is not updated, or app.json is not bumped, CI says so.
//
// THE INVARIANT
//   app.json versionCode  >  highest versionCode in the log's `## Uploads` table
//   i.e. the log records what is used, app.json holds the reserved NEXT number.
//   After a successful upload you therefore add the row AND bump app.json in the
//   same commit — otherwise the reserved number has been consumed and CI goes red
//   until the next one is reserved. See the rule in the log itself.
//
// USAGE
//   node scripts/check-android-version-code.mjs
//   node scripts/check-android-version-code.mjs --app-json <path> --log <path>
//
// Exit code 0 = the reserved versionCode is uploadable, 1 = it is not (including
// any parse failure — a guard that passes because it could not read its inputs is
// worse than no guard, so every "I don't know" path is a failure here).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_APP_JSON = 'apps/mobile/app.json';
const DEFAULT_LOG = 'docs/PLAY-STORE-RELEASES.md';

/** Section of the release log that lists what Play has actually accepted. */
const UPLOADS_HEADING = /^##\s+Uploads\s*$/m;

/** A markdown table cell, minus the decoration a human may have typed in it. */
const cleanCell = (cell) => cell.trim().replace(/[`*]/g, '');

/**
 * Read `expo.android.versionCode` out of app.json.
 *
 * A non-integer is a failure, not a default: `"4"` (string) or a missing key
 * would otherwise compare as NaN and silently make the guard a no-op.
 */
export function readAppVersionCode(jsonText, label) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`${label} is not valid JSON: ${err.message}`);
  }

  const versionCode = parsed?.expo?.android?.versionCode;
  if (!Number.isInteger(versionCode)) {
    throw new Error(
      `${label} has no integer expo.android.versionCode (got ${JSON.stringify(versionCode)})`,
    );
  }
  return versionCode;
}

/**
 * Pull every uploaded versionCode out of the `## Uploads` table.
 *
 * TWO FILTERS, because one was not enough. Scoping by heading alone is unsafe:
 * the log also holds an "ambiguous builds" table whose first column is a run ID,
 * and while writing this guard that table was read as an upload row and its
 * `34619372677` became the max — a false FAIL. (It fails safe, but a guard that
 * cries wolf is one people learn to bypass.)
 *
 *   1. STRUCTURAL — only the `## Uploads` section is read, ending at the next
 *      heading of ANY level. The ambiguous-builds table sits under a `###`, so
 *      it falls outside the window.
 *   2. CONTENT — a row counts only if it also carries an upload date. Every row
 *      Play accepted has one; a pasted run table does not.
 *
 * Returns `{ rows, skipped }`. A row that looks like an upload but has no date
 * is returned as skipped (and reported by the caller) rather than dropped, so a
 * malformed row is visible instead of quietly letting a used number pass as
 * free. An empty `rows` is not silently tolerated — `evaluate` rejects it.
 */
export function readUploadedVersionCodes(markdownText, label) {
  const heading = UPLOADS_HEADING.exec(markdownText);
  if (!heading) {
    throw new Error(`${label} has no "## Uploads" section — the guard cannot find what is used`);
  }

  // From the heading to the next heading of ANY level (or EOF) — the log's
  // other tables live under `###` subsections, so they fall outside the window.
  // (Matching only h1/h2 does NOT work: `###` backtracks to `#` + `#` and the
  // anchored regex fails, leaving those tables inside the section entirely.)
  const rest = markdownText.slice(heading.index + heading[0].length);
  const nextHeading = /^#+\s+/m.exec(rest);
  const section = nextHeading ? rest.slice(0, nextHeading.index) : rest;

  const rows = [];
  const skipped = [];

  for (const line of section.split(/\r?\n/)) {
    if (!line.trimStart().startsWith('|')) continue;

    const cells = line.split('|').slice(1, -1).map(cleanCell);
    if (cells.length === 0) continue;

    // Skips the header ("versionCode") and the |---|---| separator row.
    if (!/^\d+$/.test(cells[0] ?? '')) continue;

    const row = { versionCode: Number(cells[0]), version: cells[1], uploaded: cells[2] };

    // Loosely matched so `2026-9-9` counts too — a strict regex would drop the
    // row and hand back a too-low "last uploaded", which is the unsafe direction.
    if (!cells.some((cell) => /^\d{4}-\d{1,2}-\d{1,2}$/.test(cell))) {
      skipped.push(row);
      continue;
    }

    rows.push(row);
  }

  return { rows, skipped };
}

/** The single decision the guard makes, kept pure so it is testable. */
export function evaluate(appVersionCode, rows) {
  // Fail closed on an empty log. `Math.max()` of nothing is -Infinity, which
  // makes every versionCode look greater and turns the guard into a no-op — the
  // exact silent-pass this script exists to prevent, so it is checked here at
  // the decision point rather than trusted to the caller.
  if (rows.length === 0) {
    throw new Error('no uploaded versionCode could be read from the release log');
  }

  const lastUploaded = Math.max(...rows.map((row) => row.versionCode));
  return { lastUploaded, ok: appVersionCode > lastUploaded };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1]?.startsWith('--') ? 'true' : argv[(i += 1)];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const appJsonPath = resolve(REPO_ROOT, args['app-json'] ?? DEFAULT_APP_JSON);
  const logPath = resolve(REPO_ROOT, args.log ?? DEFAULT_LOG);

  for (const [path, label] of [
    [appJsonPath, 'app.json'],
    [logPath, 'the release log'],
  ]) {
    if (!existsSync(path)) throw new Error(`${label} not found at ${path}`);
  }

  const appVersionCode = readAppVersionCode(readFileSync(appJsonPath, 'utf8'), appJsonPath);
  const { rows, skipped } = readUploadedVersionCodes(readFileSync(logPath, 'utf8'), logPath);
  const { lastUploaded, ok } = evaluate(appVersionCode, rows);

  const table = rows
    .map((row) => `     ${String(row.versionCode).padStart(3)}  ${row.uploaded ?? '?'}`)
    .join('\n');

  console.log('\n📦 Android versionCode guard');
  console.log(
    `   app.json reserves:  ${appVersionCode}  (${args['app-json'] ?? DEFAULT_APP_JSON})`,
  );
  console.log(`   Play has accepted:\n${table}`);
  for (const row of skipped) {
    console.log(
      `   ⚠️  skipped versionCode ${row.versionCode} — no upload date, so it does not count as used`,
    );
  }

  if (ok) {
    console.log(`\n✅ Pass — ${appVersionCode} > ${lastUploaded}, so this build is uploadable.\n`);
    return 0;
  }

  console.log(
    `\n❌ FAIL — app.json reserves ${appVersionCode}, but ${lastUploaded} is already uploaded.`,
  );
  console.log('   Play refuses an upload whose versionCode was already used, so a build from');
  console.log(
    '   this commit cannot be published — the exact rejection that run 34612919927 hit.\n',
  );
  console.log('   Fix one of these:');
  console.log(
    `     · about to release → set expo.android.versionCode to ${lastUploaded + 1} in ${args['app-json'] ?? DEFAULT_APP_JSON}`,
  );
  console.log(
    `     · just uploaded ${lastUploaded} → add its row to ${args.log ?? DEFAULT_LOG} AND reserve ${lastUploaded + 1}, in the same commit`,
  );
  console.log('\n   Rule: app.json always holds the NEXT number, the log holds the USED ones.\n');
  return 1;
}

try {
  process.exit(main());
} catch (err) {
  // Unreadable or malformed input is a FAILURE, not a skip — the guard fails
  // closed, and says which input it could not trust. A raw stack trace here
  // reads as "the script is broken" when the real message is "your input is".
  console.error(`\n\n❌ Android versionCode guard FAILED — ${err.message}`);
  console.error('   The guard could not establish which versionCode is safe to upload, so it');
  console.error('   fails rather than let a duplicate through. Fix the input above and re-run.\n');
  process.exit(1);
}
