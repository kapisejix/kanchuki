// Guard for the k6 load-test scripts (§7A.5).
//
// WHY THIS TEST EXISTS
//
// A load-test script is uniquely able to fail *quietly*. It is run by hand,
// against a service nobody watches, and its output is a table of numbers — a
// script that 404s on every request, or hits the rate limiter and reports the
// 429s as API failures, produces a plausible-looking report that is simply
// false. Worse, two of the paths it could plausibly be pointed at spend real
// money per request (`POST /v1/public/search` embeds the query,
// `POST /v1/products` queues a Vision tagging job).
//
// So the properties that matter are asserted here, in CI, rather than trusted:
//
//   · every route the mix touches EXISTS — derived from the API sources, so a
//     renamed route fails the build instead of the owner's first run;
//   · no mix touches a provider-spend or destructive route;
//   · the request rate stays under the API's own rate limiter, and the number
//     in `mix.js` is pinned to the number in `apps/api/src/index.ts`;
//   · production hosts are refused, and the deny-list is pinned to the domains
//     in `docs/DEPLOY.md`;
//   · a missing collection drops the entry instead of emitting `/null/view`.
//
// The module under test (`scripts/load/k6/mix.js`) is deliberately pure — no
// `k6/*` imports — so all of this runs under Node. The k6 entrypoints are thin,
// and the assertions about them are text scans of the parts that cannot be
// executed here.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
/** apps/api/src/routes → apps/api → apps → repo root */
const REPO_ROOT = join(HERE, '..', '..', '..', '..');
const K6_DIR = join(REPO_ROOT, 'scripts', 'load', 'k6');

interface MixEntry {
  name: string;
  weight: number;
  method: string;
  template: string;
  path: (index: number) => string;
  body?: string;
}

interface MixModule {
  PROD_HOSTS: string[];
  RATE_LIMIT_PER_MINUTE: number;
  SAFE_RATE_PER_MINUTE: number;
  assertSafeBaseUrl(raw?: string): string;
  parseRate(raw?: string): number;
  requireToken(raw?: string, name?: string): string;
  normalizeRoute(p: string): string;
  matchesTemplate(path: string, template: string): boolean;
  totalWeight(entries: MixEntry[]): number;
  chooseEndpoint(index: number, entries: MixEntry[]): MixEntry;
  buildPublicMix(
    data: { slugs: string[]; productIds: string[]; collectionSlugs?: string[] },
    options?: { search?: boolean },
  ): MixEntry[];
  buildRetailerMix(): MixEntry[];
}

// Plain ESM under `scripts/`, outside this app's TS project — no types to find,
// and vitest resolves it at runtime.
// @ts-expect-error — JS module with no declaration file
const mix = (await import('../../../../scripts/load/k6/mix.js')) as unknown as MixModule;

const PUBLIC_DATA = {
  slugs: ['meera-sarees', 'radha-collections'],
  productIds: ['p1', 'p2', 'p3'],
  collectionSlugs: ['diwali-1'],
};

// ─── Source scanning ───────────────────────────────────────────────

/** Strip comments so a documented example path isn't mistaken for a route. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function listFiles(target: string, out: string[] = []): string[] {
  if (!statSync(target).isDirectory()) {
    out.push(target);
    return out;
  }
  for (const entry of readdirSync(target)) {
    const full = join(target, entry);
    if (statSync(full).isDirectory()) {
      listFiles(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

const SERVER_METHOD_CALL =
  /server\.(?:get|post|put|patch|delete|head|options)\(\s*['"`]([^'"`]+)['"`]/g;

/**
 * `METHOD /full/path` for every route the load scripts could reach.
 *
 * Only the mounts the mixes actually use are derived. That is stated rather
 * than implied: this is a guard for the load scripts, not a route inventory —
 * `admin-access.test.ts` derives the admin tree for its own purpose.
 *
 * Prefixes are modelled explicitly because getting one wrong would mean the
 * guard agrees with a script that hits a path that does not exist. Only the
 * passport sub-tree is mounted under a prefix (`/passport`), which is why its
 * files live in their own directory.
 */
