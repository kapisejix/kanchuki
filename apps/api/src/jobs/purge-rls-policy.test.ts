// Static guard for the purge path's RLS access (RC-030).
//
// The problem this guards is that a missing RLS policy fails SILENTLY. Postgres
// RLS is default-deny, and for SELECT/UPDATE/DELETE "denied" means the statement
// succeeds and affects zero rows — no error, no log, no failed transaction. So a
// purge sweep that cannot see its rows reports success while deleting nothing,
// and the only symptom is rows that should be gone still being there.
//
// 50 tables in this schema have RLS enabled; not one policy in the repo names
// `kanchuki_app` or `kanchuki_purge`. The backend bypasses RLS today only because
// `kanchuki_purge` is a member of `kanchuki_app` and Postgres's owner check
// succeeds for a role that owns the table — an accident of which role happened
// to run which migration, per table, documented nowhere.
//
// Migration 111 makes that access explicit for every table the purge path
// touches. This test is what keeps the set honest: it re-derives the required
// set from the schema, the migrations and the job sources, and fails if the
// migration's array and that set ever disagree — in EITHER direction, because a
// stale entry in a permission list is a bug too (the purge-grant list carried
// nine names of dropped tables for a month and aborted the script that ran it).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'packages/db/prisma/migrations');
const JOBS_DIR = join(REPO_ROOT, 'apps/api/src/jobs');
const MIGRATION = join(MIGRATIONS_DIR, '111_backend_role_rls_policies/migration.sql');
const ROLE_SCRIPT = join(REPO_ROOT, 'scripts/setup-role-separation.sql');

/** The two roles the backend connects as. */
const BACKEND_ROLES = ['kanchuki_app', 'kanchuki_purge'];

/** Every migration file's SQL, newest last — the schema's DDL of record. */
function migrationSql(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((d) => d !== 'migration_lock.toml')
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'),
    }));
}

/**
 * Tables with `ENABLE ROW LEVEL SECURITY` somewhere in the migration history.
 * A table's RLS state is the OR of every migration that mentions it, so this
 * accumulates rather than taking the last one.
 */
