import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { maskPhoneForRequest, staffCanAccess } from './auth.js';

describe('manager allowlist', () => {
  const m = (method: string, url: string) => staffCanAccess(method, url, 'manager');
  it('allows growth, social post/track, analytics, masked customer reads', () => {
    expect(m('POST', '/v1/growth/campaigns')).toBe(true);
    expect(m('POST', '/v1/growth/campaigns/:id/preview')).toBe(true);
    expect(m('POST', '/v1/growth/campaigns/:id/send')).toBe(true);
    expect(m('POST', '/v1/growth/reactivation-suggestions')).toBe(true);
    expect(m('POST', '/v1/retailers/me/social/posts')).toBe(true);
    expect(m('GET', '/v1/retailers/me/social/accounts')).toBe(true);
    expect(m('GET', '/v1/retailers/me/stats')).toBe(true);
    expect(m('GET', '/v1/customers')).toBe(true);
    expect(m('GET', '/v1/customers/:id')).toBe(true);
  });
  it('still blocks number-returning, destructive and owner-only surfaces', () => {
    expect(m('POST', '/v1/growth/campaigns/:id/delete-all')).toBe(false);
    expect(m('POST', '/v1/retailers/me/social/connect-native')).toBe(false);
    expect(m('POST', '/v1/retailers/me/social/accounts')).toBe(false);
    expect(m('DELETE', '/v1/retailers/me/social/accounts/:id')).toBe(false);
    expect(m('PUT', '/v1/customers/:id')).toBe(false);
    expect(m('DELETE', '/v1/customers/:id')).toBe(false);
    expect(m('PATCH', '/v1/retailers/me')).toBe(false);
    expect(m('GET', '/v1/billing/subscription')).toBe(false);
    expect(m('GET', '/v1/staff')).toBe(false);
  });
});

describe('salesperson allowlist', () => {
  const s = (method: string, url: string) => staffCanAccess(method, url, 'salesperson');
  it('view catalog, add customer, read collections to share', () => {
    expect(s('GET', '/v1/products')).toBe(true);
    expect(s('POST', '/v1/customers')).toBe(true);
    expect(s('GET', '/v1/collections')).toBe(true);
  });
  it('nothing else', () => {
    expect(s('POST', '/v1/collections')).toBe(false);
    expect(s('GET', '/v1/customers')).toBe(false);
    expect(s('POST', '/v1/growth/campaigns')).toBe(false);
    expect(s('POST', '/v1/growth/campaigns/:id/send')).toBe(false);
    expect(s('POST', '/v1/retailers/me/social/posts')).toBe(false);
  });
});

describe('maskPhoneForRequest', () => {
  const req = (staffRole: string | null) => ({ staffRole }) as unknown as FastifyRequest;
  it('owner sees the full number', () => {
    expect(maskPhoneForRequest(req(null), '9876543210')).toBe('9876543210');
  });
  it('staff get a masked number with no middle digits', () => {
    const out = maskPhoneForRequest(req('manager'), '9876543210');
    expect(out).toBe('98•••••210');
    expect(out).not.toContain('7654');
  });
});
