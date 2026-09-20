#!/usr/bin/env node
// Save an admin model-bench run next to the cost comparison page.
//
//   node scripts/save-bench.mjs ~/Downloads/bench-run-2026-09-19T10-00-00-000Z.json
//
// The admin test page (/admin/photo-cleanup-test → AI Studio Shoot → "Export
// results") downloads a JSON of every engine it ran. Fal / BFL / R2 result URLs
// expire or live on a server that is not this repo, so this script:
//   1. downloads each output (and the input photo) into
//        docs/tasks/effect-photos/preview/
//   2. appends the rows to docs/tasks/bench-results.json (kept as the source)
//   3. rewrites docs/tasks/bench-results.js = `window.BENCH_RESULTS = [...]`
//
// docs/tasks/AI Cost Comparison.html loads bench-results.js with a plain <script>
// tag — fetch() of a .json does not work from a file:// page, a script tag does.
// Re-running with the same file is safe: rows are keyed on ran_at + engine.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tasks = join(root, 'docs', 'tasks');
const previewDir = join(tasks, 'effect-photos', 'preview');
const dataJson = join(tasks, 'bench-results.json');
const dataJs = join(tasks, 'bench-results.js');

const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/save-bench.mjs <bench-run-*.json>');
  process.exit(1);
}

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

const rows = JSON.parse(readFileSync(input, 'utf8'));
if (!Array.isArray(rows)) throw new Error('expected a JSON array exported by the bench page');

mkdirSync(previewDir, { recursive: true });
const saved = existsSync(dataJson) ? JSON.parse(readFileSync(dataJson, 'utf8')) : [];
const seen = new Set(saved.map((r) => `${r.ran_at}|${r.engine}`));

let added = 0;
const inputFiles = new Map(); // one copy of the input photo per batch
for (const row of rows) {
  const key = `${row.ran_at}|${row.engine}`;
  if (seen.has(key)) continue;

  const stamp = String(row.ran_at).replace(/[:.]/g, '-');
  const base = `${stamp}-${slug(row.engine)}-${slug(row.scene)}`;
  let image = null;
  let imageError = null;
  if (row.result_url) {
    try {
      await download(row.result_url, join(previewDir, `${base}.jpg`));
      image = `effect-photos/preview/${base}.jpg`;
    } catch (err) {
      imageError = err instanceof Error ? err.message : String(err);
    }
  }

  let inputImage = inputFiles.get(row.product_url) ?? null;
  if (!inputImage && row.product_url) {
    const name = `${stamp}-input.jpg`;
    try {
      await download(row.product_url, join(previewDir, name));
      inputImage = `effect-photos/preview/${name}`;
      inputFiles.set(row.product_url, inputImage);
    } catch {
      // the output is what matters; a missing input thumbnail is not fatal
    }
  }

  saved.push({
    ran_at: row.ran_at,
    engine: row.engine,
    model: row.model,
    version: row.version,
    provider: row.provider,
    scene: row.scene,
    gender: row.gender,
    age: row.age,
    pose: row.pose,
    photography: row.photography,
    usd: row.usd,
    inr: row.inr,
    credits: row.credits,
    ms: row.ms,
    image,
    input: inputImage,
    error: row.error ?? imageError,
    prompt: row.prompt,
  });
  seen.add(key);
  added += 1;
  console.log(`${image ? 'saved ' : 'no image'} ${row.engine} → ${image ?? row.error ?? imageError}`);
}

writeFileSync(dataJson, `${JSON.stringify(saved, null, 2)}\n`);
writeFileSync(dataJs, `window.BENCH_RESULTS = ${JSON.stringify(saved, null, 2)};\n`);
console.log(`${added} new row(s); ${saved.length} total → docs/tasks/bench-results.js`);
