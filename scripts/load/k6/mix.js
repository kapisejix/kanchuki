// ─── Load-test scenario definition (§7A.5) ─────────────────────────
//
// WHY THIS FILE IS SEPARATE FROM THE k6 ENTRYPOINTS
//
// Everything in here is a pure function over plain data — no `k6/*` imports,
// no `__ENV`, no I/O. That is deliberate: the same module is imported by the
// two k6 entrypoints AND by `apps/api/src/routes/load-test.test.ts`, which runs
// under Node/vitest. So the parts that can actually be wrong in a load test
// (which route, at what rate, with what data) are unit-tested in CI instead of
// only being discovered by the owner on the first run.
//
// The k6 scripts themselves are thin: k6 collects a store slug + product ids in
// `setup()`, then asks this module what to hit and how often.
//
// Why a route is described as `template` + `path` and not just a URL string:
// `template` must be a route that actually exists (`/v1/public/retailers/:slug`),
// and `path` is that template with real ids substituted. The guard test asserts
// the template exists in the route table DERIVED FROM THE API SOURCES, and that
// the built path still matches the template — so a renamed route, or a builder
// that forgets to substitute and emits `/products/undefined`, both fail CI.

// ─── Safety: never point this at production ────────────────────────

/** Production hosts, from `docs/DEPLOY.md` (`api.kanchuki.app` + `kanchuki.app`). */
export const PROD_HOSTS = ['kanchuki.app', 'kanchuki.com'];

/**
 * Normalise `LOADTEST_BASE_URL` and refuse production.
 *
 * There is deliberately **no override flag**. A load test's whole purpose is to
 * produce numbers that do not matter if the target is production, and an
 * env-var escape hatch is one typo away from a traffic spike against live
 * retailers. If someone genuinely needs to load-test prod, that is a decision to
 * take in code review, not by exporting a variable.
 */
export function assertSafeBaseUrl(raw) {
  const base = String(raw ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!base) {
    throw new Error(
      'LOADTEST_BASE_URL is not set. Refusing to guess — pass the staging API URL, e.g. ' +
        'LOADTEST_BASE_URL=https://<staging-service>.up.railway.app',
    );
  }
  let host;
  try {
    host = new URL(base).hostname.toLowerCase();
  } catch {
    throw new Error(`LOADTEST_BASE_URL is not a parseable URL: ${base}`);
  }
  const hit = PROD_HOSTS.find((h) => host === h || host.endsWith(`.${h}`));
  if (hit) {
    throw new Error(
      `Refusing to load-test production (${host} matches ${hit}). Point LOADTEST_BASE_URL at a ` +
        'staging service. There is no override for this on purpose.',
    );
  }
  return base;
}

// ─── Safety: the global rate limiter is the ceiling on a single-IP run ──

/**
 * `apps/api/src/index.ts` registers `@fastify/rate-limit` globally at
 * `max: 200 / 1 minute`, keyed on `request.ip` and **not** configurable by env.
 * Every scenario in these scripts shares that one budget, because one load
 * generator is one IP. Exceeding it produces 429s that look like API failures.
 */
export const RATE_LIMIT_PER_MINUTE = 200;

/** What the scripts are allowed to ask for, leaving headroom under the limiter. */
export const SAFE_RATE_PER_MINUTE = 180;

/** Parse + bound `LOADTEST_RATE` (requests per minute, all endpoints combined). */
export function parseRate(raw) {
  if (raw === undefined || raw === null || raw === '') return SAFE_RATE_PER_MINUTE;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`LOADTEST_RATE must be a positive integer, got: ${raw}`);
  }
  if (n > SAFE_RATE_PER_MINUTE) {
    throw new Error(
      `LOADTEST_RATE=${n} exceeds the ${SAFE_RATE_PER_MINUTE}/min this script allows itself. ` +
        `The API rate-limits at ${RATE_LIMIT_PER_MINUTE}/min PER IP, and one generator is one IP, ` +
        'so a higher rate measures the limiter, not the API. Raise the limiter on staging (a code ' +
        'change) or run generators from several IPs.',
    );
  }
  return n;
}

/** Fail loudly rather than issuing `Authorization: Bearer undefined`. */
export function requireToken(raw, name = 'LOADTEST_BEARER') {
  const token = String(raw ?? '').trim();
  if (!token) {
    throw new Error(
      `${name} is not set. The authenticated mix needs a real Supabase access token — see ` +
        'docs/references/guides/load-testing.md §"Getting the bearer token".',
    );
  }
  if (token.split('.').length !== 3) {
    throw new Error(`${name} does not look like a JWT (expected three dot-separated parts).`);
  }
  return token;
}

// ─── Route matching ────────────────────────────────────────────────

/** `/v1/products/` and `/v1/products` are the same route (find-my-way). */
export function normalizeRoute(p) {
  const clean = String(p).split('?')[0].split('#')[0];
  const parts = clean.split('/').filter(Boolean);
  return `/${parts.join('/')}`;
}

/** True when a concrete path still fits the route template it claims. */
export function matchesTemplate(path, template) {
  const actual = normalizeRoute(path).split('/').filter(Boolean);
  const expected = normalizeRoute(template).split('/').filter(Boolean);
  if (actual.length !== expected.length) return false;
  return expected.every((seg, i) =>
    seg.startsWith(':') ? actual[i].length > 0 : seg === actual[i],
  );
}

// ─── Weighted selection (deterministic, so it is testable) ─────────

export function totalWeight(entries) {
  return entries.reduce((sum, e) => sum + e.weight, 0);
}

