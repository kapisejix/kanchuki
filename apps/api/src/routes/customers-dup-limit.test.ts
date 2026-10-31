// H2-6 — POST /customers answers "already exists" for a known number, so a salesperson
// can probe which phones are customers. No response shape can hide that (the mobile add
// screen needs the new id, and GET /:id would reveal a fake one), so the fix is to bound
// how fast the probe runs: a per-route limit on the create route.
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { customerRoutes } from './customers.js';

const { mockFindFirst, mockCreate, mockAudit } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
  mockAudit: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    customer: { findFirst: mockFindFirst, create: mockCreate },
    auditLog: { create: mockAudit },
  },
  vaultDelete: vi.fn(),
}));

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = 'ret_1';
    request.staffRole = 'salesperson' as never;
  });
  // Looser than production's global 200/min so only a route-level limit can trip it.
  await app.register(rateLimit, { global: true, max: 1000, timeWindow: 60_000 });
  await app.register(customerRoutes, { prefix: '/v1/customers' });
  await app.ready();
  return app;
}

const post = (app: Awaited<ReturnType<typeof buildApp>>, phone: string) =>
  app.inject({ method: 'POST', url: '/v1/customers', payload: { name: 'x', phone } });

beforeEach(() => {
  vi.clearAllMocks();
  mockAudit.mockResolvedValue({});
});

describe('POST /customers probe rate limit (H2-6)', () => {
  it('the 11th duplicate-phone probe inside a minute is a 429', async () => {
    mockFindFirst.mockResolvedValue({ id: 'c_1' });
    const app = await buildApp();
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await post(app, '9876543210')).statusCode);

    expect(codes.slice(0, 10).every((c) => c === 422)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('normal use is untouched: 10 creates in a minute all succeed', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: 'c_new',
      phone: '9876543210',
      phone_hash: 'h',
      customer_account_id: null,
      name: 'x',
    });
    const app = await buildApp();
    const codes: number[] = [];
    for (let i = 0; i < 10; i++) codes.push((await post(app, '9876543210')).statusCode);

    expect(codes.every((c) => c === 201)).toBe(true);
  });
});
