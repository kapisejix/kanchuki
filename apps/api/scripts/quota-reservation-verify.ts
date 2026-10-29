#!/usr/bin/env tsx
/**
 * RC-102 real-Postgres verification. SCRATCH DATABASE ONLY - the owner runs it, never prod.
 *
 * Why: lib/quota.ts and jobs/quota-reservation-sweep.ts are unit-tested with mocked Prisma. What
 * the mocks cannot show is that the raw SQL works on a real server: the `::"QuotaResourceType"`
 * cast on bound params, the row count `$executeRaw` returns for a CTE, the unique indexes, the
 * concurrent over-limit race, and migration 145's index being picked for the sweep's predicate.
 *
 * Steps (from apps/api):
 *   1. Apply migrations 144 and 145 to the scratch DB with psql (this script checks they exist):
 *        psql "$SCRATCH_DATABASE_URL" -v ON_ERROR_STOP=1 -f ../../packages/db/prisma/migrations/144_quota_reservations/migration.sql
 *        psql "$SCRATCH_DATABASE_URL" -v ON_ERROR_STOP=1 -f ../../packages/db/prisma/migrations/145_product_photos_studio_job_idx/migration.sql
 *   2. DATABASE_URL="$SCRATCH_DATABASE_URL" npx tsx scripts/quota-reservation-verify.ts
 *
 * Refuses to run unless DATABASE_URL contains the scratch project ref (override the marker with
 * QUOTA_VERIFY_DB_MARKER). Seeds one retailer + one customer account + limit rows under a unique
 * run id, and removes them (and restores customer_resource_limits) in a `finally`. The role in
 * DATABASE_URL needs DELETE and `SET LOCAL session_replication_role` (the scratch owner has both).
 * The sweep runs over the whole scratch DB, so it also settles any other stuck rows there.
 * Exit code 0 = every check passed, 1 = any failure, 2 = refused to start.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '@kanchuki/db';
import type { QuotaResourceType } from '@kanchuki/db';
import { AppError } from '../src/plugins/error-handler.js';
import {
  markCustomerJobQuotaSpent,
  markJobQuotaSpent,
  periodStart,
  refundCustomerJobQuota,
  refundJobQuota,
  reserveCustomerJobQuota,
  reserveJobQuota,
} from '../src/lib/quota.js';
import { handleQuotaReservationSweep } from '../src/jobs/quota-reservation-sweep.js';

const MARKER = process.env['QUOTA_VERIFY_DB_MARKER'] ?? 'ibstbjzuiypactbscdrw';
const url = process.env['DATABASE_URL'] ?? '';
if (!url.includes(MARKER)) {
  console.error(`Refusing to run: DATABASE_URL does not contain the scratch marker "${MARKER}".`);
  process.exit(2);
}

const STUDIO: QuotaResourceType = 'STUDIO_SHOOT';
const TRYON: QuotaResourceType = 'TRY_ON_GENERATION';
const CROP: QuotaResourceType = 'IMAGE_CROP';
const RUN = `qv${Date.now()}`;
const STUDIO_LIMIT = 5;
const CUSTOMER_LIMIT = 3;

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

async function step(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}  [threw: ${err instanceof Error ? err.message : String(err)}]`);
  }
}

let retailerId = '';
let customerId = '';
const photoIds: string[] = [];
let priorCustomerLimit: { limit_per_period: number; period: 'DAY' | 'MONTH' | 'LIFETIME' } | null = null;

const MONTH = periodStart('MONTH');
const retailerCount = async (r: QuotaResourceType): Promise<number> =>
  (await prisma.usageCounter.findFirst({ where: { retailer_id: retailerId, resource_type: r, period_start: MONTH } }))
    ?.count ?? 0;
const customerCount = async (r: QuotaResourceType): Promise<number> =>
  (
    await prisma.customerUsageCounter.findFirst({
      where: { customer_account_id: customerId, resource_type: r, period_start: MONTH },
    })
  )?.count ?? 0;
const resv = (jobId: string, r: QuotaResourceType, scope: 'retailer' | 'customer') =>
  prisma.quotaReservation.findMany({
    where: {
      job_id: jobId,
      resource_type: r,
      ...(scope === 'retailer' ? { retailer_id: { not: null } } : { customer_account_id: { not: null } }),
    },
  });
const stateOf = async (jobId: string, r: QuotaResourceType, scope: 'retailer' | 'customer'): Promise<string> =>
  (await resv(jobId, r, scope))[0]?.state ?? 'MISSING';
const ageRow = (jobId: string, r: QuotaResourceType, hours: number) =>
  prisma.$executeRaw`
    UPDATE quota_reservations SET created_at = now() - make_interval(hours => ${hours})
    WHERE job_id = ${jobId} AND resource_type = ${r}::"QuotaResourceType"`;

async function preflight(): Promise<void> {
  const tables = await prisma.$queryRaw<{ t: string | null }[]>`SELECT to_regclass('public.quota_reservations')::text AS t`;
  if (!tables[0]?.t) throw new Error('quota_reservations missing: apply migration 144 to the scratch DB first');
  const names = ['quota_reservations_retailer_job_key', 'quota_reservations_customer_job_key', 'product_photos_studio_job_id_idx'];
  const idx = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE indexname = ANY(${names})`;
  const have = new Set(idx.map((i) => i.indexname));
  for (const n of names) {
    check(`index exists: ${n}`, have.has(n), have.has(n) ? '' : 'apply migrations 144 + 145');
  }
  if (have.size < names.length) throw new Error('migrations 144/145 not fully applied');
}

async function seed(): Promise<void> {
  const retailer = await prisma.retailer.create({
    data: {
      auth_user_id: `${RUN}-auth`,
      phone: `+91${String(Math.floor(Math.random() * 1e10)).padStart(10, '0')}`,
      shop_name: `${RUN} scratch shop`,
      city: 'Scratch',
    },
  });
  retailerId = retailer.id;
  const account = await prisma.customerAccount.create({
    data: {
      phone: `+91${String(Math.floor(Math.random() * 1e10)).padStart(10, '0')}`,
      phone_hash: `${RUN}-${randomUUID()}`,
    },
  });
  customerId = account.id;

  await prisma.retailerLimitOverride.createMany({
    data: [
      { retailer_id: retailerId, resource_type: STUDIO, limit_per_period: STUDIO_LIMIT, period: 'MONTH' },
      { retailer_id: retailerId, resource_type: TRYON, limit_per_period: 50, period: 'MONTH' },
      { retailer_id: retailerId, resource_type: CROP, limit_per_period: -1, period: 'MONTH' },
    ],
  });
  const prior = await prisma.customerResourceLimit.findUnique({ where: { resource_type: TRYON } });
  priorCustomerLimit = prior ? { limit_per_period: prior.limit_per_period, period: prior.period } : null;
  await prisma.customerResourceLimit.upsert({
    where: { resource_type: TRYON },
    create: { resource_type: TRYON, limit_per_period: CUSTOMER_LIMIT, period: 'MONTH' },
    update: { limit_per_period: CUSTOMER_LIMIT, period: 'MONTH' },
  });
}

async function cleanup(): Promise<void> {
  const errs: string[] = [];
  const attempt = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
    } catch (e) {
      errs.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  if (photoIds.length) await attempt('product_photos', () => prisma.$executeRaw`DELETE FROM product_photos WHERE id = ANY(${photoIds})`);
  if (retailerId) {
    await attempt('try_on_jobs', () => prisma.$executeRaw`DELETE FROM try_on_jobs WHERE retailer_id = ${retailerId}`);
    await attempt('retailer (cascades counters, reservations, overrides)', () => prisma.$executeRaw`DELETE FROM retailers WHERE id = ${retailerId}`);
  }
  if (customerId) await attempt('customer_account (cascades)', () => prisma.customerAccount.delete({ where: { id: customerId } }));
  await attempt('customer_resource_limits restore', async () => {
    if (priorCustomerLimit) {
      await prisma.customerResourceLimit.update({ where: { resource_type: TRYON }, data: priorCustomerLimit });
    } else {
      await prisma.$executeRaw`DELETE FROM customer_resource_limits WHERE resource_type = ${TRYON}::"QuotaResourceType"`;
    }
  });
  console.log(errs.length ? `CLEANUP INCOMPLETE (scratch rows left, run id ${RUN}):\n  ${errs.join('\n  ')}` : 'cleanup ok');
}

/** Rows that point at a product that does not exist; the tx skips FK triggers (scratch only). */
async function seedSweepTraces(photoJobId: string, tryOns: { id: string; status: string; gpuMs: number | null }[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    const photoId = `${RUN}-photo`;
    photoIds.push(photoId);
    await tx.$executeRaw`
      INSERT INTO product_photos (id, product_id, retailer_id, url, r2_key, metadata)
      VALUES (${photoId}, ${`${RUN}-product`}, ${retailerId}, 'https://example.invalid/x.jpg', ${`${RUN}/x.jpg`},
              ${JSON.stringify({ studio: { job_id: photoJobId } })}::jsonb)`;
    for (const t of tryOns) {
      await tx.$executeRaw`
        INSERT INTO try_on_jobs (id, retailer_id, product_id, status, gpu_ms)
        VALUES (${t.id}, ${retailerId}, ${`${RUN}-product`}, ${t.status}, ${t.gpuMs})`;
    }
  });
}

