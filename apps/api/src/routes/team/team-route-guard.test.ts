// Every route under /v1/team except the five public auth routes must refuse a request
// with no credentials (T1.3 F2/F3).
//
// The guard is installed per plugin (`server.addHook('preHandler', teamAuthPreHandler)`) and
// Fastify hooks do not cross sibling plugin boundaries, so a new team plugin that forgets the
// hook fails open (the RC-034 shape; admin has the same test in admin-route-guard.test.ts).
// Routes are collected with `onRoute` (derived, not hand-kept: RC-043).
import Fastify, { type RouteOptions } from 'fastify';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { teamRoutes } from '../team.js';
import { teamAuthPreHandler } from './team-helpers.js';

// Import-chain stand-ins only; no request below gets past the auth hook.
vi.mock('@kanchuki/db', () => ({
  prisma: {},
  Prisma: {},
  getPurgePrisma: () => ({}),
  encryptSecret: vi.fn(),
  maskSecret: vi.fn(),
  invalidateSecret: vi.fn(),
  getSecret: vi.fn(),
}));
vi.mock('@kanchuki/ai', () => ({ getUploadPresignedUrl: vi.fn(), publicUrl: vi.fn() }));
vi.mock('ioredis', () => ({
  default: class {
    status = 'ready';
    on() {
      return this;
    }
    once() {
      return this;
    }
    off() {
      return this;
    }
  },
}));

const PUBLIC = new Set([
  '/v1/team/login',
  '/v1/team/otp/send',
  '/v1/team/otp/verify',
  '/v1/team/forgot-password',
  '/v1/team/reset-password',
]);

const routes: { method: string; url: string }[] = [];
let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  app = Fastify();
  app.setErrorHandler(errorHandler);
  app.addHook('onRoute', (route: RouteOptions) => {
    for (const method of [route.method].flat()) {
      if (method !== 'HEAD') routes.push({ method, url: route.url });
    }
  });
  await app.register(teamRoutes, { prefix: '/v1/team' });
  await app.ready();
}, 30_000);

const concrete = (url: string) => url.replace(/:[A-Za-z0-9_]+/g, 'x').replace(/\*/g, 'x');

describe('/v1/team route guard', () => {
  it('collects a realistic number of routes, including all five public ones', () => {
    expect(routes.length).toBeGreaterThan(20);
    const urls = new Set(routes.map((r) => r.url));
    for (const p of PUBLIC) expect(urls.has(p)).toBe(true);
  });

  it('every non-public route rejects a request with no credentials', async () => {
    const open: string[] = [];
    for (const r of routes) {
      if (PUBLIC.has(r.url)) continue;
      const res = await app.inject({ method: r.method as 'GET', url: concrete(r.url) });
      if (res.statusCode !== 401) open.push(`${r.method} ${r.url} -> ${res.statusCode}`);
    }
    expect(open).toEqual([]);
  }, 60_000);
});

describe('teamAuthPreHandler public-path bypass', () => {
  const build = async () => {
    const a = Fastify();
    a.addHook('preHandler', teamAuthPreHandler);
    a.get('/v1/team/login', async () => ({ ok: true }));
    a.get('/v1/team/login-history', async () => ({ ok: true }));
    await a.ready();
    return a;
  };

  it('lets the exact public route through', async () => {
    const a = await build();
    expect((await a.inject({ url: '/v1/team/login' })).statusCode).toBe(200);
  });

  it('does not extend the bypass to a route that merely starts with a public path', async () => {
    const a = await build();
    expect((await a.inject({ url: '/v1/team/login-history' })).statusCode).toBe(401);
  });

  it('does not extend the bypass through a query string', async () => {
    const a = await build();
    expect((await a.inject({ url: '/v1/team/login-history?x=/v1/team/login' })).statusCode).toBe(
      401,
    );
  });
});
