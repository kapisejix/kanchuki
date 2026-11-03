import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Owner decision 2026-11-03: an ADMIN session opens Reports + Team Members (both read /v1/team).
// It must read everything and write nothing: only a Super Admin creates or edits members.
const { memberFindMany, memberFindUnique, memberCreate, memberUpdate } = vi.hoisted(() => ({
  memberFindMany: vi.fn().mockResolvedValue([]),
  memberFindUnique: vi.fn().mockResolvedValue(null),
  memberCreate: vi.fn(),
  memberUpdate: vi.fn(),
}));

vi.mock('@kanchuki/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kanchuki/db')>();
  return {
    ...actual,
    prisma: {
      ...actual.prisma,
      teamMember: {
        findMany: memberFindMany,
        findUnique: memberFindUnique,
        create: memberCreate,
        update: memberUpdate,
      },
      territory: { findMany: vi.fn().mockResolvedValue([]) },
      retailer: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
  };
});

import { errorHandler } from '../plugins/error-handler.js';
import { signAdminSession } from './admin-auth.js';
import { teamMembersRoutes } from './team/team-members.js';
import { teamReportingRoutes } from './team/team-reporting.js';

let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  process.env.ADMIN_API_KEY = 'test-admin-key';
  app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(teamMembersRoutes, { prefix: '/v1/team' });
  await app.register(teamReportingRoutes, { prefix: '/v1/team' });
  await app.ready();
});

afterAll(() => app.close());

const as = async (role: string) => ({ 'x-admin-key': await signAdminSession('a@b.c', role) });

describe('ADMIN session on /v1/team: reads everything, writes nothing', () => {
  it('lists every team member unscoped (not just its own)', async () => {
    memberFindMany.mockClear();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/team/members',
      headers: await as('ADMIN'),
    });
    expect(res.statusCode).toBe(200);
    expect(memberFindMany.mock.calls[0]?.[0].where).toEqual({}); // same as Super Admin
  });

  it('can read the reports', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/team/reporting/agents',
      headers: await as('ADMIN'),
    });
    expect(res.statusCode).toBe(200);
  });

  it('cannot create a member, in any role (incl. SUPER_ADMIN)', async () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'MARKETING_AGENT']) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/team/members',
        headers: await as('ADMIN'),
        payload: { name: 'X', email: 'new.member@example.com', role },
      });
      expect(res.statusCode, `create ${role}: ${res.body}`).toBe(403);
    }
    expect(memberCreate).not.toHaveBeenCalled();
  });

  it('cannot edit a member', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/team/members/m1',
      headers: await as('ADMIN'),
      payload: { is_active: false },
    });
    expect(res.statusCode).toBe(403);
    expect(memberUpdate).not.toHaveBeenCalled();
  });

  it('every write method is refused by the pre-handler itself, whatever the route checks', async () => {
    // Read-only must not depend on each route remembering a role check (security review).
    for (const [method, url] of [
      ['POST', '/v1/team/members'],
      ['PATCH', '/v1/team/members/m1'],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        headers: await as('ADMIN'),
        payload: {},
      });
      expect(res.statusCode, method).toBe(403);
      expect(res.body, method).toContain('read-only');
    }
  });

  it('SUPER_ADMIN is unchanged: can create', async () => {
    memberFindUnique.mockResolvedValueOnce(null);
    memberCreate.mockResolvedValueOnce({
      id: 'n1',
      name: 'X',
      email: 'new.member@example.com',
      phone: null,
      role: 'ADMIN',
      max_retailers: null,
      is_active: true,
      referral_code: null,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/members',
      headers: { 'x-admin-key': 'test-admin-key' },
      payload: { name: 'X', email: 'new.member@example.com', role: 'ADMIN' },
    });
    expect(res.statusCode).toBe(200);
  });
});
