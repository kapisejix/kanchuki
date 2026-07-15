/**
 * E2E test that hits the REAL /v1/catalog-import/* routes (unlike
 * catalog-import-e2e.ts, which hand-rolls Claude detection and uses
 * /v1/products instead). Exercises catalog-import.ts end to end:
 *   upload-url -> detect-items (detectCropAndTag) -> bulk-create-products
 *
 * Usage:
 *   npx tsx scripts/catalog-import-route-e2e.ts
 *   npx tsx scripts/catalog-import-route-e2e.ts --api http://localhost:3001 --image catalog-grid-mixed.jpg
 */

import { readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArg(key: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${key}`);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1]!;
  return fallback;
}

const API = parseArg('api', 'http://localhost:3001');
const DEMO_IMAGE = parseArg('image', 'sample-suit.jpg');
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = resolve(__dirname, 'demo');

let TOKEN = '';

async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json as T;
}

async function main() {
  console.log(`API: ${API}  Image: ${DEMO_IMAGE}\n`);

  console.log('[1/5] auth (test retailer +919999999999 / otp 123456)');
  const auth = await api<{ data: { access_token: string } }>('/v1/auth/otp/verify', {
    method: 'POST',
    body: { phone: '+919999999999', otp: '123456' },
  });
  TOKEN = auth.data.access_token;
  console.log('  ok, token acquired');

  console.log('\n[2/5] get upload url + PUT image to R2');
  const file = readFileSync(resolve(DEMO_DIR, DEMO_IMAGE));
  const ext = extname(DEMO_IMAGE).toLowerCase();
  const contentType = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';
  const up = await api<{ data: { upload_url: string; public_url: string } }>(
    '/v1/catalog-import/upload-url',
    {
      method: 'POST',
      auth: true,
      body: { filename: DEMO_IMAGE, content_type: contentType, size_bytes: file.length },
    },
  );
  const putRes = await fetch(up.data.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!putRes.ok) throw new Error(`R2 PUT failed: ${putRes.status}`);
  console.log('  ok,', up.data.public_url);

  console.log('\n[3/5] POST /v1/catalog-import/detect-items (real detectCropAndTag)');
  const detect = await api<{
    data: { total_items: number; items: Array<Record<string, unknown>> };
  }>('/v1/catalog-import/detect-items', {
    method: 'POST',
    auth: true,
    body: { image_url: up.data.public_url },
  });
  console.log(`  detected ${detect.data.total_items} item(s)`);
  for (const item of detect.data.items) {
    const tags = item['tags'] as Record<string, unknown>;
    console.log(
      `  - ${item['description']} | category=${tags['category']} color=${tags['primary_color']} neck_style=${JSON.stringify(tags['neck_style'])}`,
    );
  }
  if (detect.data.total_items === 0) throw new Error('No items detected — nothing to bulk-create');

  console.log('\n[4/5] POST /v1/catalog-import/bulk-create-products');
  const bulkItems = detect.data.items.map((item) => {
    const tags = item['tags'] as Record<string, unknown>;
    return {
      cropped_r2_key: item['cropped_r2_key'],
      cropped_url: item['cropped_url'],
      category: tags['category'],
      primary_color: tags['primary_color'],
      fabric_estimate: tags['fabric_estimate'],
      pattern: tags['pattern'],
      occasions: tags['occasions'],
      search_tags: tags['search_tags'],
      price_min: 199900,
      price_max: 299900,
    };
  });
  const bulk = await api<{ data: { total_created: number; products: Array<{ id: string }> } }>(
    '/v1/catalog-import/bulk-create-products',
    { method: 'POST', auth: true, body: { items: bulkItems } },
  );
  console.log(
    `  created ${bulk.data.total_created} product(s):`,
    bulk.data.products.map((p) => p.id).join(', '),
  );

  console.log('\n[5/5] verify products retrievable via /v1/products/:id');
  for (const p of bulk.data.products) {
    const got = await api<{ data: { id: string; category: string | null } }>(
      `/v1/products/${p.id}`,
      { auth: true },
    );
    console.log(`  - ${got.data.id}: category=${got.data.category}`);
  }

  console.log('\nALL STEPS PASSED');
}

main().catch((err) => {
  console.error('\nFAILED:', err);
  process.exit(1);
});
