/**
 * Integration tests for GET /health — deep connectivity checks (DB + Redis).
 * Mocks dbHealthCheck and Redis ping to verify status code + response shape.
 */
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';

// ─── Mocks ───────────────────────────────────────────────────────

const mockDbHealthCheck = vi.hoisted(() => vi.fn())
const mockPing = vi.hoisted(() => vi.fn())

vi.mock('@kanchuki/db', () => ({
  dbHealthCheck: (...args: unknown[]) => mockDbHealthCheck(...args),
  prisma: {},
  withRetry: (fn: () => Promise<unknown>) => fn(),
  getPurgePrisma: () => ({}),
  getReplicaPrisma: () => ({}),
}))

vi.mock('../jobs/index.js', () => ({
  getRedis: () => ({
    ping: (...args: unknown[]) => mockPing(...args),
  }),
  startWorkers: vi.fn(),
}))

// Import after mocks are set up
import { dbHealthCheck } from '@kanchuki/db';
import { getRedis } from '../jobs/index.js';

async function buildHealthApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);

  // Register the /health endpoint using the same logic as index.ts
  // but with static imports (mocked at module level)
  app.get('/health', async (_request, reply) => {
    const [db, redis] = await Promise.allSettled([
      dbHealthCheck(),
      (async () => {
        const start = Date.now();
        try {
          await getRedis().ping();
          return { ok: true as const, latencyMs: Date.now() - start };
        } catch (err) {
          return { ok: false as const, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
        }
      })(),
    ]);

    const dbResult = db.status === 'fulfilled' ? db.value : { ok: false, latencyMs: 0, error: 'promise rejected' };
    const redisResult = redis.status === 'fulfilled' ? redis.value : { ok: false, latencyMs: 0, error: 'promise rejected' };

    const healthy = dbResult.ok && redisResult.ok;
    reply.code(healthy ? 200 : 503);

    return {
      status: healthy ? 'ok' : 'degraded',
      ts: Date.now(),
      db: dbResult,
      redis: redisResult,
    };
  });

  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ══════════════════════════════════════════════════════════════════
//  GET /health — Healthy state
// ══════════════════════════════════════════════════════════════════

describe('GET /health', () => {
  it('returns 200 when both DB and Redis are healthy', async () => {
    mockDbHealthCheck.mockResolvedValue({ ok: true, latencyMs: 12 });
    mockPing.mockResolvedValue('PONG');

    const app = await buildHealthApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.db.ok).toBe(true);
    expect(body.db.latencyMs).toBe(12);
    expect(body.redis.ok).toBe(true);
    expect(typeof body.ts).toBe('number');
    await app.close();
  });

  it('returns valid response shape with all required fields', async () => {
    mockDbHealthCheck.mockResolvedValue({ ok: true, latencyMs: 5 });
    mockPing.mockResolvedValue('PONG');

    const app = await buildHealthApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('ts');
    expect(body).toHaveProperty('db');
    expect(body).toHaveProperty('redis');
    expect(body.db).toHaveProperty('ok');
    expect(body.db).toHaveProperty('latencyMs');
    expect(body.redis).toHaveProperty('ok');
    expect(body.redis).toHaveProperty('latencyMs');
    await app.close();
  });

  // ══════════════════════════════════════════════════════════════════
  //  GET /health — Degraded states
  // ══════════════════════════════════════════════════════════════════

  it('returns 503 when DB is down', async () => {
    mockDbHealthCheck.mockResolvedValue({
      ok: false,
      latencyMs: 10002,
      error: 'Connection terminated',
    });
    mockPing.mockResolvedValue('PONG');

    const app = await buildHealthApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe('degraded');
    expect(body.db.ok).toBe(false);
    expect(body.db.error).toBe('Connection terminated');
    expect(body.redis.ok).toBe(true);
    await app.close();
  });

  it('returns 503 when Redis is down', async () => {
    mockDbHealthCheck.mockResolvedValue({ ok: true, latencyMs: 10 });
    mockPing.mockRejectedValue(new Error('ECONNREFUSED'));

    const app = await buildHealthApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe('degraded');
    expect(body.db.ok).toBe(true);
    expect(body.redis.ok).toBe(false);
    expect(body.redis.error).toBe('ECONNREFUSED');
    await app.close();
  });

  it('returns 503 when both DB and Redis are down', async () => {
    mockDbHealthCheck.mockResolvedValue({
      ok: false,
      latencyMs: 10000,
      error: 'timeout',
    });
    mockPing.mockRejectedValue(new Error('ECONNREFUSED'));

    const app = await buildHealthApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe('degraded');
    expect(body.db.ok).toBe(false);
    expect(body.redis.ok).toBe(false);
    await app.close();
  });

  it('handles dbHealthCheck throwing (promise rejection)', async () => {
    mockDbHealthCheck.mockRejectedValue(new Error('PrismaClient rejected'));
    mockPing.mockResolvedValue('PONG');

    const app = await buildHealthApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe('degraded');
    expect(body.db.ok).toBe(false);
    expect(body.db.error).toBe('promise rejected');
    expect(body.redis.ok).toBe(true);
    await app.close();
  });

  it('does not require authentication', async () => {
    mockDbHealthCheck.mockResolvedValue({ ok: true, latencyMs: 3 });
    mockPing.mockResolvedValue('PONG');

    const app = await buildHealthApp();
    // No auth headers
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
