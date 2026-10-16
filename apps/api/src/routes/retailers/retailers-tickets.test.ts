// Retailer support tickets (support-and-feedback-loop §1).
// Guards: tickets are retailer-scoped, capped at MAX_OPEN_TICKETS, routed through the shared
// routeTicket(), and creating one never touches support-session grants.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { MAX_OPEN_TICKETS, retailersTicketRoutes } from './retailers-tickets.js';

const m = vi.hoisted(() => ({
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  retailerFind: vi.fn(),
  territoryFind: vi.fn(),
  grantCreate: vi.fn(),
  routeTicket: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    supportTicket: { count: m.count, create: m.create, update: m.update, findMany: m.findMany },
    retailer: { findUnique: m.retailerFind },
    territory: { findUnique: m.territoryFind },
    supportSessionGrant: { create: m.grantCreate },
  },
}));
vi.mock('../team.js', () => ({ routeTicket: m.routeTicket }));

async function buildApp(retailerId = 'retailer_1') {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = retailerId;
  });
  await app.register(retailersTicketRoutes);
  await app.ready();
  return app;
}

const created = {
  id: 't1',
  ticket_type: 'GENERAL',
  requires_visit: false,
  status: 'OPEN',
  note: 'Need help setting up my catalog',
  created_at: new Date(),
  resolved_at: null,
  assigned_to: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.count.mockResolvedValue(0);
  m.create.mockResolvedValue(created);
  m.retailerFind.mockResolvedValue({ territory_id: 'zone_1' });
  m.territoryFind.mockResolvedValue({ parent_id: 'city_1' });
  m.routeTicket.mockResolvedValue(null);
});

describe('POST /me/tickets', () => {
  it('creates a retailer-scoped ticket and never creates a support-session grant', async () => {
    const app = await buildApp('retailer_9');
    const res = await app.inject({
      method: 'POST',
      url: '/me/tickets',
      payload: { note: 'Need help setting up my catalog' },
    });
    expect(res.statusCode).toBe(201);
    expect(m.create.mock.calls[0]?.[0]?.data).toMatchObject({
      retailer_id: 'retailer_9',
      ticket_type: 'GENERAL',
      region_scope_id: 'city_1',
    });
    expect(m.grantCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('ignores a client-supplied retailer_id', async () => {
    const app = await buildApp('retailer_1');
    await app.inject({
      method: 'POST',
      url: '/me/tickets',
      payload: { note: 'Need help setting up my catalog', retailer_id: 'someone_else' },
    });
    expect(m.create.mock.calls[0]?.[0]?.data.retailer_id).toBe('retailer_1');
    await app.close();
  });

  it('marks the ticket ASSIGNED when routing finds an agent', async () => {
    m.routeTicket.mockResolvedValue('agent_1');
    m.update.mockResolvedValue({ ...created, status: 'ASSIGNED', assigned_to: { name: 'Asha' } });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/tickets',
      payload: { note: 'Need help setting up my catalog' },
    });
    expect(res.json().data.status).toBe('ASSIGNED');
    expect(m.update.mock.calls[0]?.[0]?.data).toMatchObject({
      assigned_to_id: 'agent_1',
      status: 'ASSIGNED',
    });
    await app.close();
  });

  it('keeps the ticket OPEN when routing throws', async () => {
    m.routeTicket.mockRejectedValue(new Error('db down'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/tickets',
      payload: { note: 'Need help setting up my catalog' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.status).toBe('OPEN');
    await app.close();
  });

  it('visit-required tickets are not pooled by region', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/me/tickets',
      payload: { note: 'Please visit my shop to set up', requires_visit: true },
    });
    expect(m.create.mock.calls[0]?.[0]?.data.region_scope_id).toBeNull();
    expect(m.routeTicket.mock.calls[0]?.[1]).toBe(true);
    await app.close();
  });

  it('rejects a too-short note and the CATALOG_UPLOAD type', async () => {
    const app = await buildApp();
    const short = await app.inject({
      method: 'POST',
      url: '/me/tickets',
      payload: { note: 'help' },
    });
    expect(short.statusCode).toBe(422);
    const wrongType = await app.inject({
      method: 'POST',
      url: '/me/tickets',
      payload: { note: 'Need help setting up my catalog', ticket_type: 'CATALOG_UPLOAD' },
    });
    expect(wrongType.statusCode).toBe(422);
    expect(m.create).not.toHaveBeenCalled();
    await app.close();
  });

  it(`returns 429 once ${MAX_OPEN_TICKETS} tickets are open`, async () => {
    m.count.mockResolvedValue(MAX_OPEN_TICKETS);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/tickets',
      payload: { note: 'Need help setting up my catalog' },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('TOO_MANY_OPEN_TICKETS');
    expect(m.create).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /me/tickets', () => {
  it('lists only the caller’s non-catalog tickets', async () => {
    m.findMany.mockResolvedValue([created]);
    const app = await buildApp('retailer_7');
    const res = await app.inject({ method: 'GET', url: '/me/tickets' });
    expect(res.statusCode).toBe(200);
    expect(m.findMany.mock.calls[0]?.[0]?.where).toEqual({
      retailer_id: 'retailer_7',
      ticket_type: { not: 'CATALOG_UPLOAD' },
    });
    await app.close();
  });
});
