import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { adminFestivalsRoutes } from './admin-festivals.js';

// ─── Mock Prisma (vi.hoisted to avoid Vitest hoisting TDZ issue) ─

const {
  mockFestivalFindMany,
  mockFestivalCreate,
  mockFestivalFindFirst,
  mockFestivalUpdate,
  mockAuditLogCreate,
} = vi.hoisted(() => ({
  mockFestivalFindMany: vi.fn(),
  mockFestivalCreate: vi.fn(),
  mockFestivalFindFirst: vi.fn(),
  mockFestivalUpdate: vi.fn(),
  mockAuditLogCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    festival: {
      findMany: mockFestivalFindMany,
      create: mockFestivalCreate,
      findFirst: mockFestivalFindFirst,
      update: mockFestivalUpdate,
    },
    auditLog: { create: mockAuditLogCreate },
  },
  getReplicaPrisma: () => ({ $queryRawUnsafe: vi.fn() }),
  getVaultPrisma: () => null,
  getPurgePrisma: () => ({ $executeRawUnsafe: vi.fn() }),
  encryptSecret: (plaintext: string) => `enc:${plaintext}`,
  maskSecret: (plaintext: string) => `masked:${plaintext.slice(-4)}`,
  invalidateSecret: vi.fn(),
  getSecret: vi.fn(),
  vaultDelete: vi.fn(),
  Prisma: {},
}));

// ─── Test Helpers ──────────────────────────────────────────────────

const ADMIN_KEY = 'test-admin-key-12345';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(adminFestivalsRoutes, { prefix: '/v1/admin' });
  await app.ready();
  return app;
}

function authedHeaders() {
  return { 'x-admin-key': ADMIN_KEY };
}

function csrfHeaders() {
  const token = randomBytes(16).toString('hex');
  return {
    ...authedHeaders(),
    'x-csrf-token': token,
    cookie: `csrf-token=${token}`,
    'content-type': 'application/json',
  };
}

function csrfHeadersNoBody() {
  const token = randomBytes(16).toString('hex');
  return {
    ...authedHeaders(),
    'x-csrf-token': token,
    cookie: `csrf-token=${token}`,
  };
}

const diwali = {
  id: 10,
  name: 'Diwali',
  region: 'PAN_INDIA',
  starts_at: new Date('2026-11-08T00:00:00.000Z'),
  ends_at: new Date('2026-11-12T23:59:59.000Z'),
  created_at: new Date('2026-08-17T00:00:00.000Z'),
};

beforeEach(() => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  vi.clearAllMocks();
});

// ─── GET /admin/festivals ─────────────────────────────────────────

describe('GET /admin/festivals', () => {
  it('lists all non-deleted festivals newest first', async () => {
    mockFestivalFindMany.mockResolvedValue([diwali]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/festivals',
      headers: authedHeaders(),
    });

    expect(res.statusCode).toBe(200);
    // Soft-deleted rows must never be listed.
    expect(mockFestivalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deleted_at: null }) }),
    );
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0]).toMatchObject({ id: 10, name: 'Diwali', region: 'PAN_INDIA' });
  });

  it('rejects unauthenticated requests', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/admin/festivals' });
    expect(res.statusCode).toBe(403);
  });
});

// ─── POST /admin/festivals ────────────────────────────────────────

describe('POST /admin/festivals', () => {
  it('creates a festival with a numeric auto id and writes an audit entry', async () => {
    mockFestivalCreate.mockResolvedValue({
      ...diwali,
      id: 11,
      name: 'Pongal',
      region: 'TAMIL_NADU',
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/festivals',
      headers: csrfHeaders(),
      payload: {
        name: 'Pongal',
        region: 'TAMIL_NADU',
        starts_at: '2026-01-14T00:00:00.000Z',
        ends_at: '2026-01-17T23:59:59.000Z',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ id: 11, name: 'Pongal', region: 'TAMIL_NADU' });
    expect(mockFestivalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Pongal', region: 'TAMIL_NADU' }),
    });
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'Festival',
        resource_id: '11',
      }),
    });
  });

  it('rejects a missing name', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/festivals',
      headers: csrfHeaders(),
      payload: {
        name: '',
        region: 'PAN_INDIA',
        starts_at: '2026-11-08T00:00:00.000Z',
        ends_at: '2026-11-12T23:59:59.000Z',
      },
    });
    expect(res.statusCode).toBe(422);
    expect(mockFestivalCreate).not.toHaveBeenCalled();
  });

  it('rejects an end date before the start date', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/festivals',
      headers: csrfHeaders(),
      payload: {
        name: 'Test',
        region: 'PAN_INDIA',
        starts_at: '2026-11-12T00:00:00.000Z',
        ends_at: '2026-11-08T00:00:00.000Z',
      },
    });
    expect(res.statusCode).toBe(422);
    expect(mockFestivalCreate).not.toHaveBeenCalled();
  });
});

// ─── PUT /admin/festivals/:id ─────────────────────────────────────

describe('PUT /admin/festivals/:id', () => {
  it('updates festival fields and writes an audit entry with before/after', async () => {
    mockFestivalFindFirst.mockResolvedValue(diwali);
    mockFestivalUpdate.mockResolvedValue({
      ...diwali,
      ends_at: new Date('2026-11-15T23:59:59.000Z'),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/festivals/10',
      headers: csrfHeaders(),
      payload: { ends_at: '2026-11-15T23:59:59.000Z' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: 10, ends_at: '2026-11-15T23:59:59.000Z' });
    expect(mockFestivalUpdate).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({ ends_at: expect.any(Date) }),
    });
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE',
        resource_type: 'Festival',
        metadata: expect.objectContaining({
          before: expect.objectContaining({ name: 'Diwali' }),
          after: expect.objectContaining({ name: 'Diwali' }),
        }),
      }),
    });
  });

  it('404s for an unknown or already-deleted festival', async () => {
    mockFestivalFindFirst.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/festivals/999',
      headers: csrfHeaders(),
      payload: { name: 'Nope' },
    });
    expect(res.statusCode).toBe(404);
    expect(mockFestivalUpdate).not.toHaveBeenCalled();
  });

  it('rejects an update that makes the end date precede the start date', async () => {
    mockFestivalFindFirst.mockResolvedValue(diwali);

    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/festivals/10',
      headers: csrfHeaders(),
      payload: { ends_at: '2026-11-01T00:00:00.000Z' },
    });
    expect(res.statusCode).toBe(422);
    expect(mockFestivalUpdate).not.toHaveBeenCalled();
  });
});

// ─── DELETE /admin/festivals/:id ──────────────────────────────────

describe('DELETE /admin/festivals/:id (soft delete)', () => {
  it('soft-deletes (sets deleted_at via update), audits, and returns 204', async () => {
    mockFestivalFindFirst.mockResolvedValue(diwali);
    mockFestivalUpdate.mockResolvedValue({ ...diwali, deleted_at: new Date() });

    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/admin/festivals/10',
      headers: csrfHeadersNoBody(),
    });

    expect(res.statusCode).toBe(204);
    expect(mockFestivalUpdate).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({ deleted_at: expect.any(Date) }),
    });
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'DELETE', resource_id: '10' }),
    });
  });

  it('404s for an unknown or already-deleted festival', async () => {
    mockFestivalFindFirst.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/admin/festivals/999',
      headers: csrfHeadersNoBody(),
    });
    expect(res.statusCode).toBe(404);
    expect(mockFestivalUpdate).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric id', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/admin/festivals/not-a-number',
      headers: csrfHeadersNoBody(),
    });
    expect(res.statusCode).toBe(422);
  });
});
