import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { maskPhoneForRequest, staffCanAccess, supportDelegateCanAccess } from './auth.js';

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
    for (const [method, url] of [
      ['POST', '/v1/growth/ai-campaign'],
      ['GET', '/v1/growth/engagement'],
      ['GET', '/v1/growth/inventory-alerts'],
      ['POST', '/v1/growth/products/:id/descriptions'],
      ['POST', '/v1/growth/translate/message'],
      ['POST', '/v1/growth/products/:id/videos'],
      ['POST', '/v1/growth/products/:id/videos/upload-url'],
      ['POST', '/v1/growth/products/:id/video/generate'],
      ['DELETE', '/v1/growth/videos/:id'],
      ['GET', '/v1/retailers/reviews/store'],
    ] as const) {
      expect(m(method, url), `${method} ${url}`).toBe(true);
    }
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
    // Moved to Settings — owner-only: tax, account connections, marketplace sync.
    expect(m('GET', '/v1/growth/gst/summary')).toBe(false);
    expect(m('GET', '/v1/retailers/me/integrations')).toBe(false);
    expect(m('POST', '/v1/retailers/me/integrations/gmb')).toBe(false);
    expect(m('GET', '/v1/retailers/me/aggregators')).toBe(false);
  });
});

describe('scheduler routes (F-043)', () => {
  const m = (method: string, url: string) => staffCanAccess(method, url, 'manager');
  const s = (method: string, url: string) => staffCanAccess(method, url, 'salesperson');
  const base = '/v1/retailers/me/social/schedule';

  it('manager: views, edits a caption, skips/retries, pauses/resumes', () => {
    expect(m('GET', `${base}/plans`)).toBe(true);
    expect(m('GET', `${base}/plans/:id`)).toBe(true);
    expect(m('PATCH', `${base}/posts/:id`)).toBe(true);
    expect(m('PATCH', `${base}/plan-state/:id`)).toBe(true);
  });

  it('manager: cannot create, confirm, end a plan or edit slides', () => {
    expect(m('POST', `${base}/plans`)).toBe(false);
    expect(m('POST', `${base}/plans/:id/confirm`)).toBe(false);
    expect(m('POST', `${base}/plans/:id/end`)).toBe(false);
    expect(m('PATCH', `${base}/items/:id`)).toBe(false);
    expect(m('DELETE', `${base}/items/:id`)).toBe(false);
  });

  it('manager: reads status + template registry; every styling write is owner-only', () => {
    expect(m('GET', `${base}/status`)).toBe(true);
    expect(m('GET', `${base}/templates`)).toBe(true);
    expect(m('POST', `${base}/items/:id/style`)).toBe(false);
    expect(m('POST', `${base}/posts/:id/style`)).toBe(false);
    expect(m('POST', `${base}/plans/:id/style`)).toBe(false);
    expect(m('PATCH', `${base}/plans/:id/design`)).toBe(false);
  });

  it('reconnect / connect / disconnect stay owner-only for a manager', () => {
    expect(m('POST', '/v1/retailers/me/social/connect-native')).toBe(false);
    expect(m('POST', '/v1/retailers/me/social/accounts')).toBe(false);
    expect(m('DELETE', '/v1/retailers/me/social/accounts/:id')).toBe(false);
  });

  it('salesperson gets nothing', () => {
    expect(s('GET', `${base}/plans`)).toBe(false);
    expect(s('PATCH', `${base}/posts/:id`)).toBe(false);
    expect(s('PATCH', `${base}/plan-state/:id`)).toBe(false);
    expect(s('GET', `${base}/status`)).toBe(false);
  });

  it('no support-session scope reaches the scheduler', () => {
    for (const scope of ['DEMO', 'GROWTH', 'MAINTENANCE'] as const) {
      for (const [method, url] of [
        ['GET', `${base}/plans`],
        ['POST', `${base}/plans`],
        ['PATCH', `${base}/posts/:id`],
        ['PATCH', `${base}/plan-state/:id`],
      ] as const) {
        expect(supportDelegateCanAccess(method, url, scope), `${scope} ${method} ${url}`).toBe(
          false,
        );
      }
    }
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