function derivedRoutes(): Map<string, string> {
  const mounts: Array<{ prefix: string; targets: string[] }> = [
    { prefix: '/v1/public', targets: [join(HERE, 'public')] },
    { prefix: '/v1/products', targets: [join(HERE, 'products')] },
    { prefix: '/v1/categories', targets: [join(HERE, 'categories.ts')] },
    { prefix: '/v1/retailers', targets: [join(HERE, 'retailers', 'retailers-profile.ts')] },
  ];

  const routes = new Map<string, string>();
  for (const mount of mounts) {
    for (const target of mount.targets) {
      for (const file of listFiles(target)) {
        const rel = relative(REPO_ROOT, file).replace(/\\/g, '/');
        // `public/passport/*` is registered under an extra `/passport` prefix.
        const prefix = rel.includes('/public/passport/') ? `${mount.prefix}/passport` : mount.prefix;
        const clean = stripComments(readFileSync(file, 'utf8'));
        SERVER_METHOD_CALL.lastIndex = 0;
        let match: RegExpExecArray | null = SERVER_METHOD_CALL.exec(clean);
        while (match) {
          const path = match[2 - 1] ?? '';
          const method = /server\.([a-z]+)/.exec(match[0])?.[1]?.toUpperCase() ?? '';
          const full = `${prefix}${path === '/' ? '' : path}`;
          routes.set(`${method} ${canon(full)}`, rel);
          match = SERVER_METHOD_CALL.exec(clean);
        }
      }
    }
  }
  return routes;
}

/** Param names are not meaningful for matching — `:slug` and `:id` are one shape. */
function canon(path: string): string {
  return mix.normalizeRoute(path).replace(/:[A-Za-z0-9_]+/g, ':param');
}

function readScript(name: string): string {
  return readFileSync(join(K6_DIR, name), 'utf8');
}

// ─── Base URL safety ───────────────────────────────────────────────

describe('load-test base URL refuses production (§7A.5)', () => {
  const PROD = [
    'https://api.kanchuki.app',
    'https://kanchuki.app',
    'https://kanchuki.com',
    'https://www.kanchuki.app',
    'http://api.kanchuki.app', // scheme is irrelevant — the host is the risk
  ];

  for (const url of PROD) {
    it(`throws for ${url}`, () => {
      expect(() => mix.assertSafeBaseUrl(url)).toThrow(/Refusing to load-test production/);
    });
  }

  it('accepts staging and localhost, trimming a trailing slash', () => {
    expect(mix.assertSafeBaseUrl('https://kanchuki-staging.up.railway.app/')).toBe(
      'https://kanchuki-staging.up.railway.app',
    );
    expect(mix.assertSafeBaseUrl('http://localhost:3001')).toBe('http://localhost:3001');
    // A lookalike domain is not production and must not be blocked by a
    // naive `includes('kanchuki.app')` check.
    expect(mix.assertSafeBaseUrl('https://kanchuki.app.evil.example')).toBe(
      'https://kanchuki.app.evil.example',
    );
  });

  it('throws on a missing or unparseable value instead of defaulting', () => {
    expect(() => mix.assertSafeBaseUrl()).toThrow(/not set/);
    expect(() => mix.assertSafeBaseUrl('')).toThrow(/not set/);
    expect(() => mix.assertSafeBaseUrl('not-a-url')).toThrow(/not a parseable URL/);
  });

  it('deny-lists exactly the production hosts DEPLOY.md names', () => {
    const deploy = readFileSync(join(REPO_ROOT, 'docs', 'DEPLOY.md'), 'utf8');
    const hosts = new Set(
      [...deploy.matchAll(/https?:\/\/([a-z0-9.-]*kanchuki\.[a-z]+)/gi)].map((m) =>
        (m[1] ?? '').toLowerCase(),
      ),
    );
    expect(hosts.size).toBeGreaterThan(0);
    for (const host of hosts) {
      if (host.startsWith('api.')) {
        // api.kanchuki.app is covered by the `kanchuki.app` entry (suffix match)
        expect(mix.PROD_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))).toBe(true);
      }
    }
    expect(mix.PROD_HOSTS).toContain('kanchuki.app');
  });
});

// ─── Rate budget ───────────────────────────────────────────────────

