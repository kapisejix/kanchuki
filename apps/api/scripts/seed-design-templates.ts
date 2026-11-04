#!/usr/bin/env tsx
/**
 * Owner-run: seed starter social design templates with PLACEHOLDER backgrounds (D7) generated in
 * code (gradient + inner border). Real art replaces them later via Admin -> Social Templates.
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
import {
  DESIGN_FORMATS,
  type DesignFormat,
  type DesignLayer,
  R2_PATHS,
  parseDesignSpec,
} from '@kanchuki/shared';
import sharp from 'sharp';

const apply = process.argv.includes('--apply');

interface Palette {
  from: string;
  to: string;
  border: string;
  ink: string;
}
const CREAM: Palette = { from: '#fffaf0', to: '#f3e6cf', border: '#b8860b', ink: '#2b2118' };
const MAROON: Palette = { from: '#7a1226', to: '#3d0a14', border: '#e6c36a', ink: '#fff4d6' };
const EMERALD: Palette = { from: '#0f5a46', to: '#06281f', border: '#e6c36a', ink: '#f6f0dc' };
const ROSE: Palette = { from: '#fde4ea', to: '#f7b9c8', border: '#a3324f', ink: '#3b1220' };
const NAVY: Palette = { from: '#1c2a52', to: '#0b1226', border: '#d9b45a', ink: '#f4efe0' };

const text = (
  v: string,
  y: number,
  size: number,
  ink: string,
  o: Record<string, unknown> = {},
): DesignLayer =>
  ({
    type: 'text',
    var: v,
    x: 60,
    y,
    w: 960,
    size: Math.round(size),
    font: 'sans',
    color: ink,
    align: 'center',
    ...o,
  }) as DesignLayer;

const image = (x: number, y: number, w: number, h: number, index = 0): DesignLayer => ({
  type: 'image',
  var: 'product_image',
  x,
  y,
  w,
  h,
  fit: 'contain',
  index,
});

function single(format: DesignFormat, ink: string, withOffer: boolean): DesignLayer[] {
  // [shopY, imgY, imgH, nameY, priceY, offerY, phoneY]
  const L: Record<DesignFormat, number[]> = {
    SQUARE: [40, 120, 640, 800, 870, 960, 1020],
    PORTRAIT_4_5: [70, 150, 800, 990, 1090, 1190, 1270],
    STORY_9_16: [110, 260, 1100, 1420, 1520, 1650, 1780],
  };
  const [shop, imgY, imgH, name, price, offer, phone] = L[format] as number[];
  const k = format === 'STORY_9_16' ? 1.3 : 1;
  return [
    text('shop_name', shop as number, 54 * k, ink, { font: 'serif' }),
    image(90, imgY as number, 900, imgH as number),
    text('product_name', name as number, 46 * k, ink, { maxLines: 2 }),
    text('price', price as number, 72 * k, ink, { font: 'serif', bold: true, format: 'inr' }),
    ...(withOffer ? [text('offer_text', offer as number, 40 * k, ink)] : []),
    text('shop_phone', phone as number, 34 * k, ink),
  ];
}

function duo(ink: string): DesignLayer[] {
  return [
    text('shop_name', 60, 54, ink, { font: 'serif' }),
    ...[60, 560].flatMap((x, i) => [
      image(x, 170, 460, 640, i),
      text('product_name', 830, 38, ink, { x, w: 460, maxLines: 2, index: i }),
      text('price', 930, 56, ink, {
        x,
        w: 460,
        font: 'serif',
        bold: true,
        format: 'inr',
        index: i,
      }),
    ]),
    text('offer_text', 1130, 44, ink),
    text('shop_phone', 1270, 34, ink),
  ];
}

const DESIGNS: {
  name: string;
  occasion: string;
  format: DesignFormat;
  slots: number;
  palette: Palette;
  layers: (p: Palette) => DesignLayer[];
}[] = [
  {
    name: 'Classic Cream',
    occasion: 'General',
    format: 'PORTRAIT_4_5',
    slots: 1,
    palette: CREAM,
    layers: (p) => single('PORTRAIT_4_5', p.ink, true),
  },
  {
    name: 'Diwali Gold',
    occasion: 'Diwali',
    format: 'PORTRAIT_4_5',
    slots: 1,
    palette: MAROON,
    layers: (p) => single('PORTRAIT_4_5', p.ink, true),
  },
  {
    name: 'Wedding Rose',
    occasion: 'Wedding',
    format: 'PORTRAIT_4_5',
    slots: 1,
    palette: ROSE,
    layers: (p) => single('PORTRAIT_4_5', p.ink, true),
  },
  {
    name: 'Festive Emerald',
    occasion: 'Festive',
    format: 'SQUARE',
    slots: 1,
    palette: EMERALD,
    layers: (p) => single('SQUARE', p.ink, true),
  },
  {
    name: 'New Arrival Navy',
    occasion: 'New Arrival',
    format: 'SQUARE',
    slots: 1,
    palette: NAVY,
    layers: (p) => single('SQUARE', p.ink, false),
  },
  {
    name: 'Story Maroon',
    occasion: 'General',
    format: 'STORY_9_16',
    slots: 1,
    palette: MAROON,
    layers: (p) => single('STORY_9_16', p.ink, true),
  },
  {
    name: 'Story Cream',
    occasion: 'General',
    format: 'STORY_9_16',
    slots: 1,
    palette: CREAM,
    layers: (p) => single('STORY_9_16', p.ink, true),
  },
  {
    name: 'Duo Rose',
    occasion: 'General',
    format: 'PORTRAIT_4_5',
    slots: 2,
    palette: ROSE,
    layers: (p) => duo(p.ink),
  },
  {
    name: 'Duo Navy',
    occasion: 'Festive',
    format: 'PORTRAIT_4_5',
    slots: 2,
    palette: NAVY,
    layers: (p) => duo(p.ink),
  },
];

async function background(format: DesignFormat, p: Palette): Promise<Buffer> {
  const { w, h } = DESIGN_FORMATS[format];
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`,
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">',
    `<stop offset="0" stop-color="${p.from}"/><stop offset="1" stop-color="${p.to}"/>`,
    `</linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>`,
    `<rect x="24" y="24" width="${w - 48}" height="${h - 48}" fill="none" stroke="${p.border}" stroke-width="6"/>`,
    '</svg>',
  ].join('');
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

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
  await uploadBuffer(key, await background(d.format, d.palette), 'image/jpeg');
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
