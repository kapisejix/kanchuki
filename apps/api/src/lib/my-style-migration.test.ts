// Static guard for migrations 132/133 (F-045 My Style, PR-1). Reads the SQL — no database.
// Pins what a route test cannot see (RC-030 / RC-049 shape):
//   1. 132 is enum-only (PG 55P04: a new enum value cannot be used in the tx that added it)
//   2. every new table has RLS on AND a backend-role policy created first
//   3. nothing is deleted or dropped — My Style tables move to is_active=false, never DELETE
//   4. the seeds load and every palette references only colour families that exist
//
// Comments are stripped before scanning: the SQL headers say "DELETE", "DROP" and
// "ENABLE", so a raw-text scan would pass or fail for the wrong reason (RC-043).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(here, '../../../../packages/db/prisma/migrations');
const read = (name: string) =>
  readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

const enums = read('132_my_style_enum_values');
const sql = read('133_my_style_tables');

const TABLES = ['color_families', 'style_palettes', 'style_trends'];
const quoted = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1] as string);

const families = [...sql.matchAll(/\('cf_\w+',\s*'([^']+)',\s*ARRAY\[([^\]]*)\]/g)].map((m) => ({
  name: m[1] as string,
  aliases: quoted(m[2] as string),
}));
const palettes = [
  ...sql.matchAll(
    /\('sp_\w+',\s*'([^']+)',\s*'([^']+)',\s*ARRAY\[([^\]]*)\],\s*ARRAY\[([^\]]*)\]/g,
  ),
].map((m) => ({
  undertone: m[1] as string,
  depth: m[2] as string,
  good: quoted(m[3] as string),
  avoid: quoted(m[4] as string),
}));
const known = new Set(families.map((f) => f.name));

describe('migration 132 — enum-only (55P04)', () => {
  it('adds STYLE_ANALYSIS and nothing that uses it', () => {
    expect(enums).toMatch(
      /ALTER TYPE "QuotaResourceType" ADD VALUE IF NOT EXISTS 'STYLE_ANALYSIS'/,
    );
    expect(enums.match(/ADD VALUE/g)).toHaveLength(1);
    expect(enums).not.toMatch(/INSERT|CREATE TABLE/i);
  });
});

describe('migration 133 — structure', () => {
  it('has the sanity content (guard is not scanning an empty string)', () => {
    expect(sql).toContain('CREATE TABLE "style_palettes"');
    expect(sql.length).toBeGreaterThan(1500);
  });

  it('adds the additive columns and the colour_family index', () => {
    expect(sql).toMatch(/ALTER TABLE "products"\s+ADD COLUMN "color_family" TEXT/);
    expect(sql).toMatch(/CREATE INDEX "products_color_family_idx" ON "products"\("color_family"\)/);
    for (const col of ['skin_undertone', 'skin_depth', 'body_frame']) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN "${col}"\\s+TEXT`));
    }
    expect(sql).toMatch(/ADD COLUMN "style_profile_at"\s+TIMESTAMP\(3\)/);
  });

  it('is additive only — no DROP, DELETE, TRUNCATE or NOT NULL column on an existing table', () => {
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
    const alters = sql.match(/ALTER TABLE "(products|customer_accounts)"[^;]*;/g) ?? [];
    expect(alters).toHaveLength(2);
    for (const a of alters) expect(a).not.toMatch(/NOT NULL/);
  });

  it.each(TABLES)('%s: created, with an is_active flag', (t) => {
    const block = sql.match(new RegExp(`CREATE TABLE "${t}" \\([^;]*?\\);`))?.[0] ?? '';
    expect(block, `${t} must be created`).not.toBe('');
    expect(block).toMatch(/"is_active"\s+BOOLEAN NOT NULL DEFAULT true/);
  });

  it.each(TABLES)('%s: backend-role policy first, then ENABLE (RC-030)', (t) => {
    expect(sql).toContain(`'${t}'`);
    expect(sql).toMatch(/CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge/);
    expect(sql).toMatch(/ALTER TABLE %I ENABLE ROW LEVEL SECURITY/);
    expect(sql.indexOf('CREATE POLICY')).toBeLessThan(sql.indexOf('ENABLE ROW LEVEL SECURITY'));
  });

  it('grants no DELETE to anyone (RC-049: is_active, never a hard delete)', () => {
    expect(sql).not.toMatch(/GRANT/i);
  });

  it('has no FK into retailers/products, so the retailer purge list is untouched (RC-050)', () => {
    expect(sql).not.toMatch(/REFERENCES "(retailers|products)"/);
  });

  it('seeds the customer STYLE_ANALYSIS limit at 3 per month, never overwriting an admin edit', () => {
    expect(sql).toMatch(
      /INSERT INTO "customer_resource_limits"[^;]*'STYLE_ANALYSIS',\s*3,\s*'MONTH'[^;]*ON CONFLICT \("resource_type"\) DO NOTHING/,
    );
  });
});

describe('migration 133 — seeds', () => {
  it('loads the colour families: unique lowercase names, no alias claimed twice', () => {
    expect(families.length).toBeGreaterThanOrEqual(20);
    const names = families.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toBe(n.toLowerCase());

    const claimed = new Map<string, string>();
    for (const f of families) {
      for (const a of f.aliases) {
        expect(a, `alias "${a}" of ${f.name} must be lowercase`).toBe(a.toLowerCase());
        expect(known.has(a) && a !== f.name, `alias "${a}" shadows a family name`).toBe(false);
        expect(claimed.get(a), `alias "${a}" maps to two families`).toBeUndefined();
        claimed.set(a, f.name);
      }
    }
  });

  it('loads 9 palettes: every undertone x depth exactly once', () => {
    expect(palettes).toHaveLength(9);
    const combos = palettes.map((p) => `${p.undertone}/${p.depth}`).sort();
    const want = ['cool', 'neutral', 'warm'].flatMap((u) =>
      ['deep', 'fair', 'medium'].map((d) => `${u}/${d}`),
    );
    expect(combos).toEqual(want.sort());
  });

  it('every palette references only known colour families, and good/avoid never overlap', () => {
    for (const p of palettes) {
      const id = `${p.undertone}/${p.depth}`;
      expect(p.good.length, `${id} good`).toBeGreaterThanOrEqual(5);
      expect(p.avoid.length, `${id} avoid`).toBeGreaterThanOrEqual(2);
      for (const f of [...p.good, ...p.avoid]) {
        expect(known.has(f), `${id} references unknown family "${f}"`).toBe(true);
      }
      expect(
        p.good.filter((f) => p.avoid.includes(f)),
        `${id} good ∩ avoid`,
      ).toEqual([]);
      expect(new Set(p.good).size, `${id} duplicate in good`).toBe(p.good.length);
    }
  });
});
