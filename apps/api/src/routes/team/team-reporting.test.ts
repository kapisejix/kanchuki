/**
 * retailer-activation funnel — trial_to_active_rate is a cohort rate
 * (converted ÷ trials that have ended or paid), not active ÷ current trials.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const mockRetailerCount = vi.hoisted(() => vi.fn());
const mockTeamMemberFindUnique = vi.hoisted(() => vi.fn());
const mockTeamMemberTerritoryFindMany = vi.hoisted(() => vi.fn());
const mockVerifyTeamToken = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { count: mockRetailerCount },
    teamMember: { findUnique: mockTeamMemberFindUnique },
    teamMemberTerritory: { findMany: mockTeamMemberTerritoryFindMany },
  },
}));
vi.mock('../../plugins/team-auth.js', () => ({ verifyTeamToken: mockVerifyTeamToken }));
vi.mock('../admin.js', () => ({
  validAdminKey: vi.fn().mockReturnValue(false),
  verifyAdminSession: vi.fn().mockResolvedValue(false),
}));

import { teamReportingRoutes } from './team-reporting.js';

async function activation() {
  mockVerifyTeamToken.mockResolvedValue({ sub: 'tm_1', role: 'MARKETING_MANAGER' });
  mockTeamMemberFindUnique.mockResolvedValue({
    id: 'tm_1',
    role: 'MARKETING_MANAGER',
    is_active: true,
  });
  mockTeamMemberTerritoryFindMany.mockResolvedValue([]);
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(teamReportingRoutes, { prefix: '/v1/team' });
  await app.ready();
  const res = await app.inject({
    method: 'GET',
    url: '/v1/team/reporting/retailer-activation',
    headers: { authorization: 'Bearer t' },
  });
  return res.json().data;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /reporting/retailer-activation', () => {
  it('rate = converted / trial cohort, never above 100 even when active > trial', async () => {
    // Promise.all order: total, onboarded, trial, active, cancelled, converted, cohort
    for (const n of [50, 40, 2, 30, 5, 12, 20]) mockRetailerCount.mockResolvedValueOnce(n);
    const data = await activation();
    expect(data.trial_to_active_rate).toBe(60); // 12 / 20
  });

  it('is 0 with an empty cohort (no divide by zero)', async () => {
    for (const n of [3, 1, 3, 0, 0, 0, 0]) mockRetailerCount.mockResolvedValueOnce(n);
    const data = await activation();
    expect(data.trial_to_active_rate).toBe(0);
  });
});
