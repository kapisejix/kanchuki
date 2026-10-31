// H2-7 — delete is a soft delete but the unique index (retailer_id, phone) still covers the
// deleted row, and the duplicate check skips it, so re-adding a deleted number hit P2002 -> 500.
// Policy: only the owner may remove a customer, so only the owner may bring one back; staff get
// the same 422 as for an active duplicate (no different answer for the H2-6 probe, no undo).
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { customerRoutes } from './customers.js';

const { mockFindFirst, mockCreate, mockUpdate, mockAudit } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockAudit: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    customer: { findFirst: mockFindFirst, create: mockCreate, update: mockUpdate },
    auditLog: { create: mockAudit },
  },
  vaultDelete: vi.fn(),
}));

const row = (deleted_at: Date | null) => ({
  id: 'c_old',
  retailer_id: 'ret_1',
  name: 'Old Name',
  phone: '9876543210',
  phone_hash: 'h',
  customer_account_id: null,
  email: 'old@x.in',
  notes: 'old note',
  consent_given: true,
  deleted_at,
});

// Mimics the DB: a `deleted_at: null` filter hides the soft-deleted row; create hits the
// unique index (P2002) whenever any row, deleted or not, holds the phone.
function seed(stored: ReturnType<typeof row> | null) {
  mockFindFirst.mockImplementation(async ({ where }: { where: { deleted_at?: null } }) => {
    if (!stored) return null;
    return where.deleted_at === null && stored.deleted_at !== null ? null : stored;
  });
  mockCreate.mockImplementation(async () => {
    if (stored) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    return row(null);
  });
  mockUpdate.mockImplementation(async ({ data }: { data: object }) => ({
    ...row(null),
    ...data,
  }));
}

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.decorateRequest('staffId', null);
  app.addHook('preHandler', async (request) => {
    const role = request.headers['x-role'] as string | undefined;
    request.retailerId = 'ret_1';
    request.staffRole = (role === 'owner' ? null : (role ?? 'salesperson')) as never;
    request.staffId = role === 'owner' ? null : 'staff_1';
  });
  await app.register(customerRoutes, { prefix: '/v1/customers' });
  await app.ready();
  return app;
}

const post = (app: Awaited<ReturnType<typeof buildApp>>, role: string, extra = {}) =>
  app.inject({
    method: 'POST',
    url: '/v1/customers',
    payload: { name: 'New Name', phone: '9876543210', ...extra },
    headers: { 'x-role': role },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockAudit.mockResolvedValue({});
});

describe('POST /customers when the number belongs to a soft-deleted customer (H2-7)', () => {
  it('owner re-adding it restores the row (201) instead of a P2002 500', async () => {
    seed(row(new Date()));
    const res = await post(await buildApp(), 'owner');

    expect(res.statusCode).toBe(201);
    expect(mockCreate).not.toHaveBeenCalled();
    const arg = mockUpdate.mock.calls[0]?.[0];
    expect(arg.where).toEqual({ id: 'c_old' });
    expect(arg.data.deleted_at).toBeNull();
    expect(arg.data.name).toBe('New Name');
  });

  it('restore starts clean: omitted fields and consent are reset, not inherited', async () => {
    seed(row(new Date()));
    await post(await buildApp(), 'owner');

    const data = mockUpdate.mock.calls[0]?.[0].data;
    expect(data.email).toBeNull();
    expect(data.notes).toBeNull();
    expect(data.consent_given).toBe(false);
    expect(data.gender).toBeNull();
    expect(data.source).toBe('MANUAL');
  });

  it('staff get the same 422 as for an active duplicate, and nothing is written', async () => {
    seed(row(new Date()));
    const deleted = await post(await buildApp(), 'salesperson');
    seed(row(null));
    const active = await post(await buildApp(), 'salesperson');

    expect(deleted.statusCode).toBe(422);
    expect(deleted.json()).toEqual(active.json());
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('a manager cannot restore either', async () => {
    seed(row(new Date()));
    const res = await post(await buildApp(), 'manager');

    expect(res.statusCode).toBe(422);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('an active duplicate is still a 422 for the owner', async () => {
    seed(row(null));
    const res = await post(await buildApp(), 'owner');

    expect(res.statusCode).toBe(422);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('a brand-new number is still created', async () => {
    seed(null);
    const res = await post(await buildApp(), 'owner');

    expect(res.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

// PUT changing the phone to one another row holds (active or soft-deleted) hit the same index.
describe('PUT /customers/:id phone change onto a taken number (H2-7)', () => {
  const put = (app: Awaited<ReturnType<typeof buildApp>>, payload: object) =>
    app.inject({
      method: 'PUT',
      url: '/v1/customers/c_me',
      payload,
      headers: { 'x-role': 'owner' },
    });

  function seedPut(holder: ReturnType<typeof row> | null) {
    mockFindFirst.mockImplementation(async ({ where }: { where: { id: unknown } }) =>
      typeof where.id === 'string' ? { ...row(null), id: 'c_me', phone: '9111111111' } : holder,
    );
    mockUpdate.mockResolvedValue({ ...row(null), id: 'c_me' });
  }

  it.each([
    ['active', row(null)],
    ['soft-deleted', row(new Date())],
  ])('a number held by a %s customer is a 422, not a P2002 500', async (_n, holder) => {
    seedPut(holder);
    const res = await put(await buildApp(), { phone: '9876543210' });

    expect(res.statusCode).toBe(422);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('a free number is still updated', async () => {
    seedPut(null);
    const res = await put(await buildApp(), { phone: '9876543210' });

    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('an update without a phone does no holder lookup', async () => {
    seedPut(row(null));
    const res = await put(await buildApp(), { name: 'Renamed' });

    expect(res.statusCode).toBe(200);
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });
});