const RLS_ENABLED: Set<string> = (() => {
  const enabled = new Set<string>();
  const re =
    /ALTER TABLE (?:IF EXISTS )?["']?([a-z_][a-z0-9_]*)["']?\s+ENABLE ROW LEVEL SECURITY/gi;
  for (const { sql } of migrationSql()) {
    for (const m of sql.matchAll(re)) if (m[1]) enabled.add(m[1]);
  }
  return enabled;
})();

/** `model X { … @@map("y") }` → table names, from the schema. */
const LIVE_TABLES: Set<string> = (() => {
  const schema = readFileSync(join(REPO_ROOT, 'packages/db/prisma/schema.prisma'), 'utf8');
  const tables = new Set<string>();
  for (const model of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const mapped = model[2]?.match(/@@map\("([^"]+)"\)/);
    if (mapped?.[1]) tables.add(mapped[1]);
  }
  return tables;
})();

/** Prisma model name → table name, so `db.auditLog` resolves to `audit_logs`. */
const MODEL_TO_TABLE: Map<string, string> = (() => {
  const schema = readFileSync(join(REPO_ROOT, 'packages/db/prisma/schema.prisma'), 'utf8');
  const map = new Map<string, string>();
  for (const model of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const mapped = model[2]?.match(/@@map\("([^"]+)"\)/);
    if (model[1] && mapped?.[1]) map.set(model[1], mapped[1]);
  }
  return map;
})();

/**
 * Tables a purge job reads, writes or deletes.
 *
 * Three shapes, all of which occur in these files, and each one earns its place:
 *   - `FROM "t"` / `DELETE FROM t` — the raw SQL. The identifier regex has to
 *     accept BOTH quoting styles: an earlier version of this derivation required
 *     double quotes, and `DELETE FROM ai_usage_logs WHERE retailer_id = $1` in
 *     purge-retailer-now.ts is unquoted, so `ai_usage_logs` silently dropped out
 *     of the required set. That false negative is pinned by a test below.
 *   - `'t'` string literals — `purgeChildren('consent_events', …)`.
 *   - `db.<delegate>.` — the audit row write, mapped through the schema.
 *
 * Comments are stripped first: the files discuss dropped tables
 * (`product_videos`, `social_posts`) in prose, and counting those would demand
 * policies for tables that no longer exist.
 */
function touchedTablesIn(sourceFile: string): Set<string> {
  const src = readFileSync(join(JOBS_DIR, sourceFile), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  const tables = new Set<string>();
  for (const m of src.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+"?([a-z_][a-z0-9_]*)"?/gi)) {
    if (m[1] && LIVE_TABLES.has(m[1])) tables.add(m[1]);
  }
  for (const m of src.matchAll(/'([a-z_][a-z0-9_]*)'/g)) {
    if (m[1] && LIVE_TABLES.has(m[1])) tables.add(m[1]);
  }
  for (const m of src.matchAll(/\bdb\.([A-Za-z0-9_]+)\b/g)) {
    const model = m[1] ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : '';
    const table = MODEL_TO_TABLE.get(model);
    if (table) tables.add(table);
  }
  return tables;
}

const JOBS = ['purge-soft-deleted.ts', 'purge-retailer-now.ts'];

/** Tables the purge path touches that are RLS-protected — so need a policy. */
const REQUIRES_POLICY: Set<string> = (() => {
  const required = new Set<string>();
  for (const job of JOBS) {
    for (const table of touchedTablesIn(job)) {
      if (RLS_ENABLED.has(table)) required.add(table);
    }
  }
  return required;
})();

const MIGRATION_SQL = readFileSync(MIGRATION, 'utf8');

/** The table list migration 111 iterates over. */
const DECLARED_TABLES: Set<string> = (() => {
  const array = MIGRATION_SQL.match(/tables constant text\[\] := ARRAY\[([\s\S]*?)\];/);
  if (!array?.[1]) return new Set();
  return new Set([...array[1].matchAll(/'([a-z_][a-z0-9_]*)'/g)].map((m) => m[1] ?? ''));
})();

/** The `CREATE POLICY` statement the migration executes, unformatted. */
const POLICY_DDL =
  MIGRATION_SQL.match(/EXECUTE format\(\s*'([^']*CREATE POLICY[^']*)'/s)?.[1] ?? '';

const sorted = (s: Set<string>) => [...s].sort();

/** Tables migration 111 must cover that it does not. */
const missing = () => sorted(REQUIRES_POLICY).filter((t) => !DECLARED_TABLES.has(t));
/** Tables migration 111 covers that no longer need it. */
const stale = () => sorted(DECLARED_TABLES).filter((t) => !REQUIRES_POLICY.has(t));

describe('RC-030 — every RLS table the purge path touches has a backend policy', () => {
  it('derives the sets it guards (the guard cannot pass vacuously)', () => {
    // If any parse above breaks, the sets empty and every "toEqual([])" below
    // passes while checking nothing. These floors make that impossible.
    // Measured today: 50 RLS-enabled, 69 mapped models, 24 requiring a policy.
    // The floors sit just under, so a real shrink fails loudly while ordinary
    // schema growth does not.
    expect(RLS_ENABLED.size).toBeGreaterThanOrEqual(45);
    expect(LIVE_TABLES.size).toBeGreaterThanOrEqual(60);
    expect(REQUIRES_POLICY.size).toBeGreaterThanOrEqual(20);
    expect(DECLARED_TABLES.size).toBeGreaterThanOrEqual(20);
    expect(POLICY_DDL).not.toBe('');
  });

  it('includes ai_usage_logs, whose sweep is written without quotes', () => {
    // Pins the unquoted-identifier case in touchedTablesIn(). Requiring quotes
    // made this table vanish from the set — the guard would then have approved a
    // migration that omitted it, and its sweep would still delete nothing.
    expect(touchedTablesIn('purge-retailer-now.ts').has('ai_usage_logs')).toBe(true);
  });

  it('found RLS-enabled tables that the purge path actually touches', () => {
    // The premise: 50 tables have RLS and the backend has no policy on any of
    // them. If this ever reads false the whole file is testing nothing.
    expect(RLS_ENABLED.has('products')).toBe(true);
    expect(REQUIRES_POLICY.has('products')).toBe(true);
    expect(REQUIRES_POLICY.has('audit_logs')).toBe(true);
  });

  it('covers the four tables RC-030 reported', () => {
    for (const table of [
      'consent_events',
      'customer_interactions',
      'customer_recently_viewed',
      'customer_wishlist_items',
    ]) {
      expect(DECLARED_TABLES.has(table), `${table} lost its backend policy`).toBe(true);
    }
  });

  it('declares a policy for every RLS-enabled table the purge path touches', () => {
    expect(
      missing(),
      'These tables have RLS enabled and the purge path reads or deletes from them, but migration 111 declares no policy for them — so the backend role matches no permissive policy, RLS default-denies, and the statement affects 0 rows WITHOUT erroring. Add them to the array in packages/db/prisma/migrations/111_backend_role_rls_policies/migration.sql.',
    ).toEqual([]);
  });

  it('declares no table that no longer needs a policy', () => {
    expect(
      stale(),
      'These tables are in migration 111 but the purge path no longer touches them (or they are no longer RLS-enabled, or no longer exist). A permission list with entries that are no longer required is how the purge-grant list came to name nine dropped tables (RC-029). Remove them.',
    ).toEqual([]);
  });

  it('uses FOR ALL, so the sweeps that SELECT before they DELETE are covered', () => {
    // The trap: purgeTable() selects a batch of ids and breaks out of its loop
    // when the batch is empty, fetchR2Keys() selects the R2 keys first, and
    // purgeChildren() scopes its DELETE through `SELECT id FROM retailers`. A
    // FOR DELETE policy leaves every one of those SELECTs returning 0 rows, so
    // the delete keeps silently doing nothing while a policy exists to make it
    // look fixed.
    expect(POLICY_DDL).toMatch(/CREATE POLICY %I ON %I FOR ALL/);
    expect(POLICY_DDL).toMatch(/USING \(true\) WITH CHECK \(true\)/);
  });

  it('names both backend roles, so the rows can be written as well as deleted', () => {
    for (const role of BACKEND_ROLES) expect(POLICY_DDL).toContain(role);
  });

  it('cannot abort a deploy: guarded on the roles existing and the table existing', () => {
    // CREATE POLICY naming a nonexistent role is a hard error, and a brand-new
    // environment applies migrations BEFORE the hand-run F-017 role script. The
    // migration must degrade to a loud warning, not a failed `migrate deploy`.
    for (const role of BACKEND_ROLES) {
      expect(MIGRATION_SQL).toContain(`rolname = '${role}'`);
    }
    expect(MIGRATION_SQL).toContain('to_regclass(t) IS NULL');
    expect(MIGRATION_SQL).toContain('RAISE WARNING');
    // …and the skip must be reachable only by a setup mistake, so the role
    // script has to still be the thing that creates both roles.
    const script = readFileSync(ROLE_SCRIPT, 'utf8');
    for (const role of BACKEND_ROLES) expect(script).toContain(`'${role}'`);
  });

  it('is idempotent, so a re-run or a later teardown cannot fail it', () => {
    expect(MIGRATION_SQL).toContain('pg_policies');
    expect(MIGRATION_SQL).toContain('policyname = policy_name');
    // Scoped to the search_path, the same resolution `to_regclass(t)` and the
    // unqualified `CREATE POLICY` use. An unscoped tablename-only check skips the
    // table if ANY schema has a policy of this name on a table of this name — the
    // migration would then silently do nothing, which is the very failure it
    // exists to remove.
    expect(MIGRATION_SQL).toMatch(/schemaname = ANY \(current_schemas\(false\)\)/);
  });

  it('has exactly one policy DDL to lift, so the live test cannot prove the wrong one', () => {
    // purge-rls-live.test.ts extracts the FIRST `EXECUTE format('…CREATE POLICY…')`
    // in this file and executes it — that is what makes its result evidence about
    // the statement the migration runs. A second such call added earlier in the
    // file would silently change what that test proves while it stayed green.
    const ddls = [
      ...MIGRATION_SQL.matchAll(/EXECUTE format\(\s*'([^']*CREATE POLICY[^']*)'/gs),
    ].filter((m) => m[1] !== undefined);
    expect(ddls.length).toBe(1);
    expect(ddls[0]?.[1]).toBe(POLICY_DDL);
  });
});
