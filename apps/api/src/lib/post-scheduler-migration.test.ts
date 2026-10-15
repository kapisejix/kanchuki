// Static guard for migration 129 (F-043). Reads the SQL — no database.
// Pins the three boundaries a route test cannot see (RC-030 / RC-049 shape):
//   1. every scheduler table has RLS enabled AND a backend-role policy
//   2. DELETE is granted to kanchuki_app on scheduled_post_items and ONLY there
//   3. the FK graph cascades from retailers, so RC-050's hand-written purge list
//      needs no new entries
//
// Comments are stripped before scanning: the file's own header says "ENABLE" and
// "DELETE", so a raw-text scan would pass for the wrong reason (RC-043).
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

const sql = read('129_post_scheduler');
const TABLES = ['post_schedule_plans', 'scheduled_posts', 'scheduled_post_items'];

describe('migration 129 — scheduler tables', () => {
  it('has the sanity content (guard is not scanning an empty string)', () => {
    expect(sql).toContain('CREATE TABLE "scheduled_posts"');
    expect(sql.length).toBeGreaterThan(1000);
  });

  it.each(TABLES)('%s: RLS policy for both backend roles, then ENABLE', (t) => {
    // the loop names the table in its ARRAY and creates the policy\s+ enables RLS per element
    expect(sql).toContain(`'${t}'`);
    expect(sql).toMatch(/CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge/);
    expect(sql).toMatch(/ALTER TABLE %I ENABLE ROW LEVEL SECURITY/);
    // policy is created before RLS is enabled (no window of 0-row reads)
    expect(sql.indexOf('CREATE POLICY')).toBeLessThan(sql.indexOf('ENABLE ROW LEVEL SECURITY'));
  });

  it('DELETE is granted to kanchuki_app on scheduled_post_items only', () => {
    const grants = [
      ...sql.matchAll(/GRANT\s+DELETE\s+ON\s+(?:TABLE\s+)?([^;]*?)\s+TO\s+kanchuki_app/gi),
    ].map((m) => (m[1] ?? '').replace(/"/g, ''));
    expect(grants).toEqual(['scheduled_post_items']);
  });

  it('never grants DELETE to the plan or post tables (they end / skip, never delete)', () => {
    expect(sql).not.toMatch(/GRANT\s+DELETE[^;]*post_schedule_plans/i);
    expect(sql).not.toMatch(/GRANT\s+DELETE[^;]*"scheduled_posts"/i);
  });

  it('every FK into retailers / products cascades (so the retailer purge cannot roll back — RC-050)', () => {
    const fks = [...sql.matchAll(/FOREIGN KEY \("(\w+)"\) REFERENCES "(\w+)"\("id"\)([^,;]*)/g)];
    expect(fks.length).toBeGreaterThanOrEqual(7);
    for (const [, col, ref, tail] of fks) {
      expect(tail, `${col} → ${ref} must ON DELETE CASCADE`).toMatch(/ON DELETE CASCADE/);
    }
  });

  it('seeds SOCIAL_SCHEDULER enabled for every plan (fails closed otherwise) and equal limits', () => {
    for (const plan of ['STARTER', 'GROWTH', 'PRO']) {
      expect(sql).toMatch(new RegExp(`'${plan}',\\s+'SOCIAL_SCHEDULER',\\s+true`));
      expect(sql).toMatch(new RegExp(`'${plan}',\\s+'SCHEDULED_POST',\\s+-1,\\s+'MONTH'`));
      expect(sql).toMatch(new RegExp(`'${plan}',\\s+'ACTIVE_SCHEDULE_PLAN',\\s+1,\\s+'LIFETIME'`));
    }
  });
});

describe('migration 128 — enum-only (55P04)', () => {
  const enums = read('128_scheduler_enums');
  it('adds the three values and nothing that uses them', () => {
    expect(enums.match(/ADD VALUE/g)).toHaveLength(3);
    expect(enums).not.toMatch(/INSERT|CREATE TABLE/i);
  });
});
