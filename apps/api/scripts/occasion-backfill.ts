#!/usr/bin/env tsx
/**
 * One-off: fill products.occasions with a text-only AI call per product (platform-paid).
 *
 * Usage (from apps/api):
 *   npx tsx scripts/occasion-backfill.ts --limit=30            # dry-run sample, prints picks, writes nothing
 *   npx tsx scripts/occasion-backfill.ts --apply               # full run
 *   npx tsx scripts/occasion-backfill.ts --apply --limit=500   # partial run
 *
 * Idempotent: only products with empty occasions are touched. Updated products are queued
 * for re-embedding. Cost = (products with empty occasions) x (one text-only call).
 */
import { handleOccasionBackfill } from '../src/jobs/occasion-backfill.js';

const dryRun = !process.argv.includes('--apply');
const limitArg = process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
const limit = limitArg ? Number.parseInt(limitArg, 10) : undefined;

try {
  const res = await handleOccasionBackfill({ dryRun, ...(limit ? { limit } : {}) });
  for (const s of res.samples) {
    console.log(
      `${s.id}  ${s.category ?? '-'} / ${s.subtype ?? '-'}  ->  ${s.occasions.join(', ')}`,
    );
  }
  console.log(
    JSON.stringify({ dryRun, scanned: res.scanned, updated: res.updated, empty: res.empty }),
  );
  if (dryRun) console.log('Dry run: nothing written. Use --apply to write.');
  process.exit(0);
} catch (err) {
  console.error('occasion-backfill failed:', err);
  process.exit(1);
}
