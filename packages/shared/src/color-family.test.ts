import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COLOR_FAMILIES, normalizeColorFamily } from './color-family.js';

const norm = (v: string | null | undefined) => normalizeColorFamily(v, DEFAULT_COLOR_FAMILIES);

describe('normalizeColorFamily — exact name or alias', () => {
  it.each([
    ['pink', 'pink'],
    ['Pink', 'pink'],
    ['  PINK  ', 'pink'],
    ['Mustard', 'yellow'],
    ['haldi', 'yellow'],
    ['Bottle   Green', 'green'],
    ['Off White', 'cream'],
    ['off-white', 'cream'],
    ['Wine', 'maroon'],
    ['Multi-Color', 'multi'],
  ])('%s -> %s', (input, want) => {
    expect(norm(input)).toBe(want);
  });

  it('longest alias wins: "peacock blue" is teal, not blue', () => {
    expect(norm('Peacock Blue')).toBe('teal');
    expect(norm('navy blue')).toBe('navy');
  });
});

describe('normalizeColorFamily — keyword fallback (whole word)', () => {
  it.each([
    ['light mustard print', 'yellow'],
    ['dark navy blue floral', 'navy'], // "navy blue" swallows "blue"
    ['pure white kurta', 'white'],
  ])('%s -> %s', (input, want) => {
    expect(norm(input)).toBe(want);
  });

  it('matches whole words only: "reddish", "bluegrass", "pinky" do not hit', () => {
    expect(norm('reddish')).toBeNull();
    expect(norm('bluegrass')).toBeNull();
    expect(norm('pinky')).toBeNull();
  });

  it('two different families found -> null, never a guess', () => {
    expect(norm('Pink with gold border')).toBeNull();
    expect(norm('red and white')).toBeNull();
    expect(norm('black blue')).toBeNull();
  });

  it('the same family twice is not ambiguous', () => {
    expect(norm('pink and baby pink')).toBe('pink');
  });
});

describe('normalizeColorFamily — unmapped and bad input', () => {
  it.each([[null], [undefined], [''], ['   '], ['xyzzy'], ['गुलाबी']])('%j -> null', (input) => {
    expect(norm(input as string | null | undefined)).toBeNull();
  });

  it('never throws on non-string input', () => {
    expect(norm(42 as unknown as string)).toBeNull();
    expect(norm({} as unknown as string)).toBeNull();
  });

  it('uses the families it is given, not the defaults', () => {
    const custom = [{ name: 'mauve-ish', aliases: ['pinky'] }];
    expect(normalizeColorFamily('Pinky', custom)).toBe('mauve-ish');
    expect(normalizeColorFamily('pink', custom)).toBeNull();
  });

  it('does not mutate the families it is given (RC-037)', () => {
    const fams = [{ name: 'red', aliases: ['Lal '] }];
    const snapshot = JSON.stringify(fams);
    normalizeColorFamily('lal', fams);
    expect(JSON.stringify(fams)).toBe(snapshot);
  });

  it('treats regex metacharacters in a value or an alias literally', () => {
    expect(normalizeColorFamily('red (dark)', [{ name: 'red', aliases: [] }])).toBe('red');
    expect(normalizeColorFamily('a.b', [{ name: 'x', aliases: ['a.b'] }])).toBe('x');
    expect(normalizeColorFamily('aXb', [{ name: 'x', aliases: ['a.b'] }])).toBeNull();
  });
});

// Seed parity: DEFAULT_COLOR_FAMILIES must equal the INSERT in migration 133, so the
// static list and the DB seed cannot drift. SQL comments are stripped first (RC-043).
describe('DEFAULT_COLOR_FAMILIES — parity with migration 133', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(
    join(here, '../../db/prisma/migrations/133_my_style_tables/migration.sql'),
    'utf8',
  )
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
  const quoted = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
  const seeded = [...sql.matchAll(/\('cf_\w+',\s*'([^']+)',\s*ARRAY\[([^\]]*)\]/g)].map((m) => ({
    name: m[1] as string,
    aliases: quoted(m[2] as string),
  }));

  it('parsed the seed (guard is not scanning nothing)', () => {
    expect(seeded.length).toBe(22);
  });

  it('is exactly the seed: same families, same aliases, same order', () => {
    expect(DEFAULT_COLOR_FAMILIES).toEqual(seeded);
  });
});
