// F-044 E3 — cross-collection Enquiries inbox + first-to-tap Take.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { collectionRoutes } from './collections.js';

const db = vi.hoisted(() => ({
  enquiryFindMany: vi.fn(),
  enquiryFindFirst: vi.fn(),
  enquiryCount: vi.fn(),
  enquiryUpdateMany: vi.fn(),
  staffFindMany: vi.fn(),
  staffFindFirst: vi.fn(),
  retailerFindUnique: vi.fn(),
  productFindMany: vi.fn(),
  collectionFindFirst: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    collectionEnquiry: {
      findMany: db.enquiryFindMany,
      findFirst: db.enquiryFindFirst,
      count: db.enquiryCount,
      updateMany: db.enquiryUpdateMany,
    },
    staff: { findMany: db.staffFindMany, findFirst: db.staffFindFirst },
    retailer: { findUnique: db.retailerFindUnique },
    product: { findMany: db.productFindMany },
    collection: { findFirst: db.collectionFindFirst },
  },
  vaultDelete: vi.fn(),
}));

const PHONE = '9876543210';
const STAFF = {
  manager: { id: 'stf_m', name: 'Meena' },
  salesperson: { id: 'stf_s', name: 'Sunil' },
};
type Actor = 'owner' | 'manager' | 'salesperson' | 'support';

async function call(
  actor: Actor,
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: object,
  retailerId = 'ret_1',
) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('staffId', null);
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = retailerId;
    if (actor === 'manager' || actor === 'salesperson') {
      request.staffRole = actor;
      request.staffId = STAFF[actor].id;
    }
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
  const res = await app.inject({ method, url, payload });
  await app.close();
  return res;
}

// In-memory row: updateMany's CAS behaves like Postgres — only one writer can
// claim a still-null assignee.
let row: { id: string; retailer_id: string; assigned_staff_id: string | null };

beforeEach(() => {
  vi.clearAllMocks();
  row = { id: 'enq_1', retailer_id: 'ret_1', assigned_staff_id: null };
  db.enquiryUpdateMany.mockImplementation(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hit =
        where.id === row.id &&
        where.retailer_id === row.retailer_id &&
        (!('assigned_staff_id' in where) || where.assigned_staff_id === row.assigned_staff_id);
      if (hit) row = { ...row, ...(data as Partial<typeof row>) };
      return { count: hit ? 1 : 0 };
    },
  );
  db.enquiryFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    where.id === row.id && where.retailer_id === row.retailer_id
      ? { assigned_staff_id: row.assigned_staff_id }
      : null,
  );
  db.staffFindMany.mockImplementation(async ({ where }: { where: { id?: { in: string[] } } }) =>
    Object.values(STAFF).filter((s) => !where.id || where.id.in.includes(s.id)),
  );
  db.staffFindFirst.mockImplementation(
    async ({ where }: { where: { id: string; retailer_id: string } }) =>
      where.retailer_id === 'ret_1'
        ? (Object.values(STAFF).find((s) => s.id === where.id) ?? null)
        : null,
  );
  db.retailerFindUnique.mockResolvedValue({ owner_name: 'Ritu' });
  db.productFindMany.mockResolvedValue([
    { id: 'p1', name: 'Pink suit', photos: [{ url: 'https://cdn/p1.jpg' }] },
    { id: 'p2', name: null, photos: [] },
  ]);
  db.enquiryCount.mockResolvedValue(3);
  const collection = { id: 'c1', title: 'Festive' };
  db.enquiryFindMany.mockResolvedValue([
    {
      id: 'e1',
      customer_name: 'Asha',
      customer_phone: PHONE,
      status: 'NEW',
      product_id: 'p1',
      product_ids: ['p1', 'p2'],
      assigned_staff_id: 'stf_m',
      collection,
    },
    {
      id: 'e2',
      customer_name: null,
      customer_phone: PHONE,
      status: 'SEEN',
      product_id: 'p1',
      product_ids: [],
      assigned_staff_id: 'ret_1',
      collection,
    },
    {
      id: 'e3',
      customer_name: null,
      customer_phone: null,
      status: 'NEW',
      product_id: null,
      product_ids: [],
      assigned_staff_id: null,
      collection,
    },
  ]);
});

