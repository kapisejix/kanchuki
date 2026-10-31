/**
 * RC-102 / H6-2: the REAL saveUnderDailyCap against a REAL Postgres. Skipped unless
 * REVIEW_CAP_PG_URL is set, so CI (mock Postgres only) never runs it. Local recipe:
 *   docker run -d --name replay-pg -e POSTGRES_USER=ci -e POSTGRES_PASSWORD=ci \
 *     -e POSTGRES_DB=replay -p 54329:5432 pgvector/pgvector:pg16
 *   DATABASE_URL=postgresql://ci:ci@localhost:54329/replay bash scripts/check-migration-replay.sh
 *   REVIEW_CAP_PG_URL=postgresql://ci:ci@localhost:54329/replay pnpm --filter @kanchuki/api exec vitest run src/lib/review-cap.pg.test.ts
 * THROWAWAY localhost databases only: setup turns FK enforcement off for the database
 * (session_replication_role = replica) so the fixtures need no retailers or products.
 */
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const url = process.env.REVIEW_CAP_PG_URL;
const enabled = !!url && /@(localhost|127\.0\.0\.1)[:/]/.test(url);
if (url && !enabled) throw new Error('REVIEW_CAP_PG_URL must be a localhost database');

const m = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock('@kanchuki/db', async () => {
  const { PrismaClient: Client } = await import('@prisma/client');
  const client = new Client({ datasourceUrl: process.env.REVIEW_CAP_PG_URL });
  m.client = client;
  return { prisma: client };
});

import { MAX_NEW_REVIEWS_PER_DAY, saveUnderDailyCap } from './review-cap.js';

const db = () => m.client as PrismaClient;
const ACCOUNT = 'ca_cap_test';
const never = async () => false;
let seq = 0;
const insertStoreReview = (tx: Pick<PrismaClient, '$executeRaw'>, account: string) =>
  tx.$executeRaw`INSERT INTO store_reviews (id, retailer_id, customer_account_id, rating, updated_at)
    VALUES (${`sr_${account}_${seq}`}, ${`ret_${seq++}`}, ${account}, 5, now())`; // unique (retailer, account)

describe.skipIf(!enabled)('saveUnderDailyCap on real Postgres', () => {
  beforeAll(async () => {
    const name = (await db().$queryRaw<{ n: string }[]>`SELECT current_database() AS n`)[0]?.n;
    await db().$executeRawUnsafe(`ALTER DATABASE "${name}" SET session_replication_role = replica`);
    await db().$disconnect(); // new connections pick the setting up
  });
  beforeEach(async () => {
    await db().$executeRaw`DELETE FROM store_reviews WHERE customer_account_id LIKE 'ca_cap_%'`;
  });
  afterAll(() => db().$disconnect());

  const burst = (n: number, account = ACCOUNT, isEdit = never) =>
    Promise.all(
      Array.from({ length: n }, () =>
        saveUnderDailyCap(account, isEdit, async (tx) => {
          await insertStoreReview(tx, account);
          return true;
        }),
      ),
    );
  const stored = async (account = ACCOUNT) =>
    Number(
      (
        await db().$queryRaw<
          { c: bigint }[]
        >`SELECT count(*) AS c FROM store_reviews WHERE customer_account_id = ${account}`
      )[0]?.c,
    );

  it('45 parallel first-time saves for one account admit exactly the cap', async () => {
    const results = await burst(45);
    expect(results.filter((r) => r === true)).toHaveLength(MAX_NEW_REVIEWS_PER_DAY);
    expect(results.filter((r) => r === null)).toHaveLength(45 - MAX_NEW_REVIEWS_PER_DAY);
    expect(await stored()).toBe(MAX_NEW_REVIEWS_PER_DAY);
  });

  it('a capped account can still edit (isEdit skips the cap)', async () => {
    await burst(MAX_NEW_REVIEWS_PER_DAY);
    const edit = await saveUnderDailyCap(
      ACCOUNT,
      async () => true,
      async () => 'edited',
    );
    expect(edit).toBe('edited');
  });

  it('another account is not blocked by a capped one', async () => {
    await burst(MAX_NEW_REVIEWS_PER_DAY);
    expect(await burst(1, 'ca_cap_other')).toEqual([true]);
  });

  it('reviews older than 24 h do not count', async () => {
    await db()
      .$executeRaw`INSERT INTO store_reviews (id, retailer_id, customer_account_id, rating, updated_at, created_at)
      SELECT 'old_' || g, 'ret_old_' || g, ${ACCOUNT}, 5, now(), now() - interval '25 hours' FROM generate_series(1, 30) g`;
    expect(await burst(1)).toEqual([true]);
  });
});
