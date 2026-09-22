// ── The retired IDM-VTON try-on path, held deleted ─────────────────
//
// `generateIdmVtonTryon()` was deleted from `fal-client.ts` on 2026-09-18, and a
// second copy of the same call (the demo script's `vton` mode) with it. Neither
// had ever run: the helper had no caller since the 2026-08-30 studio-styles
// rework, and its endpoint and parameter names were never verified against the
// model's schema — the same shape as `generateFashnTryon()`, which turned out to
// be pointing at a URL that would 404 (RC-027). Its weights are also
// CC BY-NC-SA-ND, which blocks a fine-tune of them (ADR-006).
//
// Deleting it is not enough on its own, which is the whole reason this file
// exists: a function that no longer exists cannot be found by a reader, and a
// reviewer looking at a diff that re-adds it has no way to know it was removed
// deliberately. A grep guard is the only mechanism that survives that, and the
// repo already runs this class of check in CI (`scripts/check-*-guard.sh` is a
// shell equivalent; this one is a test so it needs no CI change and also fires
// on every local `pnpm test`).
//
// Scope: `apps/*`, `packages/*` and `scripts/` — i.e. everything that could
// deliberately wire the model in. `services/` is excluded because nothing in the
// app imports it (the self-hosted FASHN service was retired from the path long
// before this), and docs/ is excluded because docs *should* record the history.
//
// Comments are stripped before matching. Two reasons, both learned the hard way
// on the sibling /v1/ guard: this file's own tombstone comments name the thing,
// and a guard that fires on prose gets weakened or deleted by the next person
// who trips it. What remains is code — a call, an endpoint string, a parameter
// name — which is exactly the set of things that can actually be wired up.

import { type Dirent, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');

const SCAN_DIRS = ['apps', 'packages', 'scripts'] as const;
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  '.expo',
  'coverage',
  '__pycache__',
]);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
/** This file names the retired identifiers in its patterns, so it cannot scan itself. */
const SELF = 'retired-tryon-guard.test.ts';

function collectCodeFiles(dir: string, out: string[] = []): string[] {
  let entries: Dirent[] | undefined;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collectCodeFiles(full, out);
    } else if (CODE_EXTENSIONS.has(extname(entry.name)) && entry.name !== SELF) {
      out.push(full);
    }
  }
  return out;
}

// Memoised deliberately. Without it every test below re-walks `apps` + `packages`
// + `scripts` and re-reads every code file synchronously, and on Windows the
// first walk goes over vitest's 5s default under parallel load (87 files in one
// run) while taking under a second alone — a flake whose only symptom is this
// file failing intermittently for no change in the code it guards. Nothing in
// the scan mutates the result, and the files cannot change mid-run.
let sourcesCache: Record<string, string> | undefined;
function loadSources(): Record<string, string> {
  if (sourcesCache) return sourcesCache;
  const sources: Record<string, string> = {};
  for (const dir of SCAN_DIRS) {
    for (const file of collectCodeFiles(join(REPO_ROOT, dir))) {
      sources[relative(REPO_ROOT, file).replace(/\\/g, '/')] = readFileSync(file, 'utf8');
    }
  }
  sourcesCache = sources;
  return sources;
}

/**
 * Drops `/* … *\/` blocks and `// …` line comments, keeping the line's own
 * leading whitespace so line counts are not what matters here. `//` inside a URL
 * is preserved (the character before it is `:`, not whitespace), so a real call
 * on a line containing `https://…` is still seen.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

/** What could never be right to re-add, and why each one is a real signal. */
const RETIRED = [
  ['the IDM-VTON endpoint or engine value', /\bidm[-_]vton\b/i],
  ['the deleted generateIdmVtonTryon() helper', /generateIdmVtonTryon/],
  ["IDM-VTON's parameter names", /\b(?:human_img_url|garm_img_url|garment_des)\b/],
] as const;

/** Files containing live (non-comment) references to the retired path. */
function findRetiredTryon(sources: Record<string, string>): string[] {
  const hits: string[] = [];
  for (const [file, source] of Object.entries(sources)) {
    const code = stripComments(source);
    for (const [what, pattern] of RETIRED) {
      if (pattern.test(code)) hits.push(`${file} → ${what}`);
    }
  }
  return hits.sort();
}

