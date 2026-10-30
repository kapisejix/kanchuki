// T2.6: two XSS-adjacent sinks that were each guarded by hand at some call sites and not others.
//
// 1. `window.open(url, '_blank')` does not default to noopener the way `<a target=_blank>` does, so
//    the opened page keeps `window.opener` (reverse tabnabbing). Three wa.me / api.whatsapp.com
//    sites missed it while four siblings had it. The scan is derived from the sources, so a new
//    `_blank` call without `noopener` fails and names its file.
// 2. JSON-LD in `<script>` must escape `<` through the tested `ldJson` helper. The hand-copied
//    `.replace(/</g, ...)` survives only on pages that serialise static constants.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_SRC = path.resolve(__dirname, '../..');
const toPosix = (p: string) => p.split(path.sep).join('/');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

// `window.open(` up to its closing paren, allowing two levels of nested parens
// (a template literal wrapping `encodeURIComponent(...)`).
const OPEN_CALL = /window\.open\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g;

const blankCalls = sources(WEB_SRC).flatMap((file) =>
  (readFileSync(file, 'utf8').match(OPEN_CALL) ?? [])
    .filter((call) => call.includes("'_blank'"))
    .map((call) => ({ file: toPosix(path.relative(WEB_SRC, file)), call })),
);

describe('window.open new-tab calls', () => {
  it('finds the known _blank sites (the scan is not vacuous)', () => {
    expect(blankCalls.length).toBeGreaterThanOrEqual(6);
  });

  it('passes noopener on every _blank call', () => {
    expect(blankCalls.filter(({ call }) => !call.includes('noopener')).map(({ file }) => file)).toEqual([]);
  });
});

// `ldJson` itself plus the static-constant JSON-LD pages that keep their own copy; every other page uses `ldJson`.
const ESCAPE_COPIES = ['app/[store]/lib/store-seo.ts', 'app/faq/page.tsx', 'app/page.tsx', 'app/pricing/page.tsx'];
const HAND_ESCAPE = /\.replace\(\/<\/g/;

describe('JSON-LD escaping', () => {
  it('keeps the hand-copied escape to ldJson and the static-constant pages', () => {
    const copies = sources(WEB_SRC)
      .filter((file) => HAND_ESCAPE.test(readFileSync(file, 'utf8')))
      .map((file) => toPosix(path.relative(WEB_SRC, file)))
      .sort();
    expect(copies).toEqual(ESCAPE_COPIES);
  });

  it('serialises the retailer-controlled stores directory through ldJson', () => {
    const src = readFileSync(path.join(WEB_SRC, 'app/stores/page.tsx'), 'utf8');
    expect(src).toContain('ldJson(itemList)');
    expect(src).toContain("from '../[store]/lib/store-seo'");
  });
});
