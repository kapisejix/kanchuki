import Fastify from 'fastify';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('@kanchuki/db', () => ({ prisma: { teamMember: { findUnique } } }));

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
  beforeEach(() => {
    findUnique.mockReset();
  });

  it('SUPER_ADMIN session JWT passes; legacy JWT without a role passes', async () => {
    expect(await verifyAdminSession(await signAdminSession('a@b.c', 'SUPER_ADMIN'))).toBe(true);
    expect(await verifyAdminSession(await signAdminSession('a@b.c'))).toBe(true);
  });

  it('ADMIN session JWT is refused', async () => {
    expect(await verifyAdminSession(await signAdminSession('a@b.c', 'ADMIN'))).toBe(false);
  });

  it('team token: role comes from the DB row, not the JWT claim', async () => {
    const token = await signTeamToken({ sub: 't1', role: 'SUPER_ADMIN' });
    findUnique.mockResolvedValue({ role: 'SUPER_ADMIN', is_active: true });
    expect(await verifyAdminSession(token)).toBe(true);
    for (const role of ['ADMIN', 'MARKETING_MANAGER', 'SUPPORT_MANAGER', 'SUPPORT_AGENT']) {
      findUnique.mockResolvedValue({ role, is_active: true });
      expect(await verifyAdminSession(token)).toBe(false);
    }
  });

  // Bug-hunt #2: a SUPER_ADMIN deactivated after login kept Super Admin over /v1/team for
  // the rest of the 12 h team JWT by sending it as x-admin-key.
  it('stale SUPER_ADMIN team token is refused once the member is deactivated or deleted', async () => {
    const token = await signTeamToken({ sub: 't1', role: 'SUPER_ADMIN' });
    findUnique.mockResolvedValue({ role: 'SUPER_ADMIN', is_active: false });
    expect(await verifyAdminSession(token)).toBe(false);
    findUnique.mockResolvedValue(null);
    expect(await verifyAdminSession(token)).toBe(false);
  });

  it('garbage is refused', async () => {
    expect(await verifyAdminSession('not-a-token')).toBe(false);
  });
});

// Bug-hunt #1: index.ts uses trustProxy: 1 in production. Pins the semantics it relies on:
// request.ip is the entry Railway's edge appended, not a client-sent X-Forwarded-For value.
describe('trustProxy hop count', () => {
  it('spoofed leftmost X-Forwarded-For is ignored with trustProxy: 1', async () => {
    const app = Fastify({ trustProxy: 1 });
    app.get('/ip', (req) => ({ ip: req.ip }));
    const res = await app.inject({
      url: '/ip',
      remoteAddress: '10.0.0.5',
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.1' },
    });
    expect(res.json().ip).toBe('198.51.100.1');
    await app.close();
  });
});
