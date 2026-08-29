// AI Studio Shoot — standalone demo. Mirrors apps/api/src/lib/studio-shoot.ts
// but with zero repo deps (no Redis / BullMQ / Prisma) so you can eyeball
// BFL FLUX Kontext output on real photos before trusting the pipeline.
//
// USAGE (from repo root):
//
//   # 1. Kontext: AI-invents the model, replaces background with a scene.
//   #    This is exactly what the shipped "Studio Shoot" feature does today.
//   BFL_API_KEY=sk-... node scripts/studio-shoot-demo.mjs kontext \
//       docs/photoshoots/product-1.jpg runway --gender female --age adult
//
//   # 2. VTON 2-step: warp the garment onto YOUR model photo (Fal IDM-VTON),
//   #    then Kontext swaps the background to the chosen scene.
//   BFL_API_KEY=sk-...  FAL_KEY=... node scripts/studio-shoot-demo.mjs vton \
//       docs/photoshoots/product-1.jpg docs/photoshoots/model-female-1.jpg beach
//
// Output -> docs/photoshoots/out/<mode>-<product>-<scene>.jpg
//
// ponytail: no arg-parser lib, no classifier for gender/age -- pass them as
// flags. The real API infers demographic from the product row (category/name);
// see resolveIndianModelDescription() in studio-shoot.ts.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const BFL_BASE = 'https://api.bfl.ai/v1';
const OUT_DIR = 'docs/photoshoots/out';

// ─── Scene prompts (condensed from STUDIO_TEMPLATES + AI Models and Scenes.html)
// The {MODEL} token is filled from --gender/--age so the same scene works for
// womenswear / menswear / kids without separate entries.
const SCENES = {
  runway:
    'Place this exact outfit on {MODEL} walking gracefully down a high-fashion catwalk runway, overhead spotlights, soft blurred audience bokeh behind.',
  beach:
    'Place this exact outfit on {MODEL} walking on a serene luxury Goa beach at golden-hour sunset, soft turquoise waves and coconut-palm silhouettes blurred behind, warm grounding shadow on the sand.',
  palace:
    'Place this exact outfit on {MODEL} standing in a grand Udaipur royal palace marble courtyard, carved arches and brass lanterns in warm evening background bokeh.',
  garden:
    'Place this exact outfit on {MODEL} standing in a lush Mughal botanical garden, marble fountain and marigold beds behind, soft golden-hour daylight.',
  street:
    'Place this exact outfit on {MODEL} in a vibrant Jaipur heritage street, terracotta-pink carved walls and antique wooden doors behind, soft morning light.',
  studio:
    'Place this exact outfit on {MODEL} in a clean editorial studio, seamless grey-beige backdrop, professional softbox lighting, soft grounding shadow.',
  white_studio:
    'Replace the background with a clean seamless white studio backdrop (marketplace style). Keep {MODEL} if present. Soft even 5500K lighting, soft contact shadow.',
  diwali:
    'Place this exact outfit on {MODEL} in a festive Diwali setting, rows of glowing clay diyas and marigold torans strictly in soft background bokeh.',
  rain:
    'Place this exact outfit on {MODEL} on a moody rain-soaked city street at dusk, wet reflective pavement and warm shop-window bokeh behind.',
  mustard_field:
    'Place this exact outfit on {MODEL} standing in a bright Punjab mustard-flower field under open blue sky, gentle breeze, shallow depth of field.',
};

const MODEL_PHRASE = ({ gender, age }) => {
  const g = gender === 'male' ? 'Indian male' : gender === 'kids' ? 'Indian child' : 'Indian female';
  if (age === 'kid') return `a charming young ${g} model (age 5-8)`;
  if (age === 'teen') return `a stylish ${g} teenage fashion model (age 16-18)`;
  if (age === 'senior') return `a graceful mature ${g} fashion model (age 45+)`;
  return `a professional ${g} fashion model`;
};

// Every scene prompt gets this tail — the whole point of Kontext here is that
// the garment pixels survive the edit.
const COLOR_TAIL =
  ' The garment shape, drape, exact original colour, dye, pattern and embroidery are 100% preserved — no hue shift, no tinting. Neutral 5500K daylight-balanced CRI-98 key light on the garment, photorealistic 8k fabric texture, realistic soft shadows.';

function parseFlags(argv) {
  const flags = { gender: 'female', age: 'adult' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--gender') flags.gender = argv[++i];
    else if (argv[i] === '--age') flags.age = argv[++i];
  }
  return flags;
}

