#!/usr/bin/env tsx
/**
 * One-off, OWNER-RUN: fill products.audience for older rows from category/subtype/name keywords.
 * No AI call. Dry-run by default.
 *
 * Usage (from apps/api, with the owner's DATABASE_URL):
 *   npx tsx scripts/backfill-product-audience.ts                    # dry run: counts + undecided list
 *   npx tsx scripts/backfill-product-audience.ts --retailer <id>    # dry run for one store
 *   npx tsx scripts/backfill-product-audience.ts --apply            # write
 *   npx tsx scripts/backfill-product-audience.ts --apply --batch 200
 *
 * Only live rows with audience IS NULL are read; every write is guarded so it never overwrites a
 * value. Resumable: a re-run only sees what is still NULL. Undecided rows stay NULL.
 */
import { handleProductAudienceBackfill } from '../src/jobs/product-audience-backfill.js';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dryRun = !process.argv.includes('--apply');
const batchArg = arg('--batch');
const retailerId = arg('--retailer');

if (dryRun) console.log('DRY RUN — nothing written. Use --apply to write.');

try {
  const res = await handleProductAudienceBackfill({
    dryRun,
    ...(batchArg ? { batch: Number.parseInt(batchArg, 10) } : {}),
    ...(retailerId ? { retailerId } : {}),
  });
  for (const u of res.undecided) {
    console.log(`undecided  ${u.id}  ${u.retailer_id}  ${u.category ?? '-'} / ${u.subtype ?? '-'}`);
  }
  console.log(
    JSON.stringify({
      dryRun,
      scanned: res.scanned,
      updated: res.updated,
      counts: res.counts,
      undecided: res.undecided.length,
    }),
  );
  process.exit(0);
} catch (err) {
  console.error('backfill-product-audience failed:', err);
  process.exit(1);
}