describe('GET /collections/enquiries', () => {
  it('lists this retailer only, newest first, never routed to /:id', async () => {
    const res = await call('owner', 'GET', '/v1/collections/enquiries');
    expect(res.statusCode).toBe(200);
    const q = db.enquiryFindMany.mock.calls[0]![0];
    expect(q.where.retailer_id).toBe('ret_1');
    expect(q.orderBy[0]).toEqual({ created_at: 'desc' });
    expect(db.collectionFindFirst).not.toHaveBeenCalled();
    expect(db.productFindMany.mock.calls[0]![0].where.retailer_id).toBe('ret_1');
  });

  it('returns products (legacy product_id fallback) and assigned_to names', async () => {
    const [e1, e2, e3] = (await call('owner', 'GET', '/v1/collections/enquiries')).json().data;
    expect(e1.products).toEqual([
      { id: 'p1', name: 'Pink suit', photo_url: 'https://cdn/p1.jpg' },
      { id: 'p2', name: null, photo_url: null },
    ]);
    expect(e2.products.map((p: { id: string }) => p.id)).toEqual(['p1']);
    expect(e3.products).toEqual([]);
    expect(e1.assigned_to).toEqual({ id: 'stf_m', name: 'Meena' });
    expect(e2.assigned_to).toEqual({ id: 'ret_1', name: 'Ritu' });
    expect(e3.assigned_to).toBeNull();
  });

  it.each(['manager', 'salesperson', 'support'] as const)(
    'masks the phone for %s',
    async (actor) => {
      const body = (await call(actor, 'GET', '/v1/collections/enquiries')).body;
      expect(body).not.toContain(PHONE);
      expect(JSON.parse(body).data[0].customer_phone).toBe('98•••••210');
    },
  );

  it('owner sees the full number', async () => {
    const res = await call('owner', 'GET', '/v1/collections/enquiries');
    expect(res.json().data[0].customer_phone).toBe(PHONE);
  });

  it('assignee list only for owner + manager', async () => {
    const m = await call('manager', 'GET', '/v1/collections/enquiries');
    expect(m.json().assignees).toEqual(Object.values(STAFF));
    const s = await call('salesperson', 'GET', '/v1/collections/enquiries');
    expect(s.json().assignees).toBeUndefined();
  });
});

describe('GET /collections/enquiries/unread-count', () => {
  it('counts NEW only for this retailer; payload is just the count', async () => {
    const res = await call('salesperson', 'GET', '/v1/collections/enquiries/unread-count');
    expect(res.statusCode).toBe(200);
    expect(db.enquiryCount).toHaveBeenCalledWith({
      where: { retailer_id: 'ret_1', status: 'NEW' },
    });
    expect(res.json()).toEqual({ data: { count: 3 } });
  });
});

describe('POST /collections/enquiries/:id/take', () => {
  const take = (actor: Actor, retailerId?: string) =>
    call(actor, 'POST', '/v1/collections/enquiries/enq_1/take', undefined, retailerId);

  it('concurrent take: one 200, one 409 ENQUIRY_TAKEN naming the winner', async () => {
    const res = await Promise.all([take('manager'), take('salesperson')]);
    expect(res.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const lost = res.find((r) => r.statusCode === 409)!.json().error;
    expect(lost.code).toBe('ENQUIRY_TAKEN');
    expect(lost.message).toMatch(/^Being handled by (Meena|Sunil)$/);
  });

  it('same actor twice is 200 both times', async () => {
    expect((await take('salesperson')).statusCode).toBe(200);
    expect((await take('salesperson')).statusCode).toBe(200);
    expect(row.assigned_staff_id).toBe('stf_s');
  });

  it('owner take stores the retailer id, named by owner_name', async () => {
    const res = await take('owner');
    expect(res.statusCode).toBe(200);
    expect(row.assigned_staff_id).toBe('ret_1');
    expect(res.json().data.assigned_to).toEqual({ id: 'ret_1', name: 'Ritu' });
  });

  it("another retailer's enquiry is 404 and untouched", async () => {
    expect((await take('manager', 'ret_2')).statusCode).toBe(404);
    expect(row.assigned_staff_id).toBeNull();
  });

  it('support delegate cannot take (no identity to own it)', async () => {
    expect((await take('support')).statusCode).toBe(403);
    expect(db.enquiryUpdateMany).not.toHaveBeenCalled();
  });
});

describe('PATCH /collections/enquiries/:id/assign', () => {
  const assign = (actor: Actor, staff_id: string, retailerId?: string) =>
    call(actor, 'PATCH', '/v1/collections/enquiries/enq_1/assign', { staff_id }, retailerId);

  it.each(['salesperson', 'support'] as const)('%s gets 403', async (actor) => {
    expect((await assign(actor, 'stf_m')).statusCode).toBe(403);
    expect(db.enquiryUpdateMany).not.toHaveBeenCalled();
  });

  it('manager reassigns a taken enquiry', async () => {
    row.assigned_staff_id = 'stf_m';
    const res = await assign('manager', 'stf_s');
    expect(res.statusCode).toBe(200);
    expect(row.assigned_staff_id).toBe('stf_s');
    expect(res.json().data.assigned_to).toEqual({ id: 'stf_s', name: 'Sunil' });
  });

  it('owner can assign to self', async () => {
    expect((await assign('owner', 'ret_1')).statusCode).toBe(200);
    expect(row.assigned_staff_id).toBe('ret_1');
  });

  it("rejects a staff id that isn't this shop's active team", async () => {
    expect((await assign('owner', 'stf_other')).statusCode).toBe(422);
    expect(db.enquiryUpdateMany).not.toHaveBeenCalled();
  });

  it("another retailer's enquiry is 404", async () => {
    expect((await assign('owner', 'ret_2', 'ret_2')).statusCode).toBe(404);
  });
});
