// Applies ONE commission migration's SQL (additive DDL) to the database the
// API points at. This is the surgical alternative to `prisma migrate deploy`
// — the prod DB's _prisma_migrations table is not reliably in sync (several
// migrations were applied manually via the Supabase SQL Editor), so
// replaying history is riskier than applying a single migration verbatim.
//
// Run from apps/api so env comes from the same .env the API uses:
//   npx tsx --env-file .env ../../scripts/apply-commission-migration.ts <migration-dir>
//   e.g. npx tsx --env-file .env ../../scripts/apply-commission-migration.ts 054_admin_commission_soft_delete
//
// Prints only PASS/FAIL + hostname (never credentials). Read the migration
// SQL first — it is additive (new table / new column); nothing existing is
// modified or dropped.

import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Client } = pg;

async function main() {
  const migrationDir = process.argv[2];
  if (!migrationDir) {
    console.error('[apply-commission-migration] pass the migration directory name, e.g. 054_admin_commission_soft_delete');
    process.exitCode = 1;
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[apply-commission-migration] DATABASE_URL not set — aborting');
    process.exitCode = 1;
    return;
  }
  const host = (url.match(/@([^:/]+)/)?.[1] ?? 'unknown').replace(/^[^@]*@/, '');

  const sqlPath = new URL(
    `../packages/db/prisma/migrations/${migrationDir}/migration.sql`,
    import.meta.url,
  );
  const sql = readFileSync(sqlPath, 'utf8').trim();
  if (!sql) {
    console.error('[apply-commission-migration] migration SQL is empty — aborting');
    process.exitCode = 1;
    return;
  }

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 20000 });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`[apply-commission-migration] applied to db=${host}`);
  } catch (err) {
    console.error(`[apply-commission-migration] FAILED on ${host}:`, (err as Error).message);
    console.error('[apply-commission-migration] RESULT: not applied');
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main();
