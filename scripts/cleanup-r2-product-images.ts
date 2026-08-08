/**
 * Selective R2 image cleanup — deletes ONLY retail demo imagery, keeping the
 * shop's brand assets and admin infrastructure. (The globs below use `…` so
 * no literal star-slash sequence appears inside this doc comment.)
 *
 *   DELETE   retailers/<id>/products/…   (product photos, spin frames, ghost-mannequin)
 *            tryon/…                     (VTO inputs/results)
 *            measurements/…              (customer body-measurement photos)
 *            retailers/<id>/kyc/…        (retailer KYC docs)
 *
 *   KEEP     admin/…                     (background-images library, photo-cleanup tests)
 *            backups/…                   (pg_dump cold storage — the backup script writes here)
 *            retailers/<id>/logo|banner|categories/…
 *            catalog-pdf/…               (supplier catalog imports)
 *
 * Usage:
 *   npx tsx scripts/cleanup-r2-product-images.ts          # dry-run: list what WOULD be deleted
 *   npx tsx scripts/cleanup-r2-product-images.ts --apply  # actually delete
 *
 * Run AFTER the DB wipe (scripts/reset-demo-data.sql) so no live DB row still
 * references the objects being deleted.
 */
import { deleteObject, listObjects } from '../packages/ai/src/index.js';

try {
  process.loadEnvFile('.env');
} catch {
  // no .env — rely on process env
}

const DELETE_PATTERNS: RegExp[] = [
  /^retailers\/[^/]+\/products\//,
  /^retailers\/[^/]+\/kyc\//,
  /^tryon\//,
  /^measurements\//,
];

function shouldDelete(key: string): boolean {
  return DELETE_PATTERNS.some((re) => re.test(key));
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '🗑️  R2 cleanup — APPLY mode (deleting)' : '👀 R2 cleanup — dry run (no changes)');

  const objects = await listObjects();
  const toDelete = objects.filter((o) => shouldDelete(o.key));
  const kept = objects.length - toDelete.length;
  const deleteBytes = toDelete.reduce((sum, o) => sum + o.size, 0);

  console.log(`   Total objects: ${objects.length}`);
  console.log(`   To delete:     ${toDelete.length} (${(deleteBytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   Kept:          ${kept} (backgrounds, backups, logos, banners, categories)`);
  console.log();

  if (toDelete.length === 0) {
    console.log('Nothing to delete — bucket is clean of demo imagery.');
    return;
  }

  // Per-prefix breakdown so you can sanity-check before applying.
  const byPrefix = new Map<string, number>();
  for (const o of toDelete) {
    const prefix = o.key.split('/').slice(0, 3).join('/');
    byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
  }
  for (const [prefix, count] of [...byPrefix.entries()].sort()) {
    console.log(`   ${prefix}/  → ${count} objects`);
  }

  if (!apply) {
    console.log();
    console.log('Dry run complete — re-run with --apply to delete these objects.');
    return;
  }

  let ok = 0;
  let failed = 0;
  const CONCURRENCY = 4;
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < toDelete.length) {
      const obj = toDelete[cursor++];
      try {
        await deleteObject(obj.key);
        ok++;
      } catch (err) {
        failed++;
        console.error(`   ✗ ${obj.key}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });
  await Promise.all(workers);

  console.log();
  console.log(`Done: ${ok} deleted, ${failed} failed.`);
  if (failed > 0) console.log('Failed objects were skipped — re-run to retry them.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('R2 cleanup failed:', err);
    process.exit(1);
  });
