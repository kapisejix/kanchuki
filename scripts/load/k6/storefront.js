// ─── k6 — public storefront mix (§7A.5) ────────────────────────────
//
// Anonymous, read-heavy: what a customer does when someone opens a collection
// link. Safe to run against staging without writing anything meaningful — the
// only write is the collection `view` counter, which is what the real page does.
//
//   k6 run \
//     -e LOADTEST_BASE_URL=https://<staging-api> \
//     scripts/load/k6/storefront.js
//
// Full runbook: docs/references/guides/load-testing.md
//
// WHY THE RATE IS CAPPED (read this before raising it)
// ---------------------------------------------------
// The API registers `@fastify/rate-limit` globally at 200 requests/minute keyed
// on client IP (apps/api/src/index.ts). One load generator is one IP, so every
// endpoint below shares a single 200/min budget. Asking for more does not test
// the API harder; it tests the limiter, and the 429s would be read as API
// failures. The cap is enforced in mix.js (`parseRate`) rather than documented
// and hoped for.

import { check, fail } from 'k6';
import { Counter } from 'k6/metrics';
import http from 'k6/http';
import { assertSafeBaseUrl, buildPublicMix, chooseEndpoint, parseRate } from './mix.js';

const BASE_URL = assertSafeBaseUrl(__ENV.LOADTEST_BASE_URL);
const RATE = parseRate(__ENV.LOADTEST_RATE);
const DURATION = __ENV.LOADTEST_DURATION || '3m';
/** Opt-in: adds an OpenAI embedding call to every search request (see mix.js). */
const SEARCH = __ENV.LOADTEST_SEARCH === '1';

// A 429 means we overran our own budget — it must not be counted as a failure,
// because then a limiter-bound run looks like a broken API. `rate_limited`
// counts them instead, and its threshold fails the run when it is non-zero.
// Needs k6 v0.50+; on an older binary the counter still works and 429s will
// already have failed the run, which is the correct (if noisier) outcome.
const EXPECTED =
  typeof http.expectedStatuses === 'function'
    ? http.expectedStatuses({ min: 200, max: 399 }, 429)
    : undefined;

const rateLimited = new Counter('rate_limited');

export const options = {
  scenarios: {
    browse: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1m',
      duration: DURATION,
      preAllocatedVUs: 10,
      maxVUs: 50,
      gracefulStop: '10s',
    },
  },
  thresholds: {
    // 4xx/5xx. 429 is excluded above and tracked separately.
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    checks: ['rate>0.99'],
    // Non-zero means the run measured the rate limiter, not the storefront.
    rate_limited: ['count<1'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

/**
 * Resolve real ids from the staging data, so the mix hits routes that exist with
 * slugs that exist. Returns plain JSON — k6 serialises setup()'s return value
 * into every VU, so it must not contain functions.
 *
 * If staging has no live storefront, this FAILS instead of running a load test
 * that 404s on every iteration and reports a clean `http_req_failed` of zero
 * because there was nothing to fail.
 */
export function setup() {
  const storesRes = http.get(`${BASE_URL}/v1/public/stores?pageSize=24`, {
    tags: { endpoint: 'setup' },
  });
  if (storesRes.status !== 200) {
    fail(`setup: GET /v1/public/stores returned ${storesRes.status} — is ${BASE_URL} the staging API?`);
  }
  let stores = [];
  try {
    stores = storesRes.json('data.stores') ?? [];
  } catch {
    fail('setup: /v1/public/stores did not return JSON — wrong base URL?');
  }
  if (stores.length === 0) {
    fail(
      'setup: staging has no live storefront (needs a retailer with a public_slug and at least ' +
        'one live product). Seed one before load testing — an empty mix measures nothing.',
    );
  }

  // A handful of slugs, not one: a single slug would measure the Redis cache for
  // one key, which says nothing about the storefront under real traffic.
  const slugs = stores.slice(0, 5).map((s) => s.public_slug);

  const productsRes = http.get(`${BASE_URL}/v1/public/retailers/${slugs[0]}/products?pageSize=24`, {
    tags: { endpoint: 'setup' },
  });
  const products = productsRes.status === 200 ? (productsRes.json('data.products') ?? []) : [];
  const productIds = products.map((p) => p.id).filter(Boolean);
  if (productIds.length === 0) {
    fail(`setup: ${slugs[0]} returned no public products — the product-grid and detail routes would 404.`);
  }

  const collectionsRes = http.get(`${BASE_URL}/v1/public/retailers/${slugs[0]}/collections`, {
    tags: { endpoint: 'setup' },
  });
  const collections = collectionsRes.status === 200 ? (collectionsRes.json('data') ?? []) : [];
  const collectionSlugs = (collections ?? []).map((c) => c.slug).filter(Boolean);

  console.log(
    `setup: ${slugs.length} store(s), ${productIds.length} product(s), ` +
      `${collectionSlugs.length} collection(s); rate=${RATE}/min, duration=${DURATION}, search=${SEARCH}`,
  );

  return { slugs, productIds, collectionSlugs };
}

export default function (data) {
  // Deterministic spread across VUs: index 0..N walks the weight table exactly.
  const index = __VU * 31 + __ITER;
  const mix = buildPublicMix(data, { search: SEARCH });
  const entry = chooseEndpoint(index, mix);
  const url = `${BASE_URL}${entry.path(index)}`;

  const params = {
    tags: { endpoint: entry.name },
    ...(EXPECTED ? { responseCallback: EXPECTED } : {}),
  };

  const res =
    entry.method === 'POST'
      ? http.post(url, entry.body ?? '{}', {
          ...params,
          headers: { 'Content-Type': 'application/json' },
        })
      : http.get(url, params);

  if (res.status === 429) rateLimited.add(1, { endpoint: entry.name });

  check(res, {
    // A 404 means the route moved or the id is stale — the failure this script
    // is most likely to produce and the least likely to be noticed.
    'route exists (not 404)': (r) => r.status !== 404,
    'no server error': (r) => r.status < 500,
    'usable response (2xx/3xx, or the limiter)': (r) =>
      (r.status >= 200 && r.status < 400) || r.status === 429,
  });
}
