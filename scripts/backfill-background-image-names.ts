/**
 * One-off backfill: give AI scene names to background_images rows that still
 * carry a machine name (32-hex hash) from before AI naming shipped (aec7a2b,
 * 2026-08-29). Mirrors nameBackgroundScene() in
 * apps/api/src/routes/admin/admin-media.ts — kept as a local copy here rather
 * than exporting a route-file helper for a single throwaway script.
 *
 * Only rows whose name matches /^[0-9a-f]{32}$/ are touched, so this is safe
 * to re-run and never overwrites a name a human set.
 *
 * Usage (run through the api workspace so DB + AI-provider secrets load):
 *   pnpm --filter @kanchuki/api exec tsx ../../scripts/backfill-background-image-names.ts          # dry run
 *   pnpm --filter @kanchuki/api exec tsx ../../scripts/backfill-background-image-names.ts --apply  # write names
 */
import { fetchImageBuffer, runVisionAsk } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';

const APPLY = process.argv.includes('--apply');
const HASH_NAME = /^[0-9a-f]{32}$/;

async function nameBackgroundScene(buf: Buffer, url: string): Promise<string | null> {
  const lower = url.toLowerCase();
  const mediaType = lower.endsWith('.png')
    ? 'image/png'
    : lower.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg';
  try {
    const answer = await runVisionAsk({
      images: [{ buffer: buf, mediaType }],
      systemPrompt:
        'You name studio product-photography backdrops for a catalog tool. Reply with ONLY a 2-4 word Title Case name for the backdrop scene shown (e.g. "Royal Palace Courtyard", "Marigold Festive Backdrop", "Plain White Studio"). No quotes, no punctuation, no explanation.',
      userPrompt: 'Name this backdrop scene.',
      maxTokens: 20,
    });
    const cleaned = answer
      .trim()
      .replace(/^["']|["']$/g, '')
      .split(/[\n.]/)[0]!
      .trim()
      .slice(0, 100);
    return cleaned || null;
  } catch (err) {
    console.warn(`  ! AI naming failed for ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function main() {
  const rows = await prisma.backgroundImage.findMany({
    select: { id: true, name: true, image_url: true },
  });
  const stale = rows.filter((r) => HASH_NAME.test(r.name));
  console.log(
    `${rows.length} background images, ${stale.length} with hash names.${APPLY ? '' : ' (dry run — pass --apply to write)'}`,
  );

  for (const row of stale) {
    const buf = await fetchImageBuffer(row.image_url).catch((err) => {
      console.warn(`  ! fetch failed for ${row.id}:`, err instanceof Error ? err.message : err);
      return null;
    });
    if (!buf) continue;

    const name = await nameBackgroundScene(buf, row.image_url);
    const finalName = name ?? `Backdrop ${new Date().toISOString().slice(0, 10)}`;
    console.log(
      `  ${row.id}  ${row.name}  ->  ${finalName}${name ? '' : '  (AI failed, dated fallback)'}`,
    );

    if (APPLY) {
      await prisma.backgroundImage.update({ where: { id: row.id }, data: { name: finalName } });
    }
  }

  await prisma.$disconnect();
  console.log(APPLY ? 'Done.' : 'Dry run complete.');
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
