// Static guard for migration 135 (F-046). Reads the SQL: no database.
// Pins what a route test cannot see:
//   1. RLS is enabled AND a backend-role policy exists, policy first (RC-030)
//   2. the app role never gets DELETE (RC-049): tokens are soft-disabled
//   3. the retailer FK cascades, so hardDeleteRetailer needs no list entry (RC-050)
//      and purge-retailer-now.ts must NOT name the table (it would trip the RC-030
//      purge-rls-policy guard, which is tied to migration 111's list)
// Comments are stripped before scanning (RC-043): the header says "DELETE" and "ENABLE".
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(here, '../../../../packages/db/prisma/migrations/135_staff_push_devices/migration.sql'),
  'utf8',
)
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');

describe('migration 135 — staff_push_devices', () => {
  it('has the sanity content (guard is not scanning an empty string)', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "staff_push_devices"');
    expect(sql).toContain('"expo_token" TEXT NOT NULL');
  });

  it('expo_token is unique and platform is constrained', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]*"staff_push_devices_expo_token_key"/);
    expect(sql).toMatch(/CHECK \("platform" IN \('android', 'ios'\)\)/);
  });

  it('RLS: backend-role policy first, then ENABLE', () => {
    expect(sql).toMatch(/CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge/);
    expect(sql).toMatch(/ALTER TABLE "staff_push_devices" ENABLE ROW LEVEL SECURITY/);
    expect(sql.indexOf('CREATE POLICY')).toBeLessThan(sql.indexOf('ENABLE ROW LEVEL SECURITY'));
  });

  it('DELETE is never granted to the app role', () => {
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*TO[^;]*kanchuki_app/i);
  });

  it('the retailer FK cascades, so the retailer purge cannot roll back (RC-050)', () => {
    expect(sql).toMatch(
      /FOREIGN KEY \("retailer_id"\) REFERENCES "retailers"\("id"\) ON DELETE CASCADE/,
    );
  });

  it('purge-retailer-now.ts does not name the table (RC-030 guard coupling)', () => {
    const purge = readFileSync(join(here, '../jobs/purge-retailer-now.ts'), 'utf8');
    expect(purge).not.toContain('staff_push_devices');
  });
});

// Same guard for migration 138 (F-036 Phase B, customer Web Push subscriptions).
const sql138 = readFileSync(
  join(
    here,
    '../../../../packages/db/prisma/migrations/138_customer_push_subscriptions/migration.sql',
  ),
  'utf8',
)
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');

describe('migration 138 — customer_push_subscriptions', () => {
  it('has the sanity content and a unique endpoint', () => {
    expect(sql138).toContain('CREATE TABLE IF NOT EXISTS "customer_push_subscriptions"');
    expect(sql138).toMatch(/CREATE UNIQUE INDEX[^;]*"customer_push_subscriptions_endpoint_key"/);
  });

  it('RLS: backend-role policy first, then ENABLE', () => {
    expect(sql138).toMatch(/CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge/);
    expect(sql138.indexOf('CREATE POLICY')).toBeLessThan(
      sql138.indexOf('ALTER TABLE "customer_push_subscriptions" ENABLE ROW LEVEL SECURITY'),
    );
  });

  it('DELETE is never granted to the app role', () => {
    expect(sql138).not.toMatch(/GRANT[^;]*DELETE[^;]*TO[^;]*kanchuki_app/i);
  });

  it('the account FK cascades', () => {
    expect(sql138).toMatch(
      /FOREIGN KEY \("customer_account_id"\) REFERENCES "customer_accounts"\("id"\) ON DELETE CASCADE/,
    );
  });
});
