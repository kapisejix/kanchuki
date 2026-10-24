// Migration 136 names 51 tables by hand (taken from a live Supabase advisor
// check). This keeps that list honest without a database: every entry must be a
// real table (a Prisma @@map, or the implicit m2m table), no duplicates, and the
// policy DDL must match the one 111 and the later migrations use.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const MIGRATION = readFileSync(
  join(REPO_ROOT, 'packages/db/prisma/migrations/136_backend_role_rls_policies_remaining/migration.sql'),
  'utf8',
);
const SCHEMA = readFileSync(join(REPO_ROOT, 'packages/db/prisma/schema.prisma'), 'utf8');

const arrayBody = MIGRATION.match(/tables constant text\[\] := ARRAY\[([\s\S]*?)\];/)?.[1] ?? '';
const listed = [...arrayBody.matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
const mapped = new Set([...SCHEMA.matchAll(/@@map\("([^"]+)"\)/g)].map((m) => m[1]));
// Prisma implicit many-to-many join table: has no @@map.
const IMPLICIT = new Set(['_RelatedShowcaseCategories']);

describe('migration 136 table list', () => {
  it('has no duplicates', () => {
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('lists only real tables', () => {
    const unknown = listed.filter((t) => !mapped.has(t) && !IMPLICIT.has(t));
    expect(unknown).toEqual([]);
  });

  it('skips Prisma bookkeeping', () => {
    expect(listed).not.toContain('_prisma_migrations');
  });

  it('uses the same policy name and DDL as migration 111', () => {
    expect(MIGRATION).toContain("policy_name constant text := 'backend_roles_full_access'");
    expect(MIGRATION).toContain(
      "'CREATE POLICY %I ON %I FOR ALL TO kanchuki_app, kanchuki_purge USING (true) WITH CHECK (true)'",
    );
  });
});
