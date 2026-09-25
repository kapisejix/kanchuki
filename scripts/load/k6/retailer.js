// ─── k6 — authenticated retailer mix (§7A.5) ───────────────────────
//
// What the retailer app does on a cold start, plus the write-side half of a
// photo upload. Needs a real Supabase access token (see the runbook §"Getting
// the bearer token"); without one this script fails immediately rather than
// firing a hundred anonymous 401s and reporting them as API errors.
//
//   k6 run \
//     -e LOADTEST_BASE_URL=https://<staging-api> \
//     -e LOADTEST_BEARER=<access_token> \
//     scripts/load/k6/retailer.js
//
// WHAT IT DELIBERATELY DOES NOT DO
// --------------------------------
// It never creates a product. `POST /v1/products` unconditionally calls
// `addTaggingJob()`, so every request would buy a Vision model call — a load
// test that bills the owner per iteration is not a load test. The presign call
// below is the API's whole involvement in a photo upload (the bytes go straight
// to R2), and it exercises the same auth + validation + R2-signing path at zero
// external cost. `docs/references/guides/load-testing.md` records how to measure
// the create path on purpose, if that is ever the question.
//
// This script shares the same 200/min-per-IP budget as storefront.js — do NOT
// run the two against the same host at the same time.

import { check, fail } from 'k6';
import { Counter } from 'k6/metrics';
import http from 'k6/http';
import { assertSafeBaseUrl, buildRetailerMix, chooseEndpoint, parseRate, requireToken } from './mix.js';

const BASE_URL = assertSafeBaseUrl(__ENV.LOADTEST_BASE_URL);
const RATE = parseRate(__ENV.LOADTEST_RATE);
const DURATION = __ENV.LOADTEST_DURATION || '3m';
const TOKEN = requireToken(__ENV.LOADTEST_BEARER);

const EXPECTED =
  typeof http.expectedStatuses === 'function'
    ? http.expectedStatuses({ min: 200, max: 399 }, 429)
    : undefined;

const rateLimited = new Counter('rate_limited');

export const options = {
  scenarios: {
    retailer: {
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
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    checks: ['rate>0.99'],
    rate_limited: ['count<1'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  // Prove the token works before spending the run on it. GET /v1/retailers/me is
  // the cheapest authenticated route there is.
  const me = http.get(`${BASE_URL}/v1/retailers/me`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    tags: { endpoint: 'setup' },
  });
  if (me.status === 401 || me.status === 403) {
    fail(
      `setup: GET /v1/retailers/me returned ${me.status} — the bearer token is missing, expired or ` +
        'not a staging retailer. See docs/references/guides/load-testing.md.',
    );
  }
  if (me.status !== 200) {
    fail(`setup: GET /v1/retailers/me returned ${me.status} — is ${BASE_URL} the staging API?`);
  }
  return {};
}

export default function () {
  const index = __VU * 31 + __ITER;
  const entry = chooseEndpoint(index, buildRetailerMix());
  const url = `${BASE_URL}${entry.path(index)}`;

  const params = {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(entry.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    tags: { endpoint: entry.name },
    ...(EXPECTED ? { responseCallback: EXPECTED } : {}),
  };

  const res =
    entry.method === 'POST'
      ? http.post(url, entry.body ?? '{}', params)
      : http.get(url, params);

  if (res.status === 429) rateLimited.add(1, { endpoint: entry.name });

  check(res, {
    'route exists (not 404)': (r) => r.status !== 404,
    'authenticated (not 401/403)': (r) => r.status !== 401 && r.status !== 403,
    'no server error': (r) => r.status < 500,
    'usable response (2xx/3xx, or the limiter)': (r) =>
      (r.status >= 200 && r.status < 400) || r.status === 429,
  });
}
