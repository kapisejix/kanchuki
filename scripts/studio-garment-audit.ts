// Live diagnosis for garment-set completeness (2026-09-18).
//
// Answers one question about one real photograph: which pieces of the outfit
// does the vision check actually see, would the completion gate fire on this
// product, and what exactly would be added to the studio prompt.
//
// Read-only — writes nothing to the database, the bucket or the repo, and makes
// exactly ONE AI call (one vision extract).
//
// Usage:
//   npx tsx scripts/studio-garment-audit.ts <image-path-or-url> \
//     [--category "Ladies Suit"] [--subtype "Kurta Set"] [--product-type Readymade]
//
// Product flags simulate the tagger's row so the gate can be tested against the
// values it will actually see. Run it once with the flags from a real product
// (Product detail in the app shows category / subtype / product type) and once
// with none, to see the difference a missing subtype makes.
//
// Reads credentials the same way the API does — Admin → Integrations (DB) first,
// then the root .env — so it needs DATABASE_URL and at least one AI provider
// key, like the other scripts in this directory.
process.loadEnvFile();

const { readFileSync } = await import('node:fs');
const { fetchImageBuffer } = await import('@kanchuki/ai');
const {
  expectedParts,
  detectGarmentParts,
  missingParts,
  setCompletenessClause,
  framingClause,
  describeParts,
} = await import('../apps/api/src/lib/garment-parts.js');

type MediaType = 'image/jpeg' | 'image/png' | 'image/webp';

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  const value = i === -1 ? undefined : process.argv[i + 1];
  return value ? value : null;
}

/** JPEG (SOF marker) / PNG (IHDR) dimensions, without pulling in sharp. */
function readDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length > 24 && buffer.toString('latin1', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  let i = 2;
  while (i < buffer.length - 1) {
    if (buffer[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buffer[i + 1] ?? 0;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
    }
    i += 2 + buffer.readUInt16BE(i + 2);
  }
  return null;
}

const image = process.argv[2];
if (!image || image.startsWith('--')) {
  console.error(
    'Usage: npx tsx scripts/studio-garment-audit.ts <image-path-or-url> [--category X] [--subtype Y] [--product-type Z]',
  );
  process.exit(1);
}

const isUrl = /^https?:\/\//i.test(image);
let buffer: Buffer;
let mediaType: MediaType = 'image/jpeg';
try {
  if (isUrl) {
    buffer = await fetchImageBuffer(image);
    if (/\.png($|\?)/i.test(image)) mediaType = 'image/png';
    else if (/\.webp($|\?)/i.test(image)) mediaType = 'image/webp';
  } else {
    buffer = readFileSync(image);
    if (/\.png$/i.test(image)) mediaType = 'image/png';
    else if (/\.webp$/i.test(image)) mediaType = 'image/webp';
  }
} catch (err) {
  console.error(`Could not read the image: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const dims = readDimensions(buffer);
const category = flag('category');
const subtype = flag('subtype');
const productType = flag('product-type');

console.log('── Input ───────────────────────────────────────────────');
console.log(`  source          ${isUrl ? 'url' : 'local file'}`);
console.log(`  reference       ${image}`);
console.log(
  `  bytes           ${buffer.length.toLocaleString('en-IN')} (${Math.round(buffer.length / 1024)} KB)`,
);
console.log(
  `  dimensions      ${dims ? `${dims.width}x${dims.height} (${(dims.width / dims.height).toFixed(3)} aspect)` : 'unreadable'}`,
);

console.log('\n── Product data supplied ───────────────────────────────');
console.log(`  category        ${category ?? '(not supplied)'}`);
console.log(`  subtype         ${subtype ?? '(not supplied)'}`);
console.log(`  product_type    ${productType ?? '(not supplied)'}`);

console.log('\n── What the photograph shows (one vision call) ─────────');
const visible = await detectGarmentParts({ buffer, mediaType });
if (!visible) {
  console.log('  FAILED — no provider configured, or the model returned nothing usable.');
  console.log(
    '  The pipeline reads this as "nothing to complete" and behaves exactly as it does today.',
  );
  process.exit(1);
}
const mark = (b: boolean, yes = 'visible', no = 'NOT visible') => (b ? yes : no);
console.log(`  framing         ${visible.framing}`);
console.log(`  top             ${mark(visible.top)}`);
console.log(`  bottom          ${mark(visible.bottom)}`);
console.log(`  drape (dupatta) ${mark(visible.drape)}`);
console.log(`  feet            ${mark(visible.footwear, 'in frame', 'NOT in frame')}`);
console.log(`  reads as        ${visible.garmentType ?? '(no description)'}`);

console.log('\n── Expected vs visible ─────────────────────────────────');
const expected = expectedParts({ category, subtype, productType });
console.log(`  product contains ${describeParts(expected)}   (decided by ${expected.source})`);
const missing = missingParts(expected, visible);
if (expected.completable && missing.length > 0) {
  console.log('  gate             COMPLETION WOULD FIRE');
  console.log(`  missing          ${missing.join(', ')}`);
} else if (expected.completable) {
  console.log(
    '  gate             completion applicable, but nothing is missing — photo already shows the set',
  );
} else {
  console.log('  gate             NO COMPLETION');
}
console.log(`  reason           ${expected.reason}`);

const framing = framingClause(visible.framing);
const clause = expected.completable ? setCompletenessClause({ missing, subtype }) : '';
console.log('\n── What would be appended to the studio prompt ─────────');
if (!framing && !clause) {
  console.log('  (nothing — the prompt would be sent unchanged)');
} else {
  if (framing) console.log(`  FRAMING\n    ${framing}`);
  if (clause) console.log(`  COMPLETENESS\n    ${clause}`);
}

console.log('\n── Reading this ────────────────────────────────────────');
if (!expected.completable) {
  console.log('  The gate is off for this product, so the pipeline renders as it does today.');
  console.log('  If that is wrong for this product, the fix is in the product data (subtype /');
  console.log('  product_type), not in the prompt — see the reason line above.');
} else if (missing.length > 0) {
  console.log('  The gate fires. Compare this render with the same product photographed as a');
  console.log('  full-length shot of the whole set: if the physical bottom matches what the');
  console.log('  completion clause describes, the feature is behaving correctly.');
} else {
  console.log('  Nothing to complete — the source already shows every piece the product contains.');
  console.log('  If the RENDER still comes back missing a piece, the problem is the scene prompt');
  console.log('  or the framing, not the gate.');
}