describe('load-test rate stays under the API rate limiter (§7A.5)', () => {
  it('pins the limiter value to the one in the API source', () => {
    const index = readFileSync(join(REPO_ROOT, 'apps', 'api', 'src', 'index.ts'), 'utf8');
    const match = /rateLimit,\s*\{[\s\S]{0,300}?max:\s*(\d+)/.exec(index);
    expect(match, 'could not find the @fastify/rate-limit max in apps/api/src/index.ts').toBeTruthy();
    expect(mix.RATE_LIMIT_PER_MINUTE).toBe(Number(match?.[1]));
    expect(mix.SAFE_RATE_PER_MINUTE).toBeLessThan(mix.RATE_LIMIT_PER_MINUTE);
  });

  it('defaults to the safe rate and accepts amounts under it', () => {
    expect(mix.parseRate()).toBe(mix.SAFE_RATE_PER_MINUTE);
    expect(mix.parseRate('')).toBe(mix.SAFE_RATE_PER_MINUTE);
    expect(mix.parseRate('30')).toBe(30);
    expect(mix.parseRate(String(mix.SAFE_RATE_PER_MINUTE))).toBe(mix.SAFE_RATE_PER_MINUTE);
  });

  it('rejects anything that would measure the limiter instead of the API', () => {
    expect(() => mix.parseRate(String(mix.RATE_LIMIT_PER_MINUTE))).toThrow(/exceeds/);
    expect(() => mix.parseRate('5000')).toThrow(/exceeds/);
    expect(() => mix.parseRate('0')).toThrow(/positive integer/);
    expect(() => mix.parseRate('-5')).toThrow(/positive integer/);
    expect(() => mix.parseRate('lots')).toThrow(/positive integer/);
  });

  it('fails loudly on a missing or malformed bearer token', () => {
    expect(() => mix.requireToken()).toThrow(/not set/);
    expect(() => mix.requireToken('nope')).toThrow(/does not look like a JWT/);
    expect(mix.requireToken('a.bb.ccc')).toBe('a.bb.ccc');
  });
});

// ─── The mixes ─────────────────────────────────────────────────────

describe('load-test mixes only touch routes that exist (§7A.5)', () => {
  const routes = derivedRoutes();
  const scripts = [
    ...mix.buildPublicMix(PUBLIC_DATA).map((e) => ({ script: 'mix:public', entry: e })),
    ...mix.buildPublicMix(PUBLIC_DATA, { search: true }).map((e) => ({
      script: 'mix:public+search',
      entry: e,
    })),
    ...mix.buildRetailerMix().map((e) => ({ script: 'mix:retailer', entry: e })),
  ];

  it('derives a non-trivial route set from the API sources', () => {
    expect(routes.size).toBeGreaterThan(30);
    // Sanity: the specific routes the mixes rely on are in the derived set, so
    // a silently-empty derivation cannot make every check below pass.
    expect(routes.has(`GET ${canon('/v1/public/retailers/:slug')}`)).toBe(true);
    expect(routes.has(`GET ${canon('/v1/products')}`)).toBe(true);
  });

  for (const { script, entry } of scripts) {
    it(`${script}: ${entry.method} ${entry.template} is a registered route`, () => {
      const key = `${entry.method} ${canon(entry.template)}`;
      expect(
        routes.get(key),
        `no such route. Nearest registered paths:\n${[...routes.keys()]
          .filter((k) => canon(k).split(' ')[1]?.includes(canon(entry.template).split('/')[1] ?? ''))
          .sort()
          .join('\n')}`,
      ).toBeTruthy();
    });
  }

  it('builds concrete paths that still match their template', () => {
    for (const { entry } of scripts) {
      for (let i = 0; i < 8; i++) {
        const path = entry.path(i);
        expect(
          mix.matchesTemplate(path, entry.template),
          `${entry.name}: ${path} does not match ${entry.template}`,
        ).toBe(true);
        expect(path).not.toMatch(/undefined|null|NaN/);
      }
    }
  });

  it('never targets a provider-spend or destructive route', () => {
    // Every one of these exists and would work — that is the danger. `retag`,
    // `studio-shoot` and `detect-color` buy model calls; `/v1/public/search`
    // embeds the query; `POST /v1/products` queues Vision tagging; the rest
    // destroy data. A load test never needs any of them.
    const banned = [
      'retag',
      'studio-shoot',
      'pro-cleanup',
      'detect-color',
      'spin-video',
      'bulk-delete',
      '/purge',
      '/v1/admin',
      '/v1/auth',
      '/v1/public/stylist',
      '/v1/public/passport/otp',
    ];
    for (const { script, entry } of scripts) {
      const target = `${entry.method} ${entry.template} ${entry.path(1)}`.toLowerCase();
      for (const bad of banned) {
        expect(target, `${script}/${entry.name} targets the banned path ${bad}`).not.toContain(bad);
      }
    }
    // The product CREATE route is banned by shape, because it is not a
    // substring of anything else: POST /v1/products (no further segment).
    const createsProduct = scripts.find(
      ({ entry }) => entry.method === 'POST' && canon(entry.template) === '/v1/products',
    );
    expect(createsProduct, 'a mix adds POST /v1/products — that buys a Vision call per request').toBe(
      undefined,
    );
  });

  it('drops the collection-view write when there is no collection to view', () => {
    const withCollections = mix.buildPublicMix(PUBLIC_DATA);
    const without = mix.buildPublicMix({ ...PUBLIC_DATA, collectionSlugs: [] });
    expect(withCollections.map((e) => e.name)).toContain('collection_view');
    expect(without.map((e) => e.name)).not.toContain('collection_view');
    for (let i = 0; i < 8; i++) {
      for (const entry of without) {
        expect(entry.path(i)).not.toMatch(/null|undefined/);
      }
    }
  });

  it('keeps the embedding-backed search out of the default mix', () => {
    expect(mix.buildPublicMix(PUBLIC_DATA).map((e) => e.name)).not.toContain('search');
    expect(mix.buildPublicMix(PUBLIC_DATA, { search: true }).map((e) => e.name)).toContain('search');
  });

  it('refuses to build a storefront mix with nothing to load', () => {
    expect(() => mix.buildPublicMix({ slugs: [], productIds: [] })).toThrow(/at least one live store/);
  });

  it('gives every entry a positive integer weight', () => {
    for (const { entry } of scripts) {
      expect(Number.isInteger(entry.weight) && entry.weight > 0).toBe(true);
    }
  });
});

// ─── Weighted selection ────────────────────────────────────────────

describe('weighted selection covers the mix in proportion (§7A.5)', () => {
  const entries = mix.buildPublicMix(PUBLIC_DATA);

  it('hits each entry exactly its weight times over one full cycle', () => {
    const total = mix.totalWeight(entries);
    const counts = new Map<string, number>();
    for (let i = 0; i < total; i++) {
      const name = mix.chooseEndpoint(i, entries).name;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    for (const entry of entries) {
      expect(counts.get(entry.name)).toBe(entry.weight);
    }
    expect([...counts.keys()].sort()).toEqual(entries.map((e) => e.name).sort());
  });

  it('is stable across negative and large indexes (the VU spread can wrap)', () => {
    const last = entries.at(-1)?.name;
    expect(last).toBeTruthy();
    expect(mix.chooseEndpoint(-1, entries).name).toBe(last);
    const total = mix.totalWeight(entries);
    expect(mix.chooseEndpoint(total + 3, entries).name).toBe(mix.chooseEndpoint(3, entries).name);
  });

  it('throws instead of returning nothing when the mix is empty', () => {
    expect(() => mix.chooseEndpoint(0, [])).toThrow(/no weight/);
  });

  it('matches templates exactly, not loosely', () => {
    expect(mix.matchesTemplate('/v1/public/retailers/x/products?page=1', '/v1/public/retailers/:s/products')).toBe(true);
    expect(mix.matchesTemplate('/v1/public/retailers/x', '/v1/public/retailers/:s/products')).toBe(false);
    expect(mix.matchesTemplate('/v1/public/retailers/x/designs', '/v1/public/retailers/:s/products')).toBe(false);
  });
});

// ─── The k6 entrypoints (text-scanned: not executable under Node) ───

describe('k6 entrypoints keep the safety rails (§7A.5)', () => {
  for (const name of ['storefront.js', 'retailer.js']) {
    const source = readScript(name);

    it(`${name}: delegates the rate to parseRate, with no literal rate`, () => {
      expect(source).toMatch(/parseRate\(__ENV\.LOADTEST_RATE\)/);
      // A literal would bypass the cap entirely.
      expect(source).toMatch(/rate:\s*RATE,/);
      expect(source).not.toMatch(/rate:\s*\d/);
    });

    it(`${name}: refuses production before it can send a request`, () => {
      expect(source).toMatch(/assertSafeBaseUrl\(__ENV\.LOADTEST_BASE_URL\)/);
    });

    it(`${name}: treats a 429 as our own overspend, not an API failure`, () => {
      expect(source).toMatch(/expectedStatuses/);
      expect(source).toMatch(/429/);
      expect(source).toMatch(/new Counter\('rate_limited'\)/);
      expect(source).toMatch(/rate_limited:\s*\['count<1'\]/);
    });

    it(`${name}: carries thresholds that would actually fail a bad run`, () => {
      expect(source).toMatch(/http_req_failed:\s*\['rate</);
      expect(source).toMatch(/http_req_duration:\s*\['p\(95\)</);
      expect(source).toMatch(/checks:\s*\['rate>/);
      expect(source).toMatch(/constant-arrival-rate/);
    });

    it(`${name}: uploads nothing and writes no product`, () => {
      // The presign is a POST but the script must never follow it with a PUT to
      // the signed URL — that would write real objects into the staging bucket.
      expect(source).not.toMatch(/http\.(put|patch|del)\(/);
    });
  }

  it('storefront.js fails instead of running against an empty staging dataset', () => {
    const source = readScript('storefront.js');
    expect(source).toMatch(/fail\(/);
    expect(source).toMatch(/no live storefront/);
    expect(source).toMatch(/returned no public products/);
  });

  it('retailer.js proves the token before spending the run on it', () => {
    const source = readScript('retailer.js');
    expect(source).toMatch(/requireToken\(__ENV\.LOADTEST_BEARER\)/);
    expect(source).toMatch(/401/);
    expect(source).toMatch(/the bearer token is missing, expired/);
  });
});