/**
 * Pick the entry for iteration `index` by cumulative weight.
 *
 * Deterministic on purpose: over `index = 0 .. totalWeight-1` the mix is hit
 * exactly in proportion to its weights, so a 3-minute run covers the same
 * distribution as a 30-minute one. `k6` passes `__VU * 31 + __ITER`, which
 * spreads concurrent VUs across the table instead of having them all start at
 * entry 0.
 */
export function chooseEndpoint(index, entries) {
  const total = totalWeight(entries);
  if (total <= 0) throw new Error('load mix has no weight — every entry was filtered out');
  let n = ((index % total) + total) % total;
  for (const entry of entries) {
    if (n < entry.weight) return entry;
    n -= entry.weight;
  }
  return entries[entries.length - 1];
}

// ─── The public (anonymous) mix ────────────────────────────────────

/**
 * Read-heavy storefront mix: what a customer does when a collection link is
 * opened. Weights are the share of iterations, and they were chosen from the
 * customer web app's own call pattern — the product grid is the heaviest single
 * query (products + photos + pagination), the product sheet is fetched on
 * demand, and the directory is one cached call.
 *
 * Two entries are conditional, and both conditions matter:
 *   · the `view` write is dropped when the store has no ACTIVE collection,
 *     because otherwise the builder would emit `/collections/null/view`;
 *   · `search` is opt-in (`LOADTEST_SEARCH=1`) because
 *     `POST /v1/public/search` calls `embedSearchQuery()` on every request —
 *     an OpenAI embeddings call with no cache in front of it. Search is
 *     therefore the one read path that bills per request and whose p95 is
 *     dominated by a third-party call, so it is never in the default mix.
 */
export function buildPublicMix(data, { search = false } = {}) {
  const slugs = data.slugs ?? [];
  const productIds = data.productIds ?? [];
  const collectionSlugs = data.collectionSlugs ?? [];
  if (slugs.length === 0 || productIds.length === 0) {
    throw new Error(
      'public mix needs at least one live store slug and one product id — ' +
        'a storefront load test with no storefront measures nothing',
    );
  }
  const slug = (i) => slugs[i % slugs.length];
  const productId = (i) => productIds[i % productIds.length];

  const entries = [
    {
      name: 'storefront',
      weight: 28,
      method: 'GET',
      template: '/v1/public/retailers/:slug',
      path: (i) => `/v1/public/retailers/${slug(i)}`,
    },
    {
      name: 'product_grid',
      weight: 20,
      method: 'GET',
      template: '/v1/public/retailers/:slug/products',
      path: (i) => `/v1/public/retailers/${slug(i)}/products?pageSize=24&page=1`,
    },
    {
      name: 'categories',
      weight: 12,
      method: 'GET',
      template: '/v1/public/retailers/:slug/categories',
      path: (i) => `/v1/public/retailers/${slug(i)}/categories`,
    },
    {
      name: 'product_detail',
      weight: 15,
      method: 'GET',
      template: '/v1/public/products/:productId',
      path: (i) => `/v1/public/products/${productId(i)}`,
    },
    {
      name: 'related',
      weight: 10,
      method: 'GET',
      template: '/v1/public/products/:productId/related',
      path: (i) => `/v1/public/products/${productId(i)}/related`,
    },
    {
      name: 'directory',
      weight: 8,
      method: 'GET',
      template: '/v1/public/stores',
      path: () => '/v1/public/stores?pageSize=12',
    },
  ];

  if (collectionSlugs.length > 0) {
    const collection = (i) => collectionSlugs[i % collectionSlugs.length];
    entries.push({
      name: 'collection_view',
      weight: 7,
      method: 'POST',
      template: '/v1/public/collections/:slug/view',
      path: (i) => `/v1/public/collections/${collection(i)}/view`,
      // The route parses `{ viewer_token? }`; an absent body is a 400, not a no-op.
      body: '{}',
    });
  }

  if (search) {
    entries.push({
      name: 'search',
      weight: 8,
      method: 'POST',
      template: '/v1/public/search',
      path: () => '/v1/public/search',
      body: JSON.stringify({ query: 'cotton pink suit under 2000', limit: 20 }),
    });
  }

  return entries;
}

// ─── The authenticated (retailer) mix ──────────────────────────────

/**
 * What the retailer app does on a cold start plus one photo upload.
 *
 * `POST /v1/products/upload-url` is the API's *entire* involvement in a photo
 * upload — the presign exists precisely so the bytes go straight from the phone
 * to R2 and never through the API. So "write-heavy photo uploads" in
 * `docs/SCALING.md` §5 is, on the API side, this endpoint plus the product
 * create. The create is deliberately **not** scripted: `POST /v1/products`
 * unconditionally calls `addTaggingJob()`, so every request would buy a Vision
 * model call. A load test must not spend the owner's money by default; the
 * runbook records how to measure that path deliberately if it is ever wanted.
 */
export function buildRetailerMix() {
  return [
    {
      name: 'retailer_me',
      weight: 25,
      method: 'GET',
      template: '/v1/retailers/me',
      path: () => '/v1/retailers/me',
    },
    {
      name: 'retailer_categories',
      weight: 20,
      method: 'GET',
      template: '/v1/categories',
      path: () => '/v1/categories',
    },
    {
      name: 'retailer_products',
      weight: 35,
      method: 'GET',
      template: '/v1/products',
      path: () => '/v1/products?pageSize=24&page=1',
    },
    {
      name: 'retailer_upload_presign',
      weight: 20,
      method: 'POST',
      template: '/v1/products/upload-url',
      path: () => '/v1/products/upload-url',
      // Presigns only — no object is written to R2 unless we also PUT to the
      // signed URL, which this script never does.
      body: JSON.stringify({
        filename: 'loadtest.jpg',
        content_type: 'image/jpeg',
        size_bytes: 240000,
      }),
    },
  ];
}
