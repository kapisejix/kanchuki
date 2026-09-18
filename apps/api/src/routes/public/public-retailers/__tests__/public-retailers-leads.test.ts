import { prisma } from '@kanchuki/db';
/**
 * F-037 Phase 1: POST /v1/public/retailers/:slug/leads (passport path) now
 * also writes a STORE_VISIT CustomerInteraction row alongside the existing
 * CustomerStoreVisit upsert. Covers only that new behavior — the legacy
 * form path and share_contact flow are pre-existing and untouched.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../../plugins/error-handler.js';
import { publicRetailersLeadsRoutes } from '../public-retailers-leads.js';

const mockRetailerFindFirst = vi.hoisted(() => vi.fn());
const mockCustomerAccountFindUnique = vi.hoisted(() => vi.fn());
const mockStoreVisitFindUnique = vi.hoisted(() => vi.fn());
const mockStoreVisitCreate = vi.hoisted(() => vi.fn());
const mockStoreVisitUpdate = vi.hoisted(() => vi.fn());
const mockCustomerInteractionCreate = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findFirst: mockRetailerFindFirst },
    customerAccount: { findUnique: mockCustomerAccountFindUnique },
    customerStoreVisit: {
      findUnique: mockStoreVisitFindUnique,
      create: mockStoreVisitCreate,
      update: mockStoreVisitUpdate,
    },
    customerInteraction: { create: mockCustomerInteractionCreate },
  },
  Prisma: {},
}));

function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.register(publicRetailersLeadsRoutes, { prefix: '/v1/public' });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRetailerFindFirst.mockResolvedValue({ id: 'r_1', is_suspended: false });
  mockCustomerAccountFindUnique.mockResolvedValue({
    id: 'ca_1',
    phone: '9876543210',
    name: 'Test',
    gender: null,
    profiling_enabled: true,
  });
  mockStoreVisitCreate.mockResolvedValue({});
  mockCustomerInteractionCreate.mockReturnValue({
    catch: (fn: () => void) => Promise.resolve().then(fn),
  });
});

describe('POST /v1/public/retailers/:slug/leads (passport path)', () => {
  it('records a STORE_VISIT interaction on a first-time visit', async () => {
    mockStoreVisitFindUnique.mockResolvedValue(null);
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/retailers/some-store/leads',
      headers: { 'content-type': 'application/json' },
      payload: { customer_account_id: 'ca_1', share_contact: false },
    });

    expect(res.statusCode).toBe(201);
    expect(mockCustomerInteractionCreate).toHaveBeenCalledWith({
      data: { customer_account_id: 'ca_1', retailer_id: 'r_1', type: 'STORE_VISIT' },
    });
  });

  it('does not record an interaction when profiling is disabled', async () => {
    mockCustomerAccountFindUnique.mockResolvedValue({
      id: 'ca_1',
      phone: '9876543210',
      name: 'Test',
      gender: null,
      profiling_enabled: false,
    });
    mockStoreVisitFindUnique.mockResolvedValue(null);
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/retailers/some-store/leads',
      headers: { 'content-type': 'application/json' },
      payload: { customer_account_id: 'ca_1', share_contact: false },
    });

    expect(res.statusCode).toBe(201);
    expect(mockCustomerInteractionCreate).not.toHaveBeenCalled();
  });
});
