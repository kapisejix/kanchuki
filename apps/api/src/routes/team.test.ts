import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { hashPassword, signTeamToken } from '../plugins/team-auth.js';
import { teamRoutes } from './team.js';

const {
  mockTeamMemberFindUnique,
  mockTeamMemberFindMany,
  mockTeamMemberCreate,
  mockTeamMemberUpdate,
  mockTeamMemberTerritoryFindMany,
  mockTerritoryFindFirst,
  mockTerritoryFindMany,
  mockTerritoryFindUnique,
  mockRetailerUpsert,
  mockRetailerCount,
  mockRetailerFindMany,
  mockRetailerFindUnique,
  mockSupportTicketCreate,
  mockSupportTicketFindMany,
  mockSupportTicketFindUnique,
  mockSupportTicketUpdate,
  mockSupportTicketCount,
  mockAuditLogCreate,
} = vi.hoisted(() => ({
  mockTeamMemberFindUnique: vi.fn(),
  mockTeamMemberFindMany: vi.fn(),
  mockTeamMemberCreate: vi.fn(),
  mockTeamMemberUpdate: vi.fn(),
  mockTeamMemberTerritoryFindMany: vi.fn(),
  mockTerritoryFindFirst: vi.fn(),
  mockTerritoryFindMany: vi.fn(),
  mockTerritoryFindUnique: vi.fn(),
  mockRetailerUpsert: vi.fn(),
  mockRetailerCount: vi.fn(),
  mockRetailerFindMany: vi.fn(),
  mockRetailerFindUnique: vi.fn(),
  mockSupportTicketCreate: vi.fn(),
  mockSupportTicketFindMany: vi.fn(),
  mockSupportTicketFindUnique: vi.fn(),
  mockSupportTicketUpdate: vi.fn(),
  mockSupportTicketCount: vi.fn(),
  mockAuditLogCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kanchuki/db')>();
  return {
    ...actual,
    getPurgePrisma: () => ({
      $executeRawUnsafe: vi.fn(),
      $queryRawUnsafe: vi.fn(),
      $transaction: (ops: unknown) =>
        Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : Promise.resolve(),
      retailer: { findUnique: vi.fn() },
    }),
    prisma: {
      ...actual.prisma,
      defaultProductCategory: { findMany: vi.fn().mockResolvedValue([]) },
      defaultProductAttribute: { findMany: vi.fn().mockResolvedValue([]) },
      teamMember: {
        findUnique: mockTeamMemberFindUnique,
        findMany: mockTeamMemberFindMany,
        findFirst: vi.fn(),
        create: mockTeamMemberCreate,
        update: mockTeamMemberUpdate,
      },
      teamMemberTerritory: { findMany: mockTeamMemberTerritoryFindMany },
      territory: {
        findFirst: mockTerritoryFindFirst,
        findMany: mockTerritoryFindMany,
        findUnique: mockTerritoryFindUnique,
        create: vi.fn(),
        update: vi.fn(),
      },
      retailer: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: mockRetailerUpsert,
        count: mockRetailerCount,
        findMany: mockRetailerFindMany,
        findUnique: mockRetailerFindUnique,
      },
      supportTicket: {
        create: mockSupportTicketCreate,
        findMany: mockSupportTicketFindMany,
        findUnique: mockSupportTicketFindUnique,
        update: mockSupportTicketUpdate,
        count: mockSupportTicketCount,
      },
      auditLog: {
        create: mockAuditLogCreate,
      },
    },
  };
});

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(teamRoutes, { prefix: '/v1/team' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TEAM_JWT_SECRET = 'test-team-secret';
  process.env.ADMIN_API_KEY = 'test-admin-key';
});

const AGENT = { id: 'agent_1', role: 'MARKETING_AGENT', is_active: true };

