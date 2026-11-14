// Static guard for migration 158 (F-047 product_sales). Reads the SQL + schema.prisma, no database.
// Pins what a route test cannot see (RC-030 / RC-049 / RC-162 shape): RLS order, no app DELETE,
// the idempotency UNIQUE, and SQL <-> Prisma column agreement.
// Comments are stripped before scanning so the header's own words cannot satisfy a check (RC-043).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const DB = join(here, '../../../../packages/db/prisma');
const sql = readFileSync(join(DB, 'migrations/158_product_sales/migration.sql'), 'utf8')
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');
const schema = readFileSync(join(DB, 'schema.prisma'), 'utf8');
const model = /model ProductSale \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';

const COLUMNS = [
  'id',
  'retailer_id',
  'bill_id',
  'product_id',
  'size',
  'quantity',
  'unit_price',
  'sold_by_staff_id',
  'undone_at',
  'created_at',
];

describe('migration 158 — product_sales', () => {
  it('has real content (guard is not scanning an empty string)', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "product_sales"');
    expect(model.length).toBeGreaterThan(100);
  });

  it('is additive only: no ALTER of existing tables, no DROP, no enum change', () => {
    expect(sql).not.toMatch(/DROP\s/i);
    expect(sql).not.toMatch(/ALTER\s+TYPE/i);
    const alters = [...sql.matchAll(/ALTER\s+TABLE\s+"(\w+)"/gi)].map((m) => m[1]);
    expect(new Set(alters)).toEqual(new Set(['product_sales']));
  });

  it('quantity > 0 CHECK and the retailer-scoped idempotency UNIQUE exist', () => {
    expect(sql).toMatch(/CHECK \("quantity" > 0\)/);
    // name must be Prisma's default for the @@unique, or `migrate diff` reports a rename
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "product_sales_retailer_id_bill_id_product_id_size_key"\s+ON "product_sales"\("retailer_id", "bill_id", "product_id", "size"\)/,
    );
  });

  it('both FKs cascade (retailer purge needs no list entry, RC-050)', () => {
    const fks = [...sql.matchAll(/FOREIGN KEY \("(\w+)"\) REFERENCES "(\w+)"\("id"\)([^,;]*)/g)];
    expect(fks.map((m) => m[1]).sort()).toEqual(['product_id', 'retailer_id']);
    for (const [, col, , tail] of fks) {
      expect(tail, `${col} must ON DELETE CASCADE`).toMatch(/ON DELETE CASCADE/);
    }
  });

  it('sold_by_staff_id is a plain column, not an FK (staff rows must not block purge)', () => {
    expect(sql).not.toMatch(/FOREIGN KEY \("sold_by_staff_id"\)/);
  });

  it('RLS: backend-role policy is created before ENABLE', () => {
    expect(sql).toMatch(/CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge/);
    expect(sql).toMatch(/ALTER TABLE "product_sales" ENABLE ROW LEVEL SECURITY/);
    expect(sql.indexOf('CREATE POLICY')).toBeLessThan(sql.indexOf('ENABLE ROW LEVEL SECURITY'));
  });

  it('grants kanchuki_app SELECT/INSERT/UPDATE explicitly and never DELETE (RC-049/RC-162)', () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON "product_sales" TO kanchuki_app/);
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*TO kanchuki_app/i);
    expect(sql).toMatch(/GRANT DELETE ON "product_sales" TO kanchuki_purge/);
  });

  it('schema.prisma model has exactly the SQL columns', () => {
    const fields = [...model.matchAll(/^\s{2}(\w+)\s+\w+[?]?\s/gm)]
      .map((m) => m[1] as string)
      .filter((f) => !['retailer', 'product'].includes(f));
    expect(fields.sort()).toEqual([...COLUMNS].sort());
    for (const c of COLUMNS) expect(sql, `SQL missing column ${c}`).toContain(`"${c}"`);
  });

  it('schema.prisma declares the same unique key, table map and cascades', () => {
    expect(model).toContain('@@unique([retailer_id, bill_id, product_id, size])');
    expect(model).toContain('@@map("product_sales")');
    expect(model.match(/onDelete: Cascade/g)).toHaveLength(2);
  });
});
