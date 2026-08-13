// F-032 demo — "product image + background image → final studio shoot".
//
// Pipeline (uses the exact same building blocks as the committed F-032 API):
//   1. Cut the product out of its source photo (@imgly/background-removal-node,
//      the same rembg-class model the photo-cleanup pipeline uses).
//   2. Composite the cutout onto the user's studio background (sharp).
//   3. Send the composed image to FLUX Kontext [pro] with a HARMONIZE prompt:
//      keep the product's pixels identical, blend lighting/shadows so it
//      reads as a real studio shot (this is the step that avoids the flat
//      pasted-cutout look — the "own the subject, not the scene" lesson).
//   4. Download the result and save it next to this script.
//
// Usage (from apps/api, where tsx + @kanchuki/ai are on the path):
//   BFL_API_KEY=<key> npx tsx ../scripts/demo/2026-08-13/studio-shoot-demo.ts
//   (or just `npx tsx ...` with BFL_API_KEY in apps/api/.env)
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { removeBackground } from '@imgly/background-removal-node';
import { getStudioTemplate } from '@kanchuki/shared';

// @imgly/background-removal-node resolves its model files relative to a
// `publicPath` — the package's dist folder, as a URL. The API lib derives
// this via import.meta.resolve (unavailable under tsx, where it falls back
// to '' → invalid URI). Resolve the real install location with
// createRequire and convert it to a file:// URL here.
const require = createRequire(import.meta.url);
const imglyDist = require.resolve('@imgly/background-removal-node').replace(/dist.*$/, 'dist');
// Trailing slash is REQUIRED — new URL('resources.json', <url>) resolves
// relative to the last path segment, so a slash-less file URL would drop
// `dist` and look for resources.json at the package root (ENOENT).
const imglyDistUrl = `${pathToFileURL(imglyDist).toString()}/`;

const __dirname = dirname(fileURLToPath(import.meta.url));

const PRODUCT = process.env.DEMO_PRODUCT ?? join(__dirname, 'product-kurta.jpg');
const BACKGROUND = process.env.DEMO_BACKGROUND ?? join(__dirname, 'background-studio.jpg');
const TEMPLATE = (process.env.DEMO_TEMPLATE ?? 'warm_luxury') as Parameters<typeof getStudioTemplate>[0];

// The user's background is the scene — the AI pass harmonizes the composite,
// it does NOT invent a scene. This prompt is the F-032 subject-preservation
// contract applied to a composed input.
const HARMONIZE_PROMPT = `This image shows a product photo composited onto a studio background. Make it look like a single, professionally shot studio photograph:
- Keep the product (the garment) EXACTLY as-is — same shape, colors, pattern, embroidery, and fabric details. Do not redraw or restyle it.
- Blend the product into the scene with natural lighting and a soft grounding shadow that match the background's light direction.
- Remove any composite seams, halos, or color fringing around the product edges.
- Keep the background scene (wall color, pedestal, plant, shadows) essentially unchanged.`;

const BFL_BASE = 'https://api.bfl.ai/v1';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function cutoutProduct(input: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
  // @imgly's decoder switches on blob.type (not the actual bytes) — an
  // untyped blob always hits its "Unsupported format" branch. Same fix the
  // API pipeline applies (packages/ai/src/detector.ts cleanupProductPhoto).
  const { format } = await sharp(input).metadata();
  const inputBlob = new Blob([input], { type: `image/${format ?? 'jpeg'}` });
  const blob = await removeBackground(inputBlob, { publicPath: imglyDistUrl });
  const buffer = Buffer.from(await blob.arrayBuffer());
  const { width = 0, height = 0 } = await sharp(buffer).metadata();
  return { buffer, width, height };
}

/** Composite the cutout onto the background (cover-fit, centered, grounded). */
async function compose(cutout: Buffer, cw: number, ch: number, bg: Buffer): Promise<Buffer> {
  const bgSharp = sharp(bg).resize(cw, ch, { fit: 'cover' });
  // Composite the cutout centered; slight bottom bias so it reads "standing
  // on" the surface rather than floating.
  const left = 0;
  const top = Math.round(ch * 0.04);
  return bgSharp
    .composite([{ input: cutout, left, top }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

async function generate(sampleInput: Buffer): Promise<Buffer> {
  const apiKey = process.env.BFL_API_KEY;
  if (!apiKey) throw new Error('BFL_API_KEY is not set (add it to apps/api/.env or pass it inline)');

  const template = getStudioTemplate(TEMPLATE);
  if (!template) throw new Error(`Unknown template: ${TEMPLATE}`);

  // Base64 the composed image — FLUX Kontext accepts base64 input (≤20MB).
  const inputBase64 = sampleInput.toString('base64');

  const submitRes = await fetch(`${BFL_BASE}/flux-kontext-pro`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'x-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: `${HARMONIZE_PROMPT} ${template.prompt}`,
      input_image: inputBase64,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const submit = (await submitRes.json()) as { id?: string; polling_url?: string };
  if (!submitRes.ok || !submit.polling_url) {
    throw new Error(`BFL submit failed (${submitRes.status}): ${JSON.stringify(submit)}`);
  }

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const res = await fetch(submit.polling_url, {
      headers: { accept: 'application/json', 'x-key': apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    const poll = (await res.json()) as {
      status?: string;
      result?: { sample?: string };
      error?: string;
    };
    if (poll.status === 'Ready' && poll.result?.sample) {
      const img = await fetch(poll.result.sample, { signal: AbortSignal.timeout(60_000) });
      if (!img.ok) throw new Error(`Failed to download result: ${img.status}`);
      return Buffer.from(await img.arrayBuffer());
    }
    if (['Error', 'Failed', 'Content Moderated'].includes(poll.status ?? '')) {
      throw new Error(`BFL generation failed: ${poll.error ?? poll.status}`);
    }
    await sleep(1000);
  }
  throw new Error('BFL generation timed out');
}

async function main() {
  console.log(`Product:   ${PRODUCT}`);
  console.log(`Background:${BACKGROUND}`);
  console.log(`Template:  ${TEMPLATE}`);

  const [productBuf, bgBuf] = await Promise.all([readFile(PRODUCT), readFile(BACKGROUND)]);

  console.log('1/3 Cutting out the product…');
  const { buffer: cutout, width, height } = await cutoutProduct(productBuf);
  console.log(`     cutout ${width}x${height}`);

  console.log('2/3 Composing onto the studio background…');
  const composed = await compose(cutout, width, height, bgBuf);
  await writeFile(join(__dirname, 'step-2-composed.jpg'), composed);

  console.log('3/3 Generating studio-harmonized final (FLUX Kontext)…');
  const finalBuf = await generate(composed);

  const outPath = join(__dirname, `final-${basename(PRODUCT, '.jpeg')}-${Date.now()}.jpg`);
  await writeFile(outPath, finalBuf);
  console.log(`\n✅ Saved: ${outPath}`);
  console.log(`   (${(finalBuf.length / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error('Demo failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
