#!/usr/bin/env tsx
/**
 * One-off, OWNER-RUN (RC-172 follow-up): null the photo-derived My Style profile on accounts that
 * were deleted before the erasure fix. Dry-run by default.
 *
 * Usage (from apps/api, with the owner's DATABASE_URL):
 *   npx tsx scripts/sweep-deleted-account-style.ts            # dry run: how many rows would change
 *   npx tsx scripts/sweep-deleted-account-style.ts --apply    # write
 */
import { sweepDeletedAccountStyle } from '../src/lib/sweep-deleted-account-style.js';

const apply = process.argv.includes('--apply');
if (!apply) console.log('DRY RUN: nothing written. Use --apply to write.');

try {
  console.log(JSON.stringify(await sweepDeletedAccountStyle({ apply })));
  process.exit(0);
} catch (err) {
  console.error('sweep-deleted-account-style failed:', err);
  process.exit(1);
}
