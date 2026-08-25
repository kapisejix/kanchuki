/**
 * Team survey route — auth gate + AuditLog write (2026-08-25).
 *
 * Validates the fix for the missing teamAuthPreHandler hook: without it
 * request.teamMember was never populated and every request returned 403.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

// ─── Mocks ───────────────────────────────────────────────────────
const mockAuditLogCreate = vi.hoisted(() => vi.fn());
const mockTeamMemberFindUnique = vi.hoisted(() => vi.fn());
const mockTeamMemberTerritoryFindMany = vi.hoisted(() => vi.fn());
const mockVerifyTeamToken = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    auditLog: { create: mockAuditLogCreate },
    teamMember: { findUnique: mockTeamMemberFindUnique },
    teamMemberTerritory: { findMany: mockTeamMemberTerritoryFindMany },
  },
}));

vi.mock('../../plugins/team-auth.js', () => ({
  verifyTeamToken: mockVerifyTeamToken,
}));

// Mock validAdminKey / verifyAdminSession so admin-key auth path works
vi.mock('../admin.js', () => ({
  validAdminKey: vi.fn().mockReturnValue(false),
  verifyAdminSession: vi.fn().mockResolvedValue(false),
}));

import { teamSurveyRoutes } from './team-survey.js';

// ─── Helpers ─────────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(teamSurveyRoutes, { prefix: '/v1/team' });
  await app.ready();
  return app;
}

function mockTeamAuth(overrides?: { id?: string; role?: string }) {
  const id = overrides?.id ?? 'tm_test_1';
  const role = overrides?.role ?? 'MARKETING_AGENT';
  mockVerifyTeamToken.mockResolvedValue({ sub: id, role });
  mockTeamMemberFindUnique.mockResolvedValue({ id, role, is_active: true });
  mockTeamMemberTerritoryFindMany.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuditLogCreate.mockResolvedValue({ id: 'audit_1' });
});

// ─── Tests ───────────────────────────────────────────────────────

describe('POST /v1/team/survey', () => {
  it('rejects unauthenticated requests with 401', async () => {
    mockVerifyTeamToken.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/survey',
      payload: { storeName: 'Test Store' },
    });

    expect(res.statusCode).toBe(401);
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects requests with no Authorization header', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/survey',
      payload: { storeName: 'Test Store' },
    });

    expect(res.statusCode).toBe(401);
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('writes an AuditLog entry with correct shape for a valid team member', async () => {
    mockTeamAuth({ id: 'tm_ash', role: 'MARKETING_AGENT' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/survey',
      headers: { authorization: 'Bearer valid-team-jwt' },
      payload: {
        locale: 'hi',
        storeName: 'Sharma Sarees',
        ownerName: 'Rajesh',
        city: 'Jaipur',
        category: ['ethnic', 'womens'],
        pain_photoTime: '4',
        contactPhone: '9876543210',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ data: { received: true } });

    expect(mockAuditLogCreate).toHaveBeenCalledTimes(1);
    const call = mockAuditLogCreate.mock.calls[0][0];
    expect(call.data).toMatchObject({
      actor_id: 'tm_ash',
      actor_type: 'team_member',
      action: 'SURVEY_SUBMIT',
      resource_type: 'RetailerSurvey',
    });
    expect(call.data.metadata).toMatchObject({
      locale: 'hi',
      storeName: 'Sharma Sarees',
      ownerName: 'Rajesh',
      city: 'Jaipur',
      category: ['ethnic', 'womens'],
      pain_photoTime: '4',
      contactPhone: '9876543210',
    });
    expect(call.data.ip_address).toBeDefined();
    await app.close();
  });

  it('defaults locale to "en" when omitted', async () => {
    mockTeamAuth();

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/survey',
      headers: { authorization: 'Bearer valid-team-jwt' },
      payload: { storeName: 'Minimal Store' },
    });

    expect(res.statusCode).toBe(201);
    const call = mockAuditLogCreate.mock.calls[0][0];
    expect(call.data.metadata.locale).toBe('en');
    await app.close();
  });

  it('rejects invalid locale values', async () => {
    mockTeamAuth();

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/team/survey',
      headers: { authorization: 'Bearer valid-team-jwt' },
      payload: { locale: 'fr', storeName: 'Test' },
    });

    expect(res.statusCode).toBe(422);
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('accepts all three valid locales (en, hi, pa)', async () => {
    for (const locale of ['en', 'hi', 'pa'] as const) {
      mockTeamAuth();
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/v1/team/survey',
        headers: { authorization: 'Bearer valid-team-jwt' },
        payload: { locale, storeName: `Store ${locale}` },
      });
      expect(res.statusCode).toBe(201);
      await app.close();
      vi.clearAllMocks();
      mockAuditLogCreate.mockResolvedValue({ id: 'audit_1' });
    }
  });
});