async function agentHeaders() {
  const token = await signTeamToken({ sub: AGENT.id, role: AGENT.role });
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

describe('POST /team/login', () => {
  it('rejects wrong password', async () => {
    mockTeamMemberFindUnique.mockResolvedValue({
      id: 'x',
      email: 'a@kanchuki.app',
      password_hash: hashPassword('correct-horse'),
      role: 'SUPER_ADMIN',
      is_active: true,
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/login',
      payload: { email: 'a@kanchuki.app', password: 'wrong' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('issues a token on correct credentials', async () => {
    mockTeamMemberFindUnique.mockResolvedValue({
      id: 'x',
      name: 'Admin One',
      email: 'a@kanchuki.app',
      password_hash: hashPassword('correct-horse'),
      role: 'SUPER_ADMIN',
      is_active: true,
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/login',
      payload: { email: 'a@kanchuki.app', password: 'correct-horse' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.token).toBeTruthy();
    await app.close();
  });
});

describe('GET /team/me', () => {
  it('rejects requests with no auth', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/team/me' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('accepts the shared admin key as an unscoped Super Admin', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/team/me',
      headers: { 'x-admin-key': 'test-admin-key' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.role).toBe('SUPER_ADMIN');
    await app.close();
  });
});

describe('POST /team/retailers — agent onboarding + territory derivation', () => {
  it('derives territory_id from pincode and attributes to the onboarding agent', async () => {
    mockTeamMemberFindUnique.mockResolvedValueOnce(AGENT); // preHandler lookup
    mockTeamMemberTerritoryFindMany.mockResolvedValue([]);
    mockTerritoryFindFirst.mockResolvedValue({ id: 'zone_42' });
    mockRetailerUpsert.mockResolvedValue({
      id: 'retailer_9',
      shop_name: 'New Shop',
      phone: '+919876543210',
      territory_id: 'zone_42',
      onboarded_by_id: AGENT.id,
    });
    mockTeamMemberFindUnique.mockResolvedValueOnce({ max_retailers: null }); // capacity check

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/retailers',
      headers: await agentHeaders(),
      payload: { phone: '9876543210', shop_name: 'New Shop', city: 'Jaipur', pincode: '302001' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockTerritoryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { level: 'ZONE', pincodes: { has: '302001' } } }),
    );
    const createArgs = mockRetailerUpsert.mock.calls[0]?.[0];
    expect(createArgs.create.territory_id).toBe('zone_42');
    expect(createArgs.create.onboarded_by_id).toBe(AGENT.id);
    expect(createArgs.create.auth_user_id).toMatch(/^pending:/);
    await app.close();
  });

  it('flags over_capacity once the agent exceeds max_retailers', async () => {
    mockTeamMemberFindUnique.mockResolvedValueOnce(AGENT);
    mockTeamMemberTerritoryFindMany.mockResolvedValue([]);
    mockTerritoryFindFirst.mockResolvedValue(null);
    mockRetailerUpsert.mockResolvedValue({
      id: 'r',
      shop_name: 'S',
      phone: 'p',
      territory_id: null,
      onboarded_by_id: AGENT.id,
    });
    mockTeamMemberFindUnique.mockResolvedValueOnce({ max_retailers: 5 });
    mockRetailerCount.mockResolvedValue(6);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/retailers',
      headers: await agentHeaders(),
      payload: { phone: '9876543211', shop_name: 'S', city: 'Jaipur' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.over_capacity).toBe(true);
    await app.close();
  });

  it('rejects a Support Agent trying to onboard a retailer (wrong role)', async () => {
    mockTeamMemberFindUnique.mockResolvedValueOnce({
      id: 's1',
      role: 'SUPPORT_AGENT',
      is_active: true,
    });
    mockTeamMemberTerritoryFindMany.mockResolvedValue([]);

    const token = await signTeamToken({ sub: 's1', role: 'SUPPORT_AGENT' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/retailers',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { phone: '9876543212', shop_name: 'S', city: 'Jaipur' },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('POST /team/members — role scoping', () => {
  it('blocks a Marketing Manager from creating a Support Agent', async () => {
    mockTeamMemberFindUnique.mockResolvedValueOnce({
      id: 'mgr_1',
      role: 'MARKETING_MANAGER',
      is_active: true,
    });
    mockTeamMemberTerritoryFindMany.mockResolvedValue([{ territory_id: 't1' }]);

    const token = await signTeamToken({ sub: 'mgr_1', role: 'MARKETING_MANAGER' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/members',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: {
        name: 'X',
        email: 'x@kanchuki.app',
        password: 'password123',
        role: 'SUPPORT_AGENT',
      },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET /team/members — capacity flag', () => {
  it('marks a member over_capacity when onboarded count exceeds max_retailers', async () => {
    mockTeamMemberFindUnique.mockResolvedValueOnce({
      id: 'admin-key',
      role: 'SUPER_ADMIN',
      is_active: true,
    });
    mockTeamMemberFindMany.mockResolvedValue([
      {
        id: AGENT.id,
        name: 'Agent One',
        email: 'agent@kanchuki.app',
        role: 'MARKETING_AGENT',
        is_active: true,
        max_retailers: 3,
        territories: [],
        _count: { onboarded_retailers: 5, supported_retailers: 0 },
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/team/members',
      headers: { 'x-admin-key': 'test-admin-key' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].over_capacity).toBe(true);
    expect(res.json().data[0].retailer_count).toBe(5);
    await app.close();
  });
});

// ═════════════════════════════════════════════════════════════════
//  Support Tickets — POST, GET, PATCH, Stats, Routing
// ═════════════════════════════════════════════════════════════════

function ticketHeaders() {
  return { 'x-admin-key': 'test-admin-key', 'content-type': 'application/json' };
}

const MOCK_RETAILER = { id: 'retailer_1', territory_id: 'zone_1' };
const MOCK_AGENT_1 = { id: 'support_1', name: 'Agent One', role: 'SUPPORT_AGENT' };
const MOCK_AGENT_2 = { id: 'support_2', name: 'Agent Two', role: 'SUPPORT_AGENT' };

describe('POST /team/tickets — auto-routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset new mocks to clear persistent implementations from other describe blocks
    mockSupportTicketCount.mockReset();
    mockSupportTicketCreate.mockReset();
    mockSupportTicketUpdate.mockReset();
    mockTeamMemberTerritoryFindMany.mockReset();
    mockTerritoryFindUnique.mockReset();
    mockRetailerFindUnique.mockReset();
    // PreHandler accepts admin key
    mockTeamMemberFindUnique.mockResolvedValue(null);
    // Retailer lookup for ticket creation
    mockRetailerFindUnique.mockResolvedValue(MOCK_RETAILER);
    // Territory lookup for regionScopeId: zone -> city parent
    mockTerritoryFindUnique.mockResolvedValue({ parent_id: 'city_1' });
  });

  it('auto-routes a backend-manageable ticket to the least-loaded agent', async () => {
    mockSupportTicketCreate.mockResolvedValue({
      id: 'ticket_1',
      retailer_id: 'retailer_1',
      requires_visit: false,
      region_scope_id: 'city_1',
      status: 'OPEN',
      note: null,
      created_at: new Date().toISOString(),
    });
    // Territory assignments: both agents belong to city_1
    mockTeamMemberTerritoryFindMany.mockResolvedValue([
      { team_member: MOCK_AGENT_1, territory_id: 'city_1' },
      { team_member: MOCK_AGENT_2, territory_id: 'city_1' },
    ]);
    // Agent 2 has fewer tickets (1) vs Agent 1 (3) — should pick Agent 2
    mockSupportTicketCount
      .mockResolvedValueOnce(3) // agent 1 load
      .mockResolvedValueOnce(1); // agent 2 load
    mockSupportTicketUpdate.mockResolvedValue({});

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/tickets',
      headers: ticketHeaders(),
      payload: { retailer_id: 'retailer_1' },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.status).toBe('ASSIGNED');
    expect(data.assigned_to_id).toBe('support_2'); // least-loaded agent
    expect(data.region_scope_id).toBe('city_1');

    // Verify the update was called with the correct agent
    expect(mockSupportTicketUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { assigned_to_id: 'support_2', status: 'ASSIGNED' },
      }),
    );
    await app.close();
  });

  it('falls back to SUPPORT_MANAGER when no SUPPORT_AGENT available', async () => {
    mockSupportTicketCreate.mockResolvedValue({
      id: 'ticket_2',
      retailer_id: 'retailer_1',
      requires_visit: false,
      region_scope_id: 'city_1',
      status: 'OPEN',
      note: null,
      created_at: new Date().toISOString(),
    });
    // Only a SUPPORT_MANAGER is assigned to the territory
    mockTeamMemberTerritoryFindMany.mockResolvedValue([
      {
        team_member: { id: 'mgr_1', name: 'Mgr', role: 'SUPPORT_MANAGER' },
        territory_id: 'city_1',
      },
    ]);
    mockSupportTicketCount.mockResolvedValueOnce(0); // manager load
    mockSupportTicketUpdate.mockResolvedValue({});

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/tickets',
      headers: ticketHeaders(),
      payload: { retailer_id: 'retailer_1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.assigned_to_id).toBe('mgr_1');
    await app.close();
  });

  it('leaves ticket OPEN when no agents are available in the territory', async () => {
    mockSupportTicketCreate.mockResolvedValue({
      id: 'ticket_3',
      retailer_id: 'retailer_1',
      requires_visit: false,
      region_scope_id: 'city_1',
      status: 'OPEN',
      note: null,
      created_at: new Date().toISOString(),
    });
    // No team members assigned to this territory
    mockTeamMemberTerritoryFindMany.mockResolvedValue([]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/tickets',
      headers: ticketHeaders(),
      payload: { retailer_id: 'retailer_1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('OPEN');
    expect(res.json().data.assigned_to_id).toBeNull();
    expect(mockSupportTicketUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('routes visit-required tickets by traversing territory hierarchy', async () => {
    mockSupportTicketCreate.mockResolvedValue({
      id: 'ticket_4',
      retailer_id: 'retailer_1',
      requires_visit: true,
      region_scope_id: null,
      status: 'OPEN',
      note: null,
      created_at: new Date().toISOString(),
    });
    // Territory hierarchy: zone_1 -> city_1 -> state_1 -> null
    // No agents at zone_1 or city_1, but one at state_1
    mockTerritoryFindUnique
      .mockResolvedValueOnce({ parent_id: 'city_1' }) // zone_1 -> city_1
      .mockResolvedValueOnce({ parent_id: 'state_1' }) // city_1 -> state_1
      .mockResolvedValueOnce({ parent_id: null }); // state_1 -> null
    // routeTicket collects ALL candidate territories [zone_1, city_1, state_1]
    // then makes ONE findMany call with all 3 IDs — NOT one call per level
    const stateAgent = {
      team_member: { id: 'state_agent', name: 'State Agent', role: 'SUPPORT_AGENT' },
      territory_id: 'state_1',
    };
    mockTeamMemberTerritoryFindMany.mockResolvedValue([stateAgent]);
    mockSupportTicketCount.mockResolvedValueOnce(0);
    mockSupportTicketUpdate.mockResolvedValue({});

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/tickets',
      headers: ticketHeaders(),
      payload: { retailer_id: 'retailer_1', requires_visit: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.assigned_to_id).toBe('state_agent');
    expect(res.json().data.requires_visit).toBe(true);
    // Should have traversed 3 territories
    expect(mockTerritoryFindUnique).toHaveBeenCalledTimes(3);
    await app.close();
  });

  it('returns 404 when retailer is not found', async () => {
    mockRetailerFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/tickets',
      headers: ticketHeaders(),
      payload: { retailer_id: 'nonexistent' },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /team/tickets/route-all — batch routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset new mocks
    mockSupportTicketFindMany.mockReset();
    mockSupportTicketUpdate.mockReset();
    mockSupportTicketCount.mockReset();
    mockTeamMemberTerritoryFindMany.mockReset();
    mockTerritoryFindUnique.mockReset();
    mockTeamMemberFindUnique.mockReset();
    mockTeamMemberFindUnique.mockResolvedValue(null);
  });

  it('routes all unassigned open tickets and returns count', async () => {
    mockSupportTicketFindMany.mockResolvedValue([
      {
        id: 't_a',
        requires_visit: false,
        region_scope_id: 'city_1',
        retailer: { territory_id: 'zone_1' },
      },
      {
        id: 't_b',
        requires_visit: true,
        region_scope_id: null,
        retailer: { territory_id: 'zone_1' },
      },
    ]);
    // T_a (backend-manageable): uses regionScopeId directly, no territory.findUnique
    // T_b (visit-required): traverses hierarchy zone_1 -> city_1 -> state_1 -> null
    mockTerritoryFindUnique
      .mockResolvedValueOnce({ parent_id: 'city_1' }) // t_b: zone_1 -> city_1
      .mockResolvedValueOnce({ parent_id: 'state_1' }) // t_b: city_1 -> state_1
      .mockResolvedValueOnce({ parent_id: null }); // t_b: state_1 -> null
    // routeTicket makes ONE findMany call per ticket (not per territory level)
    const agentA = {
      team_member: { id: 'support_a', name: 'A', role: 'SUPPORT_AGENT' },
      territory_id: 'city_1',
    };
    const agentB = {
      team_member: { id: 'support_b', name: 'B', role: 'SUPPORT_AGENT' },
      territory_id: 'state_1',
    };
    mockTeamMemberTerritoryFindMany
      .mockResolvedValueOnce([agentA]) // t_a: query for [city_1]
      .mockResolvedValueOnce([agentB]); // t_b: query for [zone_1, city_1, state_1]
    mockSupportTicketCount.mockResolvedValue(0);
    mockSupportTicketUpdate.mockResolvedValue({});

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/tickets/route-all',
      headers: { 'x-admin-key': 'test-admin-key', 'content-type': 'application/json' },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.routed).toBe(2);
    expect(res.json().data.total).toBe(2);
    await app.close();
  });

  it('rejects non-manager roles', async () => {
    mockTeamMemberFindUnique.mockReset();
    mockTeamMemberFindUnique.mockResolvedValue({
      id: 'marketing_1',
      role: 'MARKETING_AGENT',
      is_active: true,
    });
    mockTeamMemberTerritoryFindMany.mockResolvedValue([]);

    const token = await signTeamToken({ sub: 'marketing_1', role: 'MARKETING_AGENT' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/tickets/route-all',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: {},
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET /team/tickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupportTicketFindMany.mockReset();
    mockTeamMemberFindUnique.mockResolvedValue(null);
  });

  it('lists tickets for super admin', async () => {
    const now = new Date().toISOString();
    mockSupportTicketFindMany.mockResolvedValue([
      {
        id: 't_1',
        retailer_id: 'retailer_1',
        requires_visit: false,
        region_scope_id: 'city_1',
        assigned_to_id: 'support_1',
        status: 'ASSIGNED',
        note: 'Test ticket',
        created_at: now,
        resolved_at: null,
        assigned_to: { id: 'support_1', name: 'Support One' },
        retailer: { id: 'retailer_1', shop_name: 'Shop 1', city: 'Jaipur', phone: '+919999999999' },
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/team/tickets',
      headers: { 'x-admin-key': 'test-admin-key' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].status).toBe('ASSIGNED');
    expect(res.json().data[0].retailer.shop_name).toBe('Shop 1');
    await app.close();
  });
});

describe('PATCH /team/tickets/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupportTicketFindUnique.mockReset();
    mockSupportTicketUpdate.mockReset();
    mockTeamMemberFindUnique.mockReset();
    mockTeamMemberFindUnique.mockResolvedValue(null);
  });

  it('updates ticket status', async () => {
    mockSupportTicketFindUnique.mockResolvedValue({
      id: 't_1',
      status: 'OPEN',
      assigned_to_id: null,
      region_scope_id: 'city_1',
      retailer: { territory_id: 'zone_1' },
    });
    mockSupportTicketUpdate.mockResolvedValue({
      id: 't_1',
      retailer_id: 'retailer_1',
      requires_visit: false,
      assigned_to_id: null,
      status: 'RESOLVED',
      note: null,
      created_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/team/tickets/t_1',
      headers: ticketHeaders(),
      payload: { status: 'RESOLVED' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('RESOLVED');
    expect(res.json().data.resolved_at).toBeTruthy();
    await app.close();
  });

  it('reassigns ticket to a valid support agent', async () => {
    mockSupportTicketFindUnique.mockResolvedValue({
      id: 't_1',
      status: 'OPEN',
      assigned_to_id: null,
      region_scope_id: 'city_1',
      retailer: { territory_id: 'zone_1' },
    });
    // Admin key skips preHandler's findUnique; this mock is for the
    // PATCH handler's assignee-validity check
    mockTeamMemberFindUnique.mockResolvedValue({ role: 'SUPPORT_AGENT', is_active: true });
    mockSupportTicketUpdate.mockResolvedValue({
      id: 't_1',
      retailer_id: 'retailer_1',
      requires_visit: false,
      assigned_to_id: 'new_agent',
      status: 'ASSIGNED',
      note: null,
      created_at: new Date().toISOString(),
      resolved_at: null,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/team/tickets/t_1',
      headers: ticketHeaders(),
      payload: { assigned_to_id: 'new_agent' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.assigned_to_id).toBe('new_agent');
    await app.close();
  });

  it('returns 404 for nonexistent ticket', async () => {
    mockSupportTicketFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/team/tickets/nonexistent',
      headers: ticketHeaders(),
      payload: { status: 'CLOSED' },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /team/tickets/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupportTicketCount.mockReset();
    mockTeamMemberFindUnique.mockResolvedValue(null);
  });

  it('returns aggregate ticket statistics', async () => {
    mockSupportTicketCount
      .mockResolvedValueOnce(5) // open
      .mockResolvedValueOnce(3) // assigned
      .mockResolvedValueOnce(10) // resolved
      .mockResolvedValueOnce(2) // closed
      .mockResolvedValueOnce(1); // visit_required

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/team/tickets/stats',
      headers: { 'x-admin-key': 'test-admin-key' },
    });

    expect(res.statusCode).toBe(200);
    const stats = res.json().data;
    expect(stats.open).toBe(5);
    expect(stats.assigned).toBe(3);
    expect(stats.resolved).toBe(10);
    expect(stats.closed).toBe(2);
    expect(stats.total).toBe(20);
    expect(stats.requires_visit).toBe(1);
    await app.close();
  });
});

// F-020: delegated catalog-upload session — mint endpoint
describe('POST /team/tickets/:id/catalog-session', () => {
  const CATALOG_TICKET = {
    id: 'ticket_1',
    ticket_type: 'CATALOG_UPLOAD',
    retailer_id: 'retailer_1',
    assigned_to_id: 'support_1',
    paid_at: new Date('2026-07-30T10:00:00Z'),
    confirmed_slot: new Date('2026-08-01T10:00:00Z'),
  };

  beforeEach(() => {
    process.env.TEAM_JWT_SECRET = 'test-team-secret';
    mockTeamMemberTerritoryFindMany.mockResolvedValue([]);
  });

  it('issues a token for the assigned agent once paid + slot confirmed, and audits it', async () => {
    mockSupportTicketFindUnique.mockResolvedValue(CATALOG_TICKET);
    mockTeamMemberFindUnique.mockResolvedValue({
      id: 'support_1',
      role: 'SUPPORT_AGENT',
      is_active: true,
    });
    const token = await signTeamToken({ sub: 'support_1', role: 'SUPPORT_AGENT' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/tickets/ticket_1/catalog-session',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.token).toBeTruthy();
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actor_type: 'staff',
          actor_id: 'support_1',
          action: 'issue_catalog_session',
          resource_id: 'ticket_1',
        }),
      }),
    );
    await app.close();
  });

  it('rejects a team member who is not the assigned agent', async () => {
    mockSupportTicketFindUnique.mockResolvedValue(CATALOG_TICKET);
    mockTeamMemberFindUnique.mockResolvedValue({
      id: 'support_9',
      role: 'SUPPORT_AGENT',
      is_active: true,
    });
    const token = await signTeamToken({ sub: 'support_9', role: 'SUPPORT_AGENT' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/tickets/ticket_1/catalog-session',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('rejects when payment or slot confirmation is missing', async () => {
    mockSupportTicketFindUnique.mockResolvedValue({ ...CATALOG_TICKET, paid_at: null });
    mockTeamMemberFindUnique.mockResolvedValue({
      id: 'support_1',
      role: 'SUPPORT_AGENT',
      is_active: true,
    });
    const token = await signTeamToken({ sub: 'support_1', role: 'SUPPORT_AGENT' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/tickets/ticket_1/catalog-session',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('rejects a ticket that is not CATALOG_UPLOAD', async () => {
    mockSupportTicketFindUnique.mockResolvedValue({ ...CATALOG_TICKET, ticket_type: 'GENERAL' });
    mockTeamMemberFindUnique.mockResolvedValue({
      id: 'support_1',
      role: 'SUPPORT_AGENT',
      is_active: true,
    });
    const token = await signTeamToken({ sub: 'support_1', role: 'SUPPORT_AGENT' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/tickets/ticket_1/catalog-session',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /team/members — passwordless creation & email', () => {
  it('creates member with auto-generated temporary password when password is omitted', async () => {
    mockTeamMemberFindUnique.mockResolvedValueOnce(null); // email uniqueness check
    mockTeamMemberCreate.mockResolvedValueOnce({
      id: 'tm_new',
      name: 'Rohan Verma',
      email: 'rohan@kanchuki.app',
      phone: '9876543210',
      role: 'MARKETING_AGENT',
      is_active: true,
      max_retailers: 100,
      referral_code: 'ROHAN1',
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/members',
      headers: { 'x-admin-key': 'test-admin-key', 'content-type': 'application/json' },
      payload: {
        name: 'Rohan Verma',
        email: 'rohan@kanchuki.app',
        phone: '9876543210',
        role: 'MARKETING_AGENT',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockTeamMemberCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Rohan Verma',
          email: 'rohan@kanchuki.app',
          password_hash: expect.any(String),
        }),
      }),
    );
    await app.close();
  });
});

describe('POST /team/otp/send & POST /team/otp/verify', () => {
  it('sends OTP and verifies successfully issuing a team JWT token', async () => {
    mockTeamMemberFindUnique.mockResolvedValueOnce(null);
    mockTeamMemberFindMany.mockResolvedValue([]);

    const mockMember = {
      id: 'tm_otp_user',
      name: 'Priya Sharma',
      email: 'priya@kanchuki.app',
      phone: '9876543211',
      role: 'SUPPORT_AGENT',
      is_active: true,
    };

    // Mock prisma.teamMember.findFirst
    // @ts-ignore
    const { prisma } = await import('@kanchuki/db');
    prisma.teamMember.findFirst = vi.fn().mockResolvedValue(mockMember);

    const app = await buildApp();

    // 1. Send OTP
    const sendRes = await app.inject({
      method: 'POST',
      url: '/v1/team/otp/send',
      payload: { identifier: '9876543211' },
    });
    expect(sendRes.statusCode).toBe(200);
    expect(sendRes.json().data.message).toBeDefined();

    // 2. Verify OTP (using dev test code 123456)
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/team/otp/verify',
      payload: { identifier: '9876543211', otp: '123456' },
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().data.token).toBeDefined();
    expect(verifyRes.json().data.team_member.name).toBe('Priya Sharma');

    await app.close();
  });
});

describe('POST /team/forgot-password & POST /team/reset-password', () => {
  it('sends password reset code and resets password successfully', async () => {
    const mockMember = {
      id: 'tm_reset_user',
      name: 'Vikram Singh',
      email: 'vikram@kanchuki.app',
      password_hash: 'old_hash',
      is_active: true,
    };

    mockTeamMemberFindUnique.mockResolvedValue(mockMember);
    mockTeamMemberUpdate.mockResolvedValue({ ...mockMember, password_hash: 'new_hash' });

    const app = await buildApp();

    // 1. Request forgot password
    const forgotRes = await app.inject({
      method: 'POST',
      url: '/v1/team/forgot-password',
      payload: { email: 'vikram@kanchuki.app' },
    });
    expect(forgotRes.statusCode).toBe(200);
    expect(forgotRes.json().data.message).toBeDefined();

    // 2. Reset password (using dev test code 123456)
    const resetRes = await app.inject({
      method: 'POST',
      url: '/v1/team/reset-password',
      payload: {
        email: 'vikram@kanchuki.app',
        reset_code: '123456',
        new_password: 'brand-new-secure-password',
      },
    });
    expect(resetRes.statusCode).toBe(200);
    expect(resetRes.json().data.message).toContain('Password reset successfully');
    expect(mockTeamMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tm_reset_user' },
        data: expect.objectContaining({ password_hash: expect.any(String) }),
      }),
    );

    await app.close();
  });
});
