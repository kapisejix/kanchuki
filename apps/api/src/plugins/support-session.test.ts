import type { FastifyRequest } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { isRealOwner, supportDelegateCanAccess, supportGrantLive } from './auth.js';
import {
  signCatalogUploadToken,
  signSupportToken,
  verifyCatalogUploadToken,
  verifySupportToken,
  verifyTeamToken,
} from './team-auth.js';

const claims = {
  retailer_id: 'ret_1',
  ticket_id: 'tkt_1',
  team_member_id: 'tm_1',
  grant_id: 'g_1',
  scope: 'GROWTH' as const,
};
const inOneHour = () => new Date(Date.now() + 3_600_000);

function grant(over: Record<string, unknown> = {}) {
  return {
    status: 'APPROVED',
    expires_at: inOneHour(),
    retailer_id: 'ret_1',
    team_member_id: 'tm_1',
    ticket_id: 'tkt_1',
    scope: 'GROWTH',
    ticket: { status: 'ASSIGNED', assigned_to_id: 'tm_1' },
    team_member: { is_active: true },
    retailer: { is_suspended: false, deleted_at: null },
    ...over,
  };
}

describe('support session allowlist', () => {
  const writes = ['POST', 'PATCH', 'PUT', 'DELETE'];

  it('DEMO scope is read-only', () => {
    for (const path of [
      '/v1/products',
      '/v1/collections',
      '/v1/customers',
      '/v1/growth/campaigns',
    ]) {
      for (const m of writes) expect(supportDelegateCanAccess(m, path, 'DEMO')).toBe(false);
    }
    expect(supportDelegateCanAccess('GET', '/v1/products', 'DEMO')).toBe(true);
    expect(supportDelegateCanAccess('GET', '/v1/customers', 'DEMO')).toBe(true);
  });

  it('GROWTH can run campaigns but never billing/team/delete/connect', () => {
    expect(supportDelegateCanAccess('POST', '/v1/growth/campaigns', 'GROWTH')).toBe(true);
    expect(supportDelegateCanAccess('POST', '/v1/retailers/me/social/posts', 'GROWTH')).toBe(true);
    for (const path of [
      '/v1/billing/subscribe',
      '/v1/staff',
      '/v1/team/members',
      '/v1/retailers/me/social/connect',
      '/v1/retailers/me/whatsapp-api',
      '/v1/support-sessions/x/approve',
    ]) {
      for (const m of ['GET', ...writes]) {
        expect(supportDelegateCanAccess(m, path, 'GROWTH'), `${m} ${path}`).toBe(false);
      }
    }
    expect(supportDelegateCanAccess('DELETE', '/v1/retailers/me', 'GROWTH')).toBe(false);
    expect(supportDelegateCanAccess('DELETE', '/v1/products', 'GROWTH')).toBe(false);
  });

  it('MAINTENANCE edits profile, reads WhatsApp config, cannot delete the account', () => {
    expect(supportDelegateCanAccess('PUT', '/v1/retailers/me', 'MAINTENANCE')).toBe(true);
    expect(supportDelegateCanAccess('GET', '/v1/retailers/me/whatsapp-api', 'MAINTENANCE')).toBe(
      true,
    );
    expect(supportDelegateCanAccess('PATCH', '/v1/retailers/me/whatsapp-api', 'MAINTENANCE')).toBe(
      false,
    );
    expect(supportDelegateCanAccess('DELETE', '/v1/retailers/me', 'MAINTENANCE')).toBe(false);
    expect(supportDelegateCanAccess('POST', '/v1/billing/subscribe', 'MAINTENANCE')).toBe(false);
  });
});

describe('supportGrantLive', () => {
  it('accepts a fresh approved grant', () => {
    expect(supportGrantLive(grant(), claims)).toBe(true);
  });

  it.each([
    ['null grant', null],
    ['pending', grant({ status: 'PENDING' })],
    ['revoked', grant({ status: 'REVOKED' })],
    ['denied', grant({ status: 'DENIED' })],
    ['expired', grant({ expires_at: new Date(Date.now() - 1000) })],
    ['no expiry', grant({ expires_at: null })],
    ['ticket reassigned', grant({ ticket: { status: 'ASSIGNED', assigned_to_id: 'tm_2' } })],
    ['ticket resolved', grant({ ticket: { status: 'RESOLVED', assigned_to_id: 'tm_1' } })],
    ['staff deactivated', grant({ team_member: { is_active: false } })],
    ['retailer suspended', grant({ retailer: { is_suspended: true, deleted_at: null } })],
    ['retailer deleted', grant({ retailer: { is_suspended: false, deleted_at: new Date() } })],
    ['scope mismatch', grant({ scope: 'DEMO' })],
    ['retailer mismatch', grant({ retailer_id: 'ret_2' })],
  ])('rejects %s', (_name, g) => {
    expect(supportGrantLive(g as Parameters<typeof supportGrantLive>[0], claims)).toBe(false);
  });
});

describe('isRealOwner', () => {
  it('is false for a support delegate', () => {
    const req = {
      staffRole: null,
      catalogDelegate: null,
      supportDelegate: { team_member_id: 'tm_1', ticket_id: 't', grant_id: 'g', scope: 'GROWTH' },
    } as unknown as FastifyRequest;
    expect(isRealOwner(req)).toBe(false);
  });
});

describe('support token', () => {
  beforeAll(() => {
    process.env.TEAM_JWT_SECRET = 'test-secret-test-secret-test-secret';
  });

  it('round-trips and carries the scope', async () => {
    const token = await signSupportToken(claims, inOneHour());
    expect(await verifySupportToken(token)).toEqual(claims);
  });

  it('is not accepted as a catalog or team token, and vice versa', async () => {
    const support = await signSupportToken(claims, inOneHour());
    expect(await verifyCatalogUploadToken(support)).toBeNull();
    expect(await verifyTeamToken(support)).toBeNull();

    const catalog = await signCatalogUploadToken({
      retailer_id: 'ret_1',
      ticket_id: 'tkt_1',
      team_member_id: 'tm_1',
    });
    expect(await verifySupportToken(catalog)).toBeNull();
  });

  it('expires at the grant expiry', async () => {
    const token = await signSupportToken(claims, new Date(Date.now() - 5000));
    expect(await verifySupportToken(token)).toBeNull();
  });
});
