import { beforeAll, describe, expect, it } from 'vitest';
import { signTeamToken } from '../plugins/team-auth.js';
import { signAdminSession, verifyAdminSession } from './admin-auth.js';

// RC-161: verifyAdminSession's only caller (teamAuthPreHandler) turns a pass into unscoped
// Super Admin over /v1/team, including creating SUPER_ADMIN members. Now that a real ADMIN
// role exists, an ADMIN session must NOT pass it.
describe('verifyAdminSession grants /v1/team Super Admin to SUPER_ADMIN only', () => {
  beforeAll(() => {
    process.env.ADMIN_API_KEY = 'test-admin-key';
    process.env.TEAM_JWT_SECRET = 'test-team-secret';
  });

  it('SUPER_ADMIN session JWT passes; legacy JWT without a role passes', async () => {
    expect(await verifyAdminSession(await signAdminSession('a@b.c', 'SUPER_ADMIN'))).toBe(true);
    expect(await verifyAdminSession(await signAdminSession('a@b.c'))).toBe(true);
  });

  it('ADMIN session JWT is refused', async () => {
    expect(await verifyAdminSession(await signAdminSession('a@b.c', 'ADMIN'))).toBe(false);
  });

  it('team token: SUPER_ADMIN passes, ADMIN and every other role are refused', async () => {
    expect(await verifyAdminSession(await signTeamToken({ sub: 't1', role: 'SUPER_ADMIN' }))).toBe(
      true,
    );
    for (const role of ['ADMIN', 'MARKETING_MANAGER', 'SUPPORT_MANAGER', 'SUPPORT_AGENT']) {
      expect(await verifyAdminSession(await signTeamToken({ sub: 't1', role }))).toBe(false);
    }
  });

  it('garbage is refused', async () => {
    expect(await verifyAdminSession('not-a-token')).toBe(false);
  });
});
