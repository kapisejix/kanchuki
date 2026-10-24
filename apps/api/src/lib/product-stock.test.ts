import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { StockInputSchema, defaultStock, totalQuantity } from './product-stock.js';

describe('defaultStock', () => {
  it('gives 1 unit per selected size', () => {
    expect(defaultStock(['S', 'M'])).toEqual([
      { size: 'S', quantity: 1 },
      { size: 'M', quantity: 1 },
    ]);
  });

  it('falls back to a single FREE row when unsized or only junk sizes', () => {
    expect(defaultStock(undefined)).toEqual([{ size: 'FREE', quantity: 1 }]);
    expect(defaultStock([])).toEqual([{ size: 'FREE', quantity: 1 }]);
    expect(defaultStock(['bogus'])).toEqual([{ size: 'FREE', quantity: 1 }]);
  });
});

describe('totalQuantity', () => {
  it('is null when untracked and the sum otherwise', () => {
    expect(totalQuantity(undefined)).toBeNull();
    expect(totalQuantity([])).toBeNull();
    expect(
      totalQuantity([
        { size: 'S', quantity: 2 },
        { size: 'M', quantity: 0 },
      ]),
    ).toBe(2);
  });
});

describe('StockInputSchema', () => {
  it('accepts known sizes and FREE', () => {
    expect(StockInputSchema.safeParse([{ size: 'XXL', quantity: 3 }]).success).toBe(true);
    expect(StockInputSchema.safeParse([{ size: 'FREE', quantity: 0 }]).success).toBe(true);
  });

  it('rejects unknown size, negative, fractional, oversized and duplicate rows', () => {
    expect(StockInputSchema.safeParse([{ size: 'Q', quantity: 1 }]).success).toBe(false);
    expect(StockInputSchema.safeParse([{ size: 'S', quantity: -1 }]).success).toBe(false);
    expect(StockInputSchema.safeParse([{ size: 'S', quantity: 1.5 }]).success).toBe(false);
    expect(StockInputSchema.safeParse([{ size: 'S', quantity: 100_000 }]).success).toBe(false);
    expect(
      StockInputSchema.safeParse([
        { size: 'S', quantity: 1 },
        { size: 'S', quantity: 2 },
      ]).success,
    ).toBe(false);
  });
});

// Static guard for migration 137: reads the SQL, no database. Comments are stripped
// first (RC-043) because the header says "DELETE" and "ENABLE".
describe('migration 137 — product_stock', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(
    join(here, '../../../../packages/db/prisma/migrations/137_product_stock/migration.sql'),
    'utf8',
  )
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

  it('has the sanity content', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "product_stock"');
    expect(sql).toMatch(/CHECK \("quantity" >= 0\)/);
  });

  it('one row per (product, size)', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]*"product_stock_product_id_size_key"/);
  });

  it('RLS: backend-role policy first, then ENABLE', () => {
    expect(sql).toMatch(/CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge/);
    expect(sql.indexOf('CREATE POLICY')).toBeLessThan(sql.indexOf('ENABLE ROW LEVEL SECURITY'));
  });

  it('DELETE is never granted to the app role (RC-049)', () => {
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*TO[^;]*kanchuki_app/i);
  });

  it('both FKs cascade (RC-050)', () => {
    expect(sql).toMatch(
      /FOREIGN KEY \("product_id"\) REFERENCES "products"\("id"\) ON DELETE CASCADE/,
    );
    expect(sql).toMatch(
      /FOREIGN KEY \("retailer_id"\) REFERENCES "retailers"\("id"\) ON DELETE CASCADE/,
    );
  });
});