async function main(): Promise<void> {
  await preflight();
  await seed();
  console.log(`seeded retailer ${retailerId}, customer ${customerId}, run ${RUN}\n`);

  // 1. cast + row count + reservation row
  await step('reserve basics', async () => {
    await reserveJobQuota(retailerId, STUDIO, `${RUN}-j1`);
    check('reserveJobQuota resolves ($executeRaw cast + CTE row count)', true);
    check('counter = 1 after one reserve', (await retailerCount(STUDIO)) === 1, `got ${await retailerCount(STUDIO)}`);
    const [row] = await resv(`${RUN}-j1`, STUDIO, 'retailer');
    check(
      'reservation row: RESERVED, amount 1, period_start = start of month',
      row?.state === 'RESERVED' && row.amount === 1 && row.period_start.getTime() === MONTH.getTime(),
      row ? `${row.state}/${row.amount}/${row.period_start.toISOString()}` : 'no row',
    );
  });

  // 2. duplicate (job, resource) is atomic: throws, counter not bumped
  await step('duplicate job id', async () => {
    let threw = false;
    try {
      await reserveJobQuota(retailerId, STUDIO, `${RUN}-j1`);
    } catch {
      threw = true;
    }
    check('second reserve of same (job, resource) throws', threw);
    check('counter still 1 (bump rolled back with the failed insert)', (await retailerCount(STUDIO)) === 1, `got ${await retailerCount(STUDIO)}`);
  });

  // 3. amount over limit and scope CHECK
  await step('amount > limit + scope check', async () => {
    let code = '';
    try {
      await reserveJobQuota(retailerId, STUDIO, `${RUN}-big`, STUDIO_LIMIT + 1);
    } catch (e) {
      code = e instanceof AppError ? e.code : String(e);
    }
    check('amount > limit throws a limit AppError, writes nothing', code.includes('LIMIT') && (await resv(`${RUN}-big`, STUDIO, 'retailer')).length === 0, code);
    let checkFired = false;
    try {
      await prisma.$executeRaw`
        INSERT INTO quota_reservations (id, job_id, resource_type, period_start, amount)
        VALUES (${randomUUID()}, ${`${RUN}-noscope`}, ${STUDIO}::"QuotaResourceType", ${MONTH}, 1)`;
    } catch {
      checkFired = true;
    }
    check('row with neither retailer nor customer is rejected by the scope CHECK', checkFired);
  });

  // 4. concurrent over-limit race (retailer)
  await step('retailer race', async () => {
    const room = STUDIO_LIMIT - (await retailerCount(STUDIO));
    const N = 20;
    const settled = await Promise.allSettled(
      Array.from({ length: N }, (_, i) => reserveJobQuota(retailerId, STUDIO, `${RUN}-race-${i}`)),
    );
    const ok = settled.filter((s) => s.status === 'fulfilled').length;
    const limitErrs = settled.filter(
      (s) => s.status === 'rejected' && s.reason instanceof AppError && s.reason.code.includes('LIMIT'),
    ).length;
    check(`exactly ${room} of ${N} concurrent reserves win`, ok === room, `won ${ok}`);
    check('every loser is a limit AppError', limitErrs === N - room, `limit errors ${limitErrs}`);
    check(`counter = limit (${STUDIO_LIMIT}), never above`, (await retailerCount(STUDIO)) === STUDIO_LIMIT, `got ${await retailerCount(STUDIO)}`);
    const held = await prisma.quotaReservation.count({ where: { retailer_id: retailerId, resource_type: STUDIO, state: 'RESERVED' } });
    check('RESERVED rows = counter (no orphan rows, no uncounted slot)', held === STUDIO_LIMIT, `rows ${held}`);
  });

  // 5. refund: idempotent, concurrent double refund drops the counter once
  await step('refund + mark-spent', async () => {
    await refundJobQuota(`${RUN}-j1`, STUDIO);
    check('refund drops counter by 1', (await retailerCount(STUDIO)) === STUDIO_LIMIT - 1, `got ${await retailerCount(STUDIO)}`);
    const [r] = await resv(`${RUN}-j1`, STUDIO, 'retailer');
    check('row REFUNDED with refunded_at set', r?.state === 'REFUNDED' && r.refunded_at !== null);
    await refundJobQuota(`${RUN}-j1`, STUDIO);
    check('second refund is a no-op', (await retailerCount(STUDIO)) === STUDIO_LIMIT - 1, `got ${await retailerCount(STUDIO)}`);

    // race-0 only exists if it won; pick any RESERVED race row.
    const target = await prisma.quotaReservation.findFirst({
      where: { retailer_id: retailerId, resource_type: STUDIO, state: 'RESERVED', job_id: { startsWith: `${RUN}-race-` } },
    });
    const before = await retailerCount(STUDIO);
    if (target) {
      await Promise.all(Array.from({ length: 10 }, () => refundJobQuota(target.job_id, STUDIO)));
    }
    check('10 concurrent refunds of one job drop the counter exactly once', !!target && (await retailerCount(STUDIO)) === before - 1, `${before} -> ${await retailerCount(STUDIO)}`);

    const spentTarget = await prisma.quotaReservation.findFirst({
      where: { retailer_id: retailerId, resource_type: STUDIO, state: 'RESERVED', job_id: { startsWith: `${RUN}-race-` } },
    });
    if (spentTarget) {
      await markJobQuotaSpent(spentTarget.job_id, STUDIO);
      check('mark-spent flips RESERVED -> SPENT', (await stateOf(spentTarget.job_id, STUDIO, 'retailer')) === 'SPENT');
      const c = await retailerCount(STUDIO);
      await refundJobQuota(spentTarget.job_id, STUDIO);
      check('refund after SPENT changes nothing', (await retailerCount(STUDIO)) === c && (await stateOf(spentTarget.job_id, STUDIO, 'retailer')) === 'SPENT');
    } else {
      check('mark-spent flips RESERVED -> SPENT', false, 'no RESERVED race row left to use');
    }

    // Documents known gap (finding 2): a refunded slot cannot be re-spent, so a late job runs free.
    await markJobQuotaSpent(`${RUN}-j1`, STUDIO);
    check('KNOWN GAP: mark-spent on a REFUNDED row is a no-op (late job would run free)', (await stateOf(`${RUN}-j1`, STUDIO, 'retailer')) === 'REFUNDED');
  });

  // 6. unlimited resource writes nothing
  await step('unlimited', async () => {
    await reserveJobQuota(retailerId, CROP, `${RUN}-crop`);
    check('limit -1: no reservation row, no counter row', (await resv(`${RUN}-crop`, CROP, 'retailer')).length === 0 && (await retailerCount(CROP)) === 0);
    await refundJobQuota(`${RUN}-crop`, CROP);
    await markJobQuotaSpent(`${RUN}-crop`, CROP);
    check('refund / mark-spent on the missing row do not throw', true);
  });

  // 7. customer scope: race, dual-scope job id, refund, mark-spent
  await step('customer scope', async () => {
    const N = 10;
    const settled = await Promise.allSettled(
      Array.from({ length: N }, (_, i) => reserveCustomerJobQuota(customerId, TRYON, `${RUN}-c${i}`)),
    );
    const ok = settled.filter((s) => s.status === 'fulfilled').length;
    const limitErrs = settled.filter(
      (s) => s.status === 'rejected' && s.reason instanceof AppError && s.reason.code === 'CUSTOMER_LIMIT_EXCEEDED',
    ).length;
    check(`exactly ${CUSTOMER_LIMIT} of ${N} concurrent shopper reserves win`, ok === CUSTOMER_LIMIT, `won ${ok}`);
    check('every loser is CUSTOMER_LIMIT_EXCEEDED', limitErrs === N - CUSTOMER_LIMIT, `got ${limitErrs}`);
    check(`customer counter = ${CUSTOMER_LIMIT}`, (await customerCount(TRYON)) === CUSTOMER_LIMIT, `got ${await customerCount(TRYON)}`);

    const winners = settled.flatMap((s, i) => (s.status === 'fulfilled' ? [i] : []));
    const [w1, w2] = winners;
    if (w1 === undefined || w2 === undefined) throw new Error('fewer than two shopper winners');
    await Promise.all([refundCustomerJobQuota(`${RUN}-c${w1}`, TRYON), refundCustomerJobQuota(`${RUN}-c${w1}`, TRYON)]);
    check('double customer refund drops counter once', (await customerCount(TRYON)) === CUSTOMER_LIMIT - 1, `got ${await customerCount(TRYON)}`);
    await markCustomerJobQuotaSpent(`${RUN}-c${w2}`, TRYON);
    await refundCustomerJobQuota(`${RUN}-c${w2}`, TRYON);
    check('customer SPENT row survives a refund', (await stateOf(`${RUN}-c${w2}`, TRYON, 'customer')) === 'SPENT' && (await customerCount(TRYON)) === CUSTOMER_LIMIT - 1);

    // A shopper try-on holds a retailer row AND a customer row under one job id.
    await reserveJobQuota(retailerId, TRYON, `${RUN}-dual`);
    await reserveCustomerJobQuota(customerId, TRYON, `${RUN}-dual`);
    check('same job id reserves in both scopes', (await stateOf(`${RUN}-dual`, TRYON, 'retailer')) === 'RESERVED' && (await stateOf(`${RUN}-dual`, TRYON, 'customer')) === 'RESERVED');
    await refundJobQuota(`${RUN}-dual`, TRYON);
    check('retailer refund leaves the customer row alone', (await stateOf(`${RUN}-dual`, TRYON, 'customer')) === 'RESERVED');
    await refundCustomerJobQuota(`${RUN}-dual`, TRYON);
  });

  // 8. sweep
  await step('sweep', async () => {
    const studioPhoto = `${RUN}-sw-studio-photo`;
    const studioNone = `${RUN}-sw-studio-none`;
    const tryDone = `${RUN}-sw-try-gpu`;
    const tryCompleted = `${RUN}-sw-try-completed`;
    const tryFailed = `${RUN}-sw-try-failed`;
    const custStuck = `${RUN}-sw-cust`;
    const young = `${RUN}-sw-young`;

    // Make room under the studio limit: hand back every still-RESERVED race row.
    const leftovers = await prisma.quotaReservation.findMany({
      where: { retailer_id: retailerId, resource_type: STUDIO, state: 'RESERVED', job_id: { startsWith: `${RUN}-race-` } },
      select: { job_id: true },
    });
    for (const l of leftovers) await refundJobQuota(l.job_id, STUDIO);
    await reserveJobQuota(retailerId, STUDIO, studioPhoto);
    await reserveJobQuota(retailerId, STUDIO, studioNone);
    await reserveJobQuota(retailerId, STUDIO, young);
    for (const j of [tryDone, tryCompleted, tryFailed]) await reserveJobQuota(retailerId, TRYON, j);
    // The customer counter sits at CUSTOMER_LIMIT - 1, so exactly one more shopper slot exists.
    await reserveCustomerJobQuota(customerId, TRYON, custStuck);

    for (const j of [studioPhoto, studioNone]) await ageRow(j, STUDIO, 7);
    for (const j of [tryDone, tryCompleted, tryFailed]) await ageRow(j, TRYON, 7);
    await ageRow(custStuck, TRYON, 7);
    await ageRow(young, STUDIO, 1);

    await seedSweepTraces(studioPhoto, [
      { id: tryDone, status: 'FAILED', gpuMs: 4200 },
      { id: tryCompleted, status: 'COMPLETED', gpuMs: null },
      { id: tryFailed, status: 'FAILED', gpuMs: null },
    ]);

    const studioBefore = await retailerCount(STUDIO);
    const tryBefore = await retailerCount(TRYON);
    const custBefore = await customerCount(TRYON);
    const res = await handleQuotaReservationSweep();
    check('sweep reports no failed rows', res.failed === 0, JSON.stringify(res));

    check('studio job with a product_photos trace -> SPENT (raw $queryRaw ::text predicate)', (await stateOf(studioPhoto, STUDIO, 'retailer')) === 'SPENT');
    check('studio job without a photo -> REFUNDED', (await stateOf(studioNone, STUDIO, 'retailer')) === 'REFUNDED');
    check('studio counter dropped by exactly 1 (only the refunded one)', (await retailerCount(STUDIO)) === studioBefore - 1, `${studioBefore} -> ${await retailerCount(STUDIO)}`);
    check('try-on with gpu_ms (even FAILED) -> SPENT', (await stateOf(tryDone, TRYON, 'retailer')) === 'SPENT');
    check('try-on COMPLETED with null gpu_ms -> SPENT', (await stateOf(tryCompleted, TRYON, 'retailer')) === 'SPENT');
    check('try-on FAILED with null gpu_ms -> REFUNDED', (await stateOf(tryFailed, TRYON, 'retailer')) === 'REFUNDED');
    check('try-on retailer counter dropped by exactly 1', (await retailerCount(TRYON)) === tryBefore - 1, `${tryBefore} -> ${await retailerCount(TRYON)}`);
    check('stuck shopper row with no trace -> REFUNDED, customer counter -1', (await stateOf(custStuck, TRYON, 'customer')) === 'REFUNDED' && (await customerCount(TRYON)) === custBefore - 1, `${custBefore} -> ${await customerCount(TRYON)}`);
    check('young (1 h) RESERVED row untouched', (await stateOf(young, STUDIO, 'retailer')) === 'RESERVED');

    const again = await handleQuotaReservationSweep();
    check('second sweep changes none of our counters (idempotent)', (await retailerCount(STUDIO)) === studioBefore - 1 && (await retailerCount(TRYON)) === tryBefore - 1 && again.failed === 0, JSON.stringify(again));
  });

  // 9. migration 145 index matches the sweep predicate
  await step('index match', async () => {
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      // Same predicate as producedResult() in jobs/quota-reservation-sweep.ts.
      return tx.$queryRawUnsafe<Record<string, string>[]>(
        `EXPLAIN SELECT 1 AS one FROM product_photos WHERE metadata #> '{studio,job_id}' = to_jsonb('x'::text) LIMIT 1`,
      );
    });
    const text = plan.map((r) => Object.values(r)[0]).join('\n');
    check('planner can use product_photos_studio_job_id_idx for the sweep predicate (seqscan disabled)', text.includes('product_photos_studio_job_id_idx'), text.split('\n')[0] ?? '');
  });
}

try {
  await main();
} catch (err) {
  failures++;
  console.error('ABORTED:', err instanceof Error ? err.message : err);
} finally {
  await cleanup();
  await prisma.$disconnect();
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