describe('retired IDM-VTON try-on path', () => {
  // 30s, not the 5s default: this is the one test that performs the full
  // synchronous repo walk (the rest reuse the memoised result). Budgeted for
  // contention, not because the walk is slow — it is under a second alone.
  it('scans the app, package and script sources — not vacuously', () => {
    const files = Object.keys(loadSources());
    expect(files.length, 'the source walk found almost nothing').toBeGreaterThan(200);
    // The walk is the part that can silently break (renamed dir, moved root), and
    // a broken walk looks identical to a clean repo. Pin the two files this guard
    // exists to watch.
    expect(files).toContain('apps/api/src/lib/fal-client.ts');
    expect(files).toContain('scripts/studio-shoot-demo.mjs');
  }, 30_000);

  it('still has FASHN v1.5 as the live try-on step', () => {
    // Positive control: confirms the scan actually read fal-client.ts, so the
    // "no violations" result below cannot come from an unreadable file.
    const source = loadSources()['apps/api/src/lib/fal-client.ts'] ?? '';
    expect(
      source,
      'fal-client.ts has no FASHN try-on call — was the live path moved or removed?',
    ).toContain('fal-ai/fashn/tryon/v1.5');
  });

  it('wires no IDM-VTON try-on path anywhere', () => {
    expect(
      findRetiredTryon(loadSources()),
      'IDM-VTON was deleted deliberately (never called, unverified schema, NC-ND weights — RC-027, ADR-006). Use the FASHN v1.5 step instead; if this is a doc/comment, it should be in docs/ or in a comment.',
    ).toEqual([]);
  });

  // ── Self-proof ───────────────────────────────────────────────────
  // Without this block, the check above is indistinguishable from one that always
  // passes — the exact failure mode that let the project photo never reach the
  // model for three rounds (RC-027).
  describe('the guard can fail', () => {
    it('flags the endpoint in a real call', () => {
      expect(
        findRetiredTryon({
          'good.ts': "await runFalTask('fal-ai/fashn/tryon/v1.5', input)",
          'bad.ts': "await runFalTask('fal-ai/idm-vton', input)",
        }),
      ).toEqual(['bad.ts → the IDM-VTON endpoint or engine value']);
    });

    it('flags the helper, and an engine value in config', () => {
      expect(
        findRetiredTryon({
          'a.ts': 'const r = await generateIdmVtonTryon(human, garment)',
          'b.ts': "const ENGINE: StudioEngine = 'idm_vton'",
        }),
      ).toEqual([
        'a.ts → the deleted generateIdmVtonTryon() helper',
        'b.ts → the IDM-VTON endpoint or engine value',
      ]);
    });

    it('flags its parameter names, which nothing else in the codebase uses', () => {
      expect(
        findRetiredTryon({
          'bad.ts': 'body: JSON.stringify({ human_img_url: h, garm_img_url: g, garment_des: d })',
          // FASHN's own, different, parameter must not trip it.
          'good.ts':
            "body: JSON.stringify({ model_image: h, garment_image: g, garment_photo_type: 'flat-lay' })",
        }),
      ).toEqual(["bad.ts → IDM-VTON's parameter names"]);
    });

    it('does not fire on prose about it', () => {
      // A guard that fails on comments gets weakened to stop the noise — the
      // sibling /v1/ guard has this lesson written into it, and this repo's
      // tombstone comment names the model on purpose.
      expect(
        findRetiredTryon({
          'commented.ts':
            '// The old generateIdmVtonTryon() posted to fal-ai/idm-vton with human_img_url.\n/* Also mentioned in a block comment: idm_vton */\nconst fine = 1',
        }),
      ).toEqual([]);
    });

    it('still sees a call on a line that contains a URL with // in it', () => {
      // The reason comments are stripped with a whitespace anchor rather than a
      // naive split on '//': this line's endpoint must survive the strip.
      expect(
        findRetiredTryon({
          'bad.ts': "await fetch('https://queue.fal.run/fal-ai/idm-vton', opts) // legacy",
        }),
      ).toEqual(['bad.ts → the IDM-VTON endpoint or engine value']);
    });
  });
});
