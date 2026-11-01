// RC-159 drift guard: columns/enum values the live app reads must be created by a
// migration, not only declared in schema.prisma. Reads files, no database.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const prisma = join(here, '../../../../packages/db/prisma');
const schema = readFileSync(join(prisma, 'schema.prisma'), 'utf8');
const migrations = readdirSync(join(prisma, 'migrations'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) =>
    readFileSync(join(prisma, 'migrations', d.name, 'migration.sql'), 'utf8')
      .split('\n')
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n'),
  )
  .join('\n');

describe('RC-159 drift: schema.prisma vs migrations', () => {
  it.each([
    ['retailers', 'latitude'],
    ['retailers', 'longitude'],
    ['bug_reports', 'resolved_at'],
  ])('%s.%s is added by a migration', (table, col) => {
    const re = new RegExp(
      `ALTER TABLE (IF EXISTS )?"${table}"[^;]*ADD COLUMN (IF NOT EXISTS )?"${col}"`,
      'i',
    );
    expect(migrations).toMatch(re);
  });

  it('retailers lat/long index is created by a migration', () => {
    expect(migrations).toContain('"retailers_latitude_longitude_idx"');
  });

  it('SocialPostStatus in schema.prisma lists every value a migration adds', () => {
    const block = /enum SocialPostStatus \{([^}]*)\}/.exec(schema)?.[1] ?? '';
    for (const v of ['POSTED', 'FAILED', 'SCHEDULED', 'DRAFT']) {
      expect(block).toMatch(new RegExp(`\\b${v}\\b`));
    }
  });
});
