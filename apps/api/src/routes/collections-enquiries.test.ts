// RC-066 — enquiries embedded in GET /collections/:id and returned by
// PATCH /collections/:id/enquiries/:enquiryId carried the customer's raw phone
// to every staff role and delegate the /v1/collections allowlist lets in. The
// number must be masked server-side for everyone except the real owner.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { collectionRoutes } from './collections.js';

const {
  mockCollectionFindFirst,
  mockRetailerFindUnique,
  mockEnquiryUpdateMany,
  mockEnquiryFindUnique,
} = vi.hoisted(() => ({
  mockCollectionFindFirst: vi.fn(),
  mockRetailerFindUnique: vi.fn(),
  mockEnquiryUpdateMany: vi.fn(),
  mockEnquiryFindUnique: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    collection: { findFirst: mockCollectionFindFirst },
    retailer: { findUnique: mockRetailerFindUnique },
    collectionEnquiry: { updateMany: mockEnquiryUpdateMany, findUnique: mockEnquiryFindUnique },
  },
  vaultDelete: vi.fn(),
}));

const PHONE = '9876543210';
const ENQUIRY = { id: 'enq_1', customer_name: 'Asha', customer_phone: PHONE, status: 'NEW' };

type Actor = 'owner' | 'manager' | 'salesperson' | 'support';

async function buildApp(actor: Actor) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = 'ret_1';
    request.staffRole = actor === 'manager' || actor === 'salesperson' ? actor : null;
    if (actor === 'support') {
      request.supportDelegate = {
        team_member_id: 'tm_1',
        ticket_id: 't_1',
        grant_id: 'g_1',
        scope: 'GROWTH',
      } as typeof request.supportDelegate;
    }
  });
  await app.register(collectionRoutes, { prefix: '/v1/collections' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRetailerFindUnique.mockResolvedValue({ public_slug: null });
  mockCollectionFindFirst.mockResolvedValue({
    id: 'col_1',
    slug: 'festive',
    products: [],
    enquiries: [ENQUIRY],
    _count: { views: 0 },
  });
  mockEnquiryUpdateMany.mockResolvedValue({ count: 1 });
  mockEnquiryFindUnique.mockResolvedValue({ ...ENQUIRY, status: 'SEEN' });
});

async function getPhone(actor: Actor) {
  const app = await buildApp(actor);
  const res = await app.inject({ method: 'GET', url: '/v1/collections/col_1' });
  await app.close();
  expect(res.statusCode).toBe(200);
  return res.json().data.enquiries[0].customer_phone as string;
}

async function patchPhone(actor: Actor) {
  const app = await buildApp(actor);
  const res = await app.inject({
    method: 'PATCH',
    url: '/v1/collections/col_1/enquiries/enq_1',
    payload: { status: 'SEEN' },
  });
  await app.close();
  expect(res.statusCode).toBe(200);
  return res.json().data.customer_phone as string;
}

describe('RC-066 — enquiry phone masking', () => {
  it.each(['manager', 'salesperson', 'support'] as const)(
    'GET /collections/:id masks the phone for %s',
    async (actor) => {
      const phone = await getPhone(actor);
      expect(phone).not.toBe(PHONE);
      expect(phone).toBe('98•••••210');
    },
  );

  it.each(['manager', 'salesperson', 'support'] as const)(
    'PATCH enquiry status masks the phone for %s',
    async (actor) => {
      expect(await patchPhone(actor)).toBe('98•••••210');
    },
  );

  it('the owner still sees the full number on GET and PATCH', async () => {
    expect(await getPhone('owner')).toBe(PHONE);
    expect(await patchPhone('owner')).toBe(PHONE);
  });

  it('a missing phone stays null', async () => {
    mockEnquiryFindUnique.mockResolvedValue({ ...ENQUIRY, customer_phone: null });
    const app = await buildApp('manager');
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/collections/col_1/enquiries/enq_1',
      payload: { status: 'SEEN' },
    });
    expect(res.json().data.customer_phone).toBeNull();
    await app.close();
  });
});
