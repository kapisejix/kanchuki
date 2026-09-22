// OPT-IN live proof that the four RC-030 sweeps delete rows once a backend
// policy exists — and that they delete NOTHING before it does.
//
// Skipped unless PURGE_RLS_TEST_DATABASE_URL is set. Nothing in this repo
// touches a real database from a test (no DB harness, no docker-compose, no test
// reads DATABASE_URL), so this is the only *executed* evidence for the RLS
// semantics the purge path depends on:
//
//   PURGE_RLS_TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres \
//     npx vitest run src/jobs/purge-rls-live.test.ts
//
// Point it at a THROWAWAY database. The connection needs CREATE SCHEMA and SET
// ROLE (a superuser, or a role that owns the scratch schema and is a member of
// both backend roles). Everything it creates lives in a scratch schema that is
// dropped afterwards; no real table is touched.
//
// WHY THIS FILE EXISTS, given purge-rls-policy.test.ts. That test proves the
// migration DECLARES a policy for every RLS table the purge path touches. It
// cannot prove the policy WORKS, because this failure is semantic, not
// syntactic: Postgres RLS denies silently, so a broken policy and a working one
// both pass every static check. Phase A below is that failure, executed.
//
// Phases, per table:
//   A. no policy          → SELECT returns 0 rows, DELETE affects 0 rows, row lives on
//   B. FOR DELETE policy  → still 0 and 0 — the trap, see below
//   C. migration 111's policy (FOR ALL, both roles) → the sweep sees the row and it goes
//
// Phase B is why the migration uses FOR ALL rather than FOR DELETE. purgeTable()
// selects a batch of ids and exits its loop when the batch is empty,
// fetchR2Keys() selects the R2 keys before the rows disappear, and
// purgeChildren() scopes its DELETE through `SELECT id FROM retailers` — under a
// DELETE-only policy every one of those SELECTs still returns nothing, so the
// sweep keeps silently deleting nothing while a policy sits there making it look
// fixed.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const MIGRATION = join(
  REPO_ROOT,
  'packages/db/prisma/migrations/111_backend_role_rls_policies/migration.sql',
);

const TEST_URL = process.env.PURGE_RLS_TEST_DATABASE_URL;
const SCRATCH_SCHEMA = 'purge_rls_test';
const BACKEND_ROLES = ['kanchuki_app', 'kanchuki_purge'] as const;
const RETAILER_ID = 'retailer_under_test';

/** The four tables RC-030 named. All four carry these columns. */
const TABLES = [
  'consent_events',
  'customer_interactions',
  'customer_recently_viewed',
  'customer_wishlist_items',
];

// Lifted from the migration in beforeAll, not at import time: the whole file is
// skipped without PURGE_RLS_TEST_DATABASE_URL, and a skipped test should not be
// able to fail — a module-level read would make this a file-existence guard that
// trips in CI for a reason unrelated to what it tests.
let policyTemplate = '';
let policyName = '';

/** Substitute `%I` placeholders with quoted identifiers, left to right. */
function policySql(...identifiers: string[]): string {
  let i = 0;
  return policyTemplate.replace(/%I/g, () => `"${(identifiers[i++] ?? '').replace(/"/g, '""')}"`);
}

interface Queryable {
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
}

let db!: Queryable & {
  $transaction: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>;
  $disconnect: () => Promise<void>;
};

/**
 * Run `fn` as `role`, on one pinned connection, with the scratch schema on the
 * search_path so the unqualified table names the jobs use resolve to it.
 *
 * `SET LOCAL` — not `SET` — because it reverts when the transaction ends, so no
 * reset is needed. That matters beyond tidiness: running `RESET ROLE` in a
 * `finally` would execute inside an *aborted* transaction when the body throws
 * (the RLS-denied INSERT case below), replacing the real error with "current
 * transaction is aborted" and hiding what actually went wrong.
 */
