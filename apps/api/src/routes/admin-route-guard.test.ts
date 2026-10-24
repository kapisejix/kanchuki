// Every route under /v1/admin must refuse a request with no admin credentials.
//
// The guard is installed per plugin (`server.addHook('preHandler', adminAuthPreHandler)`),
// and Fastify hooks do not cross sibling plugin boundaries: `adminSettingsRoutes` once
// assumed the hook applied to it and was fully unauthenticated (admin-auth.ts:133). A new
// admin module that forgets the hook fails open (the RC-034 shape), and nothing else
// enumerated the routes. This boots both /v1/admin plugins the way index.ts does, collects
// every registered route with `onRoute` (derived, not a hand-kept list: RC-043), and sends
// each one with no x-admin-key.
import cookie from '@fastify/cookie';
import Fastify, { type RouteOptions } from 'fastify';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { adminSettingsRoutes } from './admin-settings.js';
import { adminRoutes } from './admin.js';

// Import-chain stand-ins only; no request below gets past the auth hook.
vi.mock('@kanchuki/db', () => ({
  encryptSecret: (plaintext: string) => `enc:${plaintext}`,
  maskSecret: (plaintext: string) => `masked:${plaintext.slice(-4)}`,
  invalidateSecret: vi.fn(),
  getSecret: vi.fn(),
  getPurgePrisma: () => ({
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $transaction: (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : Promise.resolve(),
    retailer: { findUnique: vi.fn() },
  }),
  prisma: {},
  Prisma: {},
}));

vi.mock('@kanchuki/ai', () => ({
  getUploadPresignedUrl: vi.fn(),
  publicUrl: vi.fn(),
}));

vi.mock('@kanchuki/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kanchuki/shared')>()),
  INTEGRATION_KEYS: [],
  R2_PATHS: {},
  STUDIO_ENGINES: ['bfl_kontext', 'vton_kontext'],
  PRODUCT_DEMOGRAPHICS: ['womens', 'mens'],
}));

type ParamSchema = { properties?: Record<string, { enum?: string[] }> };
type Collected = { method: string; url: string; params?: ParamSchema };

const routes: Collected[] = [];
let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  app = Fastify();
  app.setErrorHandler(errorHandler);
  app.addHook('onRoute', (route: RouteOptions) => {
    for (const method of [route.method].flat()) {
      if (method === 'HEAD') continue;
      const params = (route.schema as { params?: ParamSchema } | undefined)?.params;
      routes.push({ method, url: route.url, ...(params ? { params } : {}) });
    }
  });
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(adminRoutes, { prefix: '/v1/admin' });
  await app.register(adminSettingsRoutes, { prefix: '/v1/admin' });
  await app.ready();
}, 30_000);

// Concrete URL for a route pattern: `:id` -> `x`, a trailing `*` -> `x`. A param with an
// enum in the route's own schema takes its first value: params are validated BEFORE the
// auth hook, so an invalid placeholder would 422 and hide whether the route is guarded.
const concrete = ({ url, params }: Collected) =>
  url
    .replace(
      /:([A-Za-z0-9_]+)/g,
      (_m, name: string) => params?.properties?.[name]?.enum?.[0] ?? 'x',
    )
    .replace(/\*/g, 'x');

describe('/v1/admin route guard', () => {
  it('collects a realistic number of routes (not vacuous)', () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it('every route except POST /login rejects a request with no admin key', async () => {
    const open: string[] = [];
    for (const r of routes) {
      if (r.method === 'POST' && r.url === '/v1/admin/login') continue;
      const res = await app.inject({ method: r.method as 'GET', url: concrete(r) });
      if (res.statusCode !== 403) open.push(`${r.method} ${r.url} -> ${res.statusCode}`);
    }
    expect(open).toEqual([]);
  }, 60_000);
});
