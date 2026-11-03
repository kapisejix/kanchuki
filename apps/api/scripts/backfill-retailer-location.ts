#!/usr/bin/env tsx
/**
 * One-off: give retailers with NO coordinates an APPROXIMATE location from their typed address
 * (OpenStreetMap Nominatim), so they show up in "Near Me" / Local Discovery until they pin the shop.
 *
 * Usage (from apps/api, DATABASE_URL set):
 *   npx tsx scripts/backfill-retailer-location.ts            # dry-run: prints every match, writes nothing
 *   npx tsx scripts/backfill-retailer-location.ts --apply    # writes the matches
 *
 * Requires migration 151 (retailers.location_source) applied first.
 * Safe to re-run: only rows with latitude AND longitude NULL are read, and the write repeats that
 * condition, so a retailer's own pin (or an earlier run) is never overwritten.
 * Written rows get location_source = 'GEOCODED_APPROX'; a retailer's own pin replaces them.
 * Match level (address / pincode / city) is printed: 'city' and 'pincode' are coarse - review them.
 */
import { prisma } from '@kanchuki/db';
import { geocodeAddress } from '../src/lib/geocode-address.js';

const apply = process.argv.includes('--apply');

try {
  const rows = await prisma.retailer.findMany({
    where: { deleted_at: null, latitude: null, longitude: null },
    select: {
      id: true,
      shop_name: true,
      address_line1: true,
      address_line2: true,
      city: true,
      state: true,
      pincode: true,
    },
    orderBy: { created_at: 'asc' },
  });

  let matched = 0;
  let written = 0;
  for (const r of rows) {
    const hit = await geocodeAddress(r);
    const name = r.shop_name || '(no name)';
    if (!hit) {
      console.log(`SKIP   ${r.id}  ${name}  - nothing to search or no match`);
      continue;
    }
    matched++;
    console.log(
      `${apply ? 'WRITE' : 'MATCH'}  ${r.id}  ${name}  ->  ${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)}  [${hit.level}]  ${hit.display.slice(0, 70)}`,
    );
    if (apply) {
      const res = await prisma.retailer.updateMany({
        where: { id: r.id, latitude: null, longitude: null },
        data: { latitude: hit.lat, longitude: hit.lng, location_source: 'GEOCODED_APPROX' },
      });
      written += res.count;
    }
  }
  console.log(JSON.stringify({ apply, scanned: rows.length, matched, written }));
  if (!apply) console.log('Dry run: nothing written. Review the list, then use --apply.');
  process.exit(0);
} catch (err) {
  console.error('backfill-retailer-location failed:', err);
  process.exit(1);
}