async function asRole<T>(role: string, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path = ${SCRATCH_SCHEMA}, public`);
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
    return fn(tx);
  });
}

/** A row count read as the owning connection, so RLS cannot hide it. */
async function ownerCount(table: string): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ c: number }[]>(
    `SELECT count(*)::int AS c FROM ${SCRATCH_SCHEMA}."${table}"`,
  );
  return rows[0]?.c ?? 0;
}

/** SELECT-then-DELETE exactly as the sweep does, as the purge role. */
async function sweepAsPurge(table: string): Promise<{ seen: number; deleted: number }> {
  return asRole('kanchuki_purge', async (tx) => {
    const rows = await tx.$queryRawUnsafe<{ c: number }[]>(
      `SELECT count(*)::int AS c FROM "${table}"`,
    );
    const deleted = await tx.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE "retailer_id" = $1`,
      RETAILER_ID,
    );
    return { seen: rows[0]?.c ?? 0, deleted };
  });
}

const describeLive = TEST_URL ? describe : describe.skip;

describeLive('RC-030 — the four sweeps really delete rows once a backend policy exists', () => {
  beforeAll(async () => {
    const migrationSql = readFileSync(MIGRATION, 'utf8');
    policyTemplate =
      migrationSql.match(/EXECUTE format\(\s*'([^']*CREATE POLICY[^']*)'/s)?.[1] ?? '';
    policyName = migrationSql.match(/policy_name constant text := '([^']+)'/)?.[1] ?? '';
    if (!policyTemplate || !policyName) {
      throw new Error(
        'could not extract the policy DDL from migration 111 — this test proves nothing without it',
      );
    }

    const { PrismaClient } = await import('@kanchuki/db');
    db = new PrismaClient({
      datasources: { db: { url: TEST_URL as string } },
    }) as unknown as typeof db;

    // Roles the policies name. CREATE ROLE needs CREATEROLE — hence the superuser
    // note at the top of this file.
    for (const role of BACKEND_ROLES) {
      const found = await db.$queryRawUnsafe<{ n: number }[]>(
        'SELECT count(*)::int AS n FROM pg_roles WHERE rolname = $1',
        role,
      );
      if ((found[0]?.n ?? 0) === 0) await db.$executeRawUnsafe(`CREATE ROLE ${role}`);
    }

    // A fresh scratch schema holding the four real table names, with RLS on and
    // the real privilege split — kanchuki_app has no DELETE (REVOKE DELETE in
    // scripts/setup-role-separation.sql), kanchuki_purge does.
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCRATCH_SCHEMA} CASCADE`);
    await db.$executeRawUnsafe(`CREATE SCHEMA ${SCRATCH_SCHEMA}`);
    for (const table of TABLES) {
      await db.$executeRawUnsafe(
        `CREATE TABLE ${SCRATCH_SCHEMA}."${table}" (
           "id" TEXT PRIMARY KEY,
           "retailer_id" TEXT NOT NULL,
           "customer_account_id" TEXT NOT NULL
         )`,
      );
      await db.$executeRawUnsafe(
        `ALTER TABLE ${SCRATCH_SCHEMA}."${table}" ENABLE ROW LEVEL SECURITY`,
      );
    }
    await db.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA ${SCRATCH_SCHEMA} TO ${BACKEND_ROLES.join(', ')}`,
    );
    await db.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ${SCRATCH_SCHEMA} TO ${BACKEND_ROLES.join(', ')}`,
    );
    await db.$executeRawUnsafe(
      `GRANT DELETE ON ALL TABLES IN SCHEMA ${SCRATCH_SCHEMA} TO kanchuki_purge`,
    );
  }, 30_000);

  afterAll(async () => {
    if (!TEST_URL || !db) return;
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCRATCH_SCHEMA} CASCADE`);
    await db.$disconnect();
  });

  for (const table of TABLES) {
    it(`${table}: silently no-ops, a DELETE-only policy does not help, FOR ALL does`, async () => {
      // Seed as the owner, so the row's existence is never in doubt.
      await db.$executeRawUnsafe(`DELETE FROM ${SCRATCH_SCHEMA}."${table}"`);
      await db.$executeRawUnsafe(
        `INSERT INTO ${SCRATCH_SCHEMA}."${table}" ("id", "retailer_id", "customer_account_id")
         VALUES ('row_1', $1, 'acct_1')`,
        RETAILER_ID,
      );
      expect(await ownerCount(table)).toBe(1);

      // ── Phase A: no policy at all — the RC-030 failure, executed ────────
      // `SELECT count(*)` as the purge role sees nothing and the DELETE affects
      // 0 rows, with no error anywhere. That silence is exactly why this could
      // not be settled by reading code.
      const a = await sweepAsPurge(table);
      expect(a.seen, 'RLS should hide the row from a role with no policy').toBe(0);
      expect(a.deleted, 'the delete should affect 0 rows, not throw').toBe(0);
      expect(await ownerCount(table), 'the row survives the silently-empty sweep').toBe(1);

      // ── Phase B: a DELETE-only policy — the plausible-looking non-fix ───
      // Legalizes the DELETE but leaves every SELECT empty, so the sweep's
      // batch is empty, its loop exits, and it never issues the delete at all.
      await db.$executeRawUnsafe(
        `CREATE POLICY "delete_only_probe" ON ${SCRATCH_SCHEMA}."${table}" FOR DELETE TO kanchuki_purge USING (true)`,
      );
      const b = await sweepAsPurge(table);
      expect(b.seen, 'a DELETE-only policy still hides the row from SELECT').toBe(0);
      expect(b.deleted, 'so the batch-select-then-delete sweep still takes nothing').toBe(0);
      expect(await ownerCount(table)).toBe(1);
      await db.$executeRawUnsafe(`DROP POLICY "delete_only_probe" ON ${SCRATCH_SCHEMA}."${table}"`);

      // ── Phase C: the policy migration 111 creates ───────────────────────
      // The statement is lifted from the migration (see policySql), so this
      // proves the DDL that will actually run rather than a paraphrase of it.
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL search_path = ${SCRATCH_SCHEMA}, public`);
        await tx.$executeRawUnsafe(policySql(policyName, table));
      });
      const c = await sweepAsPurge(table);
      expect(c.seen, 'the FOR ALL policy makes the row visible to the sweep').toBe(1);
      expect(c.deleted, 'and the sweep now removes it').toBe(1);
      expect(await ownerCount(table), 'the rows actually go').toBe(0);
    });
  }

  it('lets the purge role write the cron audit_logs row — a policy-less INSERT raises', async () => {
    // The cron's last act is db.auditLog.create() as kanchuki_purge. Unlike the
    // DELETE case this failure is loud — INSERT with no permissive policy raises
    // 42501 instead of inserting nothing — but it is a dependency on the same
    // policy, so the claim is executed rather than assumed.
    await db.$executeRawUnsafe(
      `CREATE TABLE ${SCRATCH_SCHEMA}."audit_logs" ("id" TEXT PRIMARY KEY, "action" TEXT NOT NULL)`,
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE ${SCRATCH_SCHEMA}."audit_logs" ENABLE ROW LEVEL SECURITY`,
    );
    await db.$executeRawUnsafe(
      `GRANT SELECT, INSERT ON ${SCRATCH_SCHEMA}."audit_logs" TO kanchuki_purge`,
    );

    const insertAudit = (tx: Queryable) =>
      tx.$executeRawUnsafe(
        `INSERT INTO "audit_logs" ("id", "action") VALUES ('a1', 'PURGE_SOFT_DELETED')`,
      );

    await expect(
      asRole('kanchuki_purge', insertAudit),
      'without a policy the audit write fails loudly',
    ).rejects.toThrow(/row-level security/i);

    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path = ${SCRATCH_SCHEMA}, public`);
      await tx.$executeRawUnsafe(policySql(policyName, 'audit_logs'));
    });
    await asRole('kanchuki_purge', insertAudit);

    const rows = await db.$queryRawUnsafe<{ c: number }[]>(
      `SELECT count(*)::int AS c FROM ${SCRATCH_SCHEMA}."audit_logs"`,
    );
    expect(rows[0]?.c, 'the audit row lands once the policy exists').toBe(1);
  });
});
