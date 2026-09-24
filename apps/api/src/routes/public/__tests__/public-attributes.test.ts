/**
 * Board §6.1: the customer `/my-profile` style chips used to be a hardcoded
 * copy that drifted (it carried 'Gown' twice). They now come from
 * `GET /v1/public/attributes?kind=STYLE`, so this file pins the contract the
 * client reads (`json.data.names`) — including the two behaviours the client
 * depends on for its fallback path: an empty taxonomy is an empty array (not an
 * error), and a bad `kind` is rejected (never a silent default to STYLE).
 */
import { prisma } from '@kanchuki/db';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { publicMiscRoutes } from '../public-misc.js';

// ─── Mocks ────────────────────────────────────────────────────────

const mockAttributeFindMany = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    defaultProductAttribute: {
      findMany: mockAttributeFindMany,
    },
  },
  Prisma: {},
}));

// The plugin's other routes reach `getTheme` → admin-settings → the admin
// retailer routes → the purge client. Mocking the theme boundary keeps this
// file's mock surface to the one model it actually exercises, so an unrelated
// admin import can't fail the suite again.
vi.mock('../../admin-settings.js', () => ({ getTheme: vi.fn().mockResolvedValue({}) }));

// ─── Test app ─────────────────────────────────────────────────────

function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.register(publicMiscRoutes, { prefix: '/v1/public' });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────

describe('GET /v1/public/attributes', () => {
  it('returns the admin taxonomy names, de-duplicated', async () => {
    // The unique key is (kind, segment, name), so the same style legitimately
    // exists once per segment — a flat chip row wants it once, and returning
    // the names de-duplicated is what stops the client drifting again.
    mockAttributeFindMany.mockResolvedValue([
      { name: 'Anarkali' },
      { name: 'Gown' },
      { name: 'Gown' },
      { name: 'Saree' },
    ]);

    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/v1/public/attributes?kind=STYLE' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      kind: 'STYLE',
      names: ['Anarkali', 'Gown', 'Saree'],
    });
    await app.close();
  });

  it('reads active rows only, ordered by the admin sort order', async () => {
    mockAttributeFindMany.mockResolvedValue([]);

    const app = buildApp();
    await app.ready();
    await app.inject({ method: 'GET', url: '/v1/public/attributes?kind=STYLE' });

    expect(prisma.defaultProductAttribute.findMany).toHaveBeenCalledWith({
      where: { kind: 'STYLE', is_active: true },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: { name: true },
    });
    await app.close();
  });

  it('filters by segment when one is given', async () => {
    mockAttributeFindMany.mockResolvedValue([{ name: 'Kurti' }]);

    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/attributes?kind=STYLE&segment=LADIES',
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.defaultProductAttribute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind: 'STYLE', is_active: true, segment: 'LADIES' } }),
    );
    await app.close();
  });

  it('defaults to STYLE when no kind is given', async () => {
    mockAttributeFindMany.mockResolvedValue([{ name: 'Casual' }]);

    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/v1/public/attributes' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.kind).toBe('STYLE');
    await app.close();
  });

  it('rejects an unknown kind instead of silently returning STYLE', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/v1/public/attributes?kind=NOPE' });

    // 422 is what the shared `validationError` maps to here (not 400) — the
    // client only checks `res.ok`, so either would fall back, but pinning the
    // real code keeps the assertion honest.
    expect(res.statusCode).toBe(422);
    expect(mockAttributeFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns an empty list (not an error) when the admin has configured nothing', async () => {
    // The client shows a built-in list + a notice in this case; an error here
    // would be indistinguishable from a real outage and hide the notice.
    mockAttributeFindMany.mockResolvedValue([]);

    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/v1/public/attributes?kind=STYLE' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.names).toEqual([]);
    await app.close();
  });
});
