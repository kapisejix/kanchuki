// Static guard for migration 159 (F-047 Undo actor: product_sales.undone_by_staff_id).
// Reads the SQL + schema.prisma, no database. Comments are stripped first so the header's own
// words cannot satisfy a check (RC-043).
//
// The deploy-order rule is why this exists: every whole-row `productSale` read selects every
// Prisma column, so code that knows the column must not deploy before the migration is applied
// (RC-160). The migration is additive and nullable so applying it early is always safe.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const DB = join(here, '../../../../packages/db/prisma');
const file = join(DB, 'migrations/159_product_sales_undone_by/migration.sql');
const sql = existsSync(file)
  ? readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n')
  : '';
const schema = readFileSync(join(DB, 'schema.prisma'), 'utf8');
const model = /model ProductSale \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';

describe('migration 159 — product_sales.undone_by_staff_id', () => {
  it('exists and has real content (guard is not scanning an empty string)', () => {
    expect(sql).toContain('ALTER TABLE "product_sales"');
  });

  it('adds exactly one nullable TEXT column, idempotently', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "undone_by_staff_id" TEXT\s*;/);
    expect(sql).not.toMatch(/NOT NULL/i);
    expect(sql).not.toMatch(/DEFAULT/i);
    expect([...sql.matchAll(/ADD COLUMN/gi)]).toHaveLength(1);
  });

  it('is additive only: no DROP, no other table, no FK (a staff row must never block history or purge)', () => {
    expect(sql).not.toMatch(/DROP\s/i);
    expect(sql).not.toMatch(/FOREIGN KEY|REFERENCES/i);
    const alters = [...sql.matchAll(/ALTER\s+TABLE\s+"(\w+)"/gi)].map((m) => m[1]);
    expect(new Set(alters)).toEqual(new Set(['product_sales']));
  });

  it('changes no grants or RLS (the 158 table grants already cover the new column)', () => {
    expect(sql).not.toMatch(/GRANT|REVOKE|POLICY|ROW LEVEL SECURITY/i);
  });

  it('schema.prisma declares the same plain optional field', () => {
    expect(model).toMatch(/^\s{2}undone_by_staff_id\s+String\?/m);
    expect(model).not.toMatch(/undone_by_staff_id[^\n]*@relation/);
  });
});
