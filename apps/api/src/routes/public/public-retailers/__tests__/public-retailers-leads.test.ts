import { prisma } from '@kanchuki/db';
/**
 * POST /v1/public/retailers/:slug/leads
 *  - F-037 Phase 1: passport path also writes a STORE_VISIT CustomerInteraction.
 *  - H4-1 / RC-093: the passport path takes identity from the session cookie,
 *    never from a body-supplied customer_account_id.
 *  - H4-4 / RC-094: the unverified legacy form is create-only; it must not
 *    rewrite an existing customer's name, gender or consent.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../../plugins/error-handler.js';
import { publicRetailersLeadsRoutes } from '../public-retailers-leads.js';

const mockRetailerFindFirst = vi.hoisted(() => vi.fn());
const mockStoreVisitFindUnique = vi.hoisted(() => vi.fn());
const mockStoreVisitCreate = vi.hoisted(() => vi.fn());
const mockStoreVisitUpdate = vi.hoisted(() => vi.fn());
const mockStoreVisitUpdateMany = vi.hoisted(() => vi.fn());
const mockCustomerInteractionCreate = vi.hoisted(() => vi.fn());
const mockCustomerUpsert = vi.hoisted(() => vi.fn());
const mockConsentCreate = vi.hoisted(() => vi.fn());
const mockSession = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findFirst: mockRetailerFindFirst },
    customerStoreVisit: {
      findUnique: mockStoreVisitFindUnique,
      create: mockStoreVisitCreate,
      update: mockStoreVisitUpdate,
      updateMany: mockStoreVisitUpdateMany,
    },
    customerInteraction: { create: mockCustomerInteractionCreate },
    customer: { upsert: mockCustomerUpsert },
    consentEvent: { create: mockConsentCreate },
  },
  Prisma: {},
}));
vi.mock('../../passport/passport-helpers.js', () => ({ getPassportSession: mockSession }));
vi.mock('../../../../jobs/passport-welcome.js', () => ({
  dispatchWelcome: vi.fn().mockResolvedValue(undefined),
}));

function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.register(publicRetailersLeadsRoutes, { prefix: '/v1/public' });
  return app;
}

function sessionFor(overrides: Record<string, unknown> = {}) {
  return {
    customer_account_id: 'ca_1',
    customer_account: {
      id: 'ca_1',
      phone: '9876543210',
      name: 'Test',
      gender: null,
      profiling_enabled: true,
      deleted_at: null,
      ...overrides,
    },
  };
}

async function post(payload: object) {
  const app = buildApp();
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: '/v1/public/retailers/some-store/leads',
    headers: { 'content-type': 'application/json' },
    payload,
  });
  await app.close();
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRetailerFindFirst.mockResolvedValue({ id: 'r_1', is_suspended: false });
  mockSession.mockResolvedValue(sessionFor());
  mockStoreVisitCreate.mockResolvedValue({});
  mockStoreVisitFindUnique.mockResolvedValue(null);
  mockCustomerUpsert.mockResolvedValue({ id: 'c_1', name: 'Test' });
  mockConsentCreate.mockResolvedValue({});
  mockCustomerInteractionCreate.mockReturnValue({
    catch: (fn: () => void) => Promise.resolve().then(fn),
  });
});

describe('POST /v1/public/retailers/:slug/leads (passport path)', () => {
  it('records a STORE_VISIT interaction on a first-time visit', async () => {
    const res = await post({ share_contact: false });

    expect(res.statusCode).toBe(201);
    expect(mockCustomerInteractionCreate).toHaveBeenCalledWith({
      data: { customer_account_id: 'ca_1', retailer_id: 'r_1', type: 'STORE_VISIT' },
    });
  });

  it('does not record an interaction when profiling is disabled', async () => {
    mockSession.mockResolvedValue(sessionFor({ profiling_enabled: false }));

    const res = await post({ share_contact: false });

    expect(res.statusCode).toBe(201);
    expect(mockCustomerInteractionCreate).not.toHaveBeenCalled();
  });

  it('H4-1: a body customer_account_id with no session is 401 and writes nothing', async () => {
    mockSession.mockResolvedValue(null);

    const res = await post({ customer_account_id: 'ca_victim', share_contact: true });

    expect(res.statusCode).toBe(401);
    expect(mockCustomerUpsert).not.toHaveBeenCalled();
    expect(mockStoreVisitCreate).not.toHaveBeenCalled();
    expect(mockStoreVisitUpdateMany).not.toHaveBeenCalled();
    expect(mockConsentCreate).not.toHaveBeenCalled();
  });

  it('H4-1: share_contact alone with no session is 401, not a validation error', async () => {
    mockSession.mockResolvedValue(null);

    const res = await post({ share_contact: true });

    expect(res.statusCode).toBe(401);
    expect(mockCustomerUpsert).not.toHaveBeenCalled();
  });

  it('H4-1: a body id that differs from the session is ignored; only the session account is written', async () => {
    const res = await post({ customer_account_id: 'ca_victim', share_contact: true });

    expect(res.statusCode).toBe(201);
    expect(mockCustomerUpsert.mock.calls[0]?.[0].create.customer_account_id).toBe('ca_1');
    expect(mockConsentCreate.mock.calls[0]?.[0].data.customer_account_id).toBe('ca_1');
    expect(mockStoreVisitCreate.mock.calls[0]?.[0].data.customer_account_id).toBe('ca_1');
    expect(JSON.stringify(mockCustomerUpsert.mock.calls)).not.toContain('ca_victim');
  });
});

describe('POST /v1/public/retailers/:slug/leads (legacy form)', () => {
  const form = { name: 'Attacker', phone: '9123456789', gender: 'MALE', consent: true };

  it('H4-4: an existing phone is left untouched (empty update)', async () => {
    const res = await post(form);

    expect(res.statusCode).toBe(201);
    expect(mockCustomerUpsert.mock.calls[0]?.[0].update).toEqual({});
  });

  it('a new phone is still created with consent and QR_SCAN source', async () => {
    await post(form);

    const { create } = mockCustomerUpsert.mock.calls[0]?.[0] ?? {};
    expect(create).toMatchObject({
      retailer_id: 'r_1',
      name: 'Attacker',
      gender: 'MALE',
      consent_given: true,
      source: 'QR_SCAN',
    });
  });
});
