/**
 * GET /v1/team/tickets surfaces `setup_item` so a dashboard "Ask Kanchuki team" ask
 * (docs/tasks/pending/google-business-profile-and-setup-checklist.md Part C) is
 * recognisable in the existing queue — no new queue.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const m = vi.hoisted(() => ({
  ticketFindMany: vi.fn(),
  tmFindUnique: vi.fn(),
  tmTerritoryFindMany: vi.fn(),
  verifyTeamToken: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    supportTicket: { findMany: m.ticketFindMany },
    teamMember: { findUnique: m.tmFindUnique },
    teamMemberTerritory: { findMany: m.tmTerritoryFindMany },
  },
}));
vi.mock('../../plugins/team-auth.js', () => ({ verifyTeamToken: m.verifyTeamToken }));
vi.mock('../admin.js', () => ({
  validAdminKey: vi.fn().mockReturnValue(false),
  verifyAdminSession: vi.fn().mockResolvedValue(false),
}));
vi.mock('../admin-settings.js', () => ({ getCatalogUploadPromo: vi.fn() }));

import { teamTicketsRoutes } from './team-tickets.js';

beforeEach(() => {
  vi.clearAllMocks();
  m.verifyTeamToken.mockResolvedValue({ sub: 'tm_1', role: 'SUPPORT_MANAGER' });
  m.tmFindUnique.mockResolvedValue({ id: 'tm_1', role: 'SUPPORT_MANAGER', is_active: true });
  m.tmTerritoryFindMany.mockResolvedValue([{ territory_id: 't1' }]);
});

describe('GET /v1/team/tickets', () => {
  it('selects setup_item and returns it to the caller', async () => {
    m.ticketFindMany.mockResolvedValue([{ id: 'tk_1', setup_item: 'google_business' }]);
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    await app.register(teamTicketsRoutes, { prefix: '/v1/team' });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/team/tickets',
      headers: { authorization: 'Bearer valid-team-jwt' },
    });

    expect(res.statusCode).toBe(200);
    expect(m.ticketFindMany.mock.calls[0]?.[0]?.select).toMatchObject({ setup_item: true });
    expect(res.json().data[0].setup_item).toBe('google_business');
  });
});