async function fileToDataUrl(path) {
  const buf = await readFile(path);
  const ext = extname(path).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// ─── BFL FLUX Kontext: submit + poll (contract from studio-shoot.ts) ───────
async function fluxKontext(prompt, inputImageDataUrl, key) {
  const submitRes = await fetch(`${BFL_BASE}/flux-kontext-pro`, {
    method: 'POST',
    headers: { accept: 'application/json', 'x-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, input_image: inputImageDataUrl }),
  });
  const submit = await submitRes.json();
  if (!submitRes.ok) throw new Error(`BFL submit ${submitRes.status}: ${JSON.stringify(submit)}`);
  const pollingUrl = submit.polling_url;
  if (!pollingUrl) throw new Error(`BFL returned no polling_url: ${JSON.stringify(submit)}`);

  const deadline = Date.now() + 180_000;
  process.stdout.write('  polling');
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    process.stdout.write('.');
    const pr = await fetch(pollingUrl, { headers: { accept: 'application/json', 'x-key': key } });
    const poll = await pr.json();
    if (poll.status === 'Ready' && poll.result?.sample) {
      process.stdout.write(' ready\n');
      return poll.result.sample; // signed URL, ~10 min validity
    }
    if (['Error', 'Failed', 'Content Moderated'].includes(poll.status)) {
      throw new Error(`BFL ${poll.status}: ${poll.error ?? 'unknown'}`);
    }
  }
  throw new Error('BFL poll timed out (180s)');
}

// ─── Fal IDM-VTON: garment photo -> onto a specific model photo ────────────
async function falVton(modelDataUrl, garmentDataUrl, key) {
  const res = await fetch('https://queue.fal.run/fal-ai/idm-vton', {
    method: 'POST',
    headers: { authorization: `Key ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      human_image_url: modelDataUrl,
      garment_image_url: garmentDataUrl,
      description: 'Indian ethnic wear garment, exact original colour and embroidery preserved',
    }),
  });
  const submit = await res.json();
  if (!res.ok) throw new Error(`Fal submit ${res.status}: ${JSON.stringify(submit)}`);
  const statusUrl = submit.status_url;
  const responseUrl = submit.response_url;
  const deadline = Date.now() + 180_000;
  process.stdout.write('  vton polling');
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    process.stdout.write('.');
    const sr = await fetch(statusUrl, { headers: { authorization: `Key ${key}` } });
    const st = await sr.json();
    if (st.status === 'COMPLETED') {
      process.stdout.write(' done\n');
      const out = await (await fetch(responseUrl, { headers: { authorization: `Key ${key}` } })).json();
      return out.image?.url ?? out.images?.[0]?.url;
    }
    if (st.status === 'FAILED') throw new Error(`Fal VTON failed: ${JSON.stringify(st)}`);
  }
  throw new Error('Fal VTON timed out');
}

async function downloadTo(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const bflKey = process.env.BFL_API_KEY;
  if (!bflKey) throw new Error('Set BFL_API_KEY');
  await mkdir(OUT_DIR, { recursive: true });

  if (mode === 'kontext') {
    const [productPath, scene] = rest;
    const flags = parseFlags(rest);
    const prompt =
      (SCENES[scene] ?? SCENES.studio).replace('{MODEL}', MODEL_PHRASE(flags)) + COLOR_TAIL;
    console.log(`kontext: ${basename(productPath)} -> ${scene}\n  ${prompt.slice(0, 110)}...`);
    const sample = await fluxKontext(prompt, await fileToDataUrl(productPath), bflKey);
    const dest = join(OUT_DIR, `kontext-${basename(productPath, extname(productPath))}-${scene}.jpg`);
    await downloadTo(sample, dest);
    console.log(`  saved ${dest}`);
    return;
  }

  if (mode === 'vton') {
    const [productPath, modelPath, scene] = rest;
    const falKey = process.env.FAL_KEY;
    if (!falKey) throw new Error('vton mode needs FAL_KEY');
    console.log(`vton: ${basename(productPath)} onto ${basename(modelPath)} -> ${scene}`);
    // step 1 — garment onto the real model photo
    const worn = await falVton(
      await fileToDataUrl(modelPath),
      await fileToDataUrl(productPath),
      falKey,
    );
    const wornDest = join(OUT_DIR, `vton-worn-${basename(modelPath, extname(modelPath))}.jpg`);
    await downloadTo(worn, wornDest);
    console.log(`  step1 saved ${wornDest}`);
    // step 2 — Kontext swaps the background of the worn image to the scene
    const sceneClause = (SCENES[scene] ?? SCENES.studio)
      .replace('Place this exact outfit on {MODEL} ', '')
      .replace('{MODEL}', 'the model');
    const prompt = `Keep the model and the garment exactly as-is. ${sceneClause}` + COLOR_TAIL;
    const sample = await fluxKontext(prompt, await fileToDataUrl(wornDest), bflKey);
    const dest = join(
      OUT_DIR,
      `vton-${basename(productPath, extname(productPath))}-${basename(modelPath, extname(modelPath))}-${scene}.jpg`,
    );
    await downloadTo(sample, dest);
    console.log(`  saved ${dest}`);
    return;
  }

  console.error('modes: kontext <product.jpg> <scene> [--gender male/female/kids] [--age kid/teen/adult/senior]');
  console.error('       vton <product.jpg> <model.jpg> <scene>');
  console.error(`scenes: ${Object.keys(SCENES).join(', ')}`);
  process.exit(1);
}

main().catch((e) => {
  console.error('\nx', e.message);
  process.exit(1);
});
