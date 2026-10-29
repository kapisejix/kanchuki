// H4-2 / RC-096 — GET /v1/customers and /:id spread the whole row, so a masked
// staff member still received phone_hash (brute-forceable back to the number)
// and customer_account_id (the H4-1 input). Neither field belongs in a response.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { customerRoutes } from './customers.js';

const { mockFindMany, mockFindFirst, mockUpdate, mockAudit } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockAudit: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    customer: { findMany: mockFindMany, findFirst: mockFindFirst, update: mockUpdate },
    auditLog: { create: mockAudit },
  },
  vaultDelete: vi.fn(),
}));

const PHONE = '9876543210';
const ROW = {
  id: 'c_1',
  retailer_id: 'ret_1',
  name: 'Asha',
  phone: PHONE,
  phone_hash: 'deadbeef',
  customer_account_id: 'ca_victim',
};

async function buildApp(actor: 'owner' | 'salesperson') {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = 'ret_1';
    request.staffRole = actor === 'salesperson' ? actor : null;
  });
  await app.register(customerRoutes, { prefix: '/v1/customers' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([ROW]);
  mockFindFirst.mockResolvedValue(ROW);
});

describe.each(['owner', 'salesperson'] as const)('customer responses (%s)', (actor) => {
  it('GET / never returns phone_hash or customer_account_id', async () => {
    const res = await (await buildApp(actor)).inject({ method: 'GET', url: '/v1/customers' });

    const row = res.json().data[0];
    expect(row).not.toHaveProperty('phone_hash');
    expect(row).not.toHaveProperty('customer_account_id');
    expect(row.name).toBe('Asha');
  });

  it('GET /:id never returns phone_hash or customer_account_id', async () => {
    const res = await (await buildApp(actor)).inject({ method: 'GET', url: '/v1/customers/c_1' });

    const row = res.json().data;
    expect(row).not.toHaveProperty('phone_hash');
    expect(row).not.toHaveProperty('customer_account_id');
  });
});

describe('PUT /:id returns the same safe shape', () => {
  it('masks the phone and omits phone_hash / customer_account_id', async () => {
    mockUpdate.mockResolvedValue(ROW);
    mockAudit.mockResolvedValue({});
    const res = await (await buildApp('salesperson')).inject({
      method: 'PUT',
      url: '/v1/customers/c_1',
      payload: { name: 'Asha K' },
    });

    const row = res.json().data;
    expect(row).not.toHaveProperty('phone_hash');
    expect(row).not.toHaveProperty('customer_account_id');
    expect(row.phone).not.toBe(PHONE);
  });
});

describe('phone masking is unchanged', () => {
  it('owner sees the full phone, salesperson sees it masked', async () => {
    const owner = await (await buildApp('owner')).inject({
      method: 'GET',
      url: '/v1/customers/c_1',
    });
    const staff = await (await buildApp('salesperson')).inject({
      method: 'GET',
      url: '/v1/customers/c_1',
    });

    expect(owner.json().data.phone).toBe(PHONE);
    expect(staff.json().data.phone).not.toBe(PHONE);
  });
});
