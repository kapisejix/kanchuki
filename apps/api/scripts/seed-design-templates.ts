#!/usr/bin/env tsx
/**
 * Owner-run: seed starter social design templates with PLACEHOLDER backgrounds (D7) generated in
 * code (gradient + inner border). Real art replaces them later via Admin -> Design Library. The catalogue (9 plain placeholders + the T6 starter pack of festival/offer/store designs, all original code-drawn art) lives in src/lib/design-seed-data.ts.
 *
 * Usage (from apps/api, with DATABASE_URL + R2_* env set):
 *   npx tsx scripts/seed-design-templates.ts           # dry-run: validates specs, writes nothing
 *   npx tsx scripts/seed-design-templates.ts --apply   # uploads backgrounds, inserts DRAFT rows
 *
 * Idempotent by name: a design whose name already exists is skipped. Rows are created as DRAFT so
 * the owner reviews each one in the Design Library before publishing. NEVER point this at prod
 * without the owner's go-ahead.
 */
import { createHash } from 'node:crypto';
import { uploadBuffer } from '@kanchuki/ai';
import { type Prisma, prisma } from '@kanchuki/db';
import { R2_PATHS, parseDesignSpec } from '@kanchuki/shared';
import sharp from 'sharp';
import { DESIGNS, backgroundSvg } from '../src/lib/design-seed-data.js';

const apply = process.argv.includes('--apply');

let created = 0;
for (const d of DESIGNS) {
  const parsed = parseDesignSpec({ layers: d.layers(d.palette) }, d.format, d.slots);
  if (!parsed.ok) throw new Error(`${d.name}: ${parsed.error}`);
  if (!apply) {
    // Offline on purpose: a dry-run never opens a DB connection (the env may point at prod).
    console.log(
      `would  ${d.name}  ${d.format}  ${d.slots} product(s)  ${parsed.spec.layers.length} layers`,
    );
    continue;
  }
  if (await prisma.designTemplate.findFirst({ where: { name: d.name } })) {
    console.log(`skip   ${d.name} (exists)`);
    continue;
  }
  const key = R2_PATHS.designTemplateAsset(
    `seed-${createHash('sha256').update(d.name).digest('hex').slice(0, 12)}.jpg`,
  );
  await uploadBuffer(
    key,
    await sharp(Buffer.from(backgroundSvg(d)))
      .jpeg({ quality: 88 })
      .toBuffer(),
    'image/jpeg',
  );
  await prisma.designTemplate.create({
    data: {
      name: d.name,
      occasion: d.occasion,
      format: d.format,
      product_slots: d.slots,
      spec: parsed.spec as unknown as Prisma.InputJsonValue,
      background_key: key,
      plans: ['STARTER', 'GROWTH', 'PRO'],
    },
  });
  created++;
  console.log(`create ${d.name}`);
}
console.log(JSON.stringify({ apply, created }));
if (!apply) console.log('Dry run: nothing written. Use --apply to write.');
if (apply) await prisma.$disconnect();
