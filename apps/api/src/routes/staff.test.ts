import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { staffRoutes } from './staff.js';

// Regression tests for POST /v1/staff — pins the whole server contract so the
// "Failed to add team member" mobile error can't silently mask a server bug
// (2026-09-08 batch, mobile issue #7). The route itself was verified sound;
// these tests lock in the happy path + every rejection reason the mobile app
// now surfaces verbatim instead of the generic fallback.

const {
  mockRetailerFindUniqueOrThrow,
  mockRetailerFindFirst,
  mockStaffCount,
  mockStaffFindFirst,
  mockStaffCreate,
  mockStaffFindMany,
} = vi.hoisted(() => ({
  mockRetailerFindUniqueOrThrow: vi.fn(),
  mockRetailerFindFirst: vi.fn(),
  mockStaffCount: vi.fn(),
  mockStaffFindFirst: vi.fn(),
  mockStaffCreate: vi.fn(),
  mockStaffFindMany: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: {
      findUniqueOrThrow: mockRetailerFindUniqueOrThrow,
      findFirst: mockRetailerFindFirst,
    },
    staff: {
      findMany: mockStaffFindMany,
      count: mockStaffCount,
      findFirst: mockStaffFindFirst,
      create: mockStaffCreate,
    },
    auditLog: { create: vi.fn() },
  },
  Prisma: {},
}));

const RETAILER_ID = 'retailer_1';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('catalogDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(staffRoutes, { prefix: '/v1/staff' });
  await app.ready();
  return app;
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — clears mockResolvedValueOnce queues
  // so a leftover once-value from one test can't leak into the next.
  vi.resetAllMocks();
});

describe('POST /v1/staff', () => {
  it('creates a staff member on the happy path (201, normalized phone)', async () => {
    mockRetailerFindUniqueOrThrow.mockResolvedValue({ max_staff_seats: 3 });
    mockStaffCount.mockResolvedValue(0);
    mockStaffFindFirst.mockResolvedValueOnce(null); // no existing active member
    mockRetailerFindFirst.mockResolvedValueOnce(null); // phone not on a retailer account
    mockStaffCreate.mockResolvedValue({
      id: 'staff_1',
      retailer_id: RETAILER_ID,
      name: 'Ramesh',
      phone: '9876543210',
      role: 'salesperson',
      is_active: true,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      payload: { name: 'Ramesh', phone: '9876543210', role: 'salesperson' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.id).toBe('staff_1');
    // Phone must be normalized to the bare 10-digit form before persistence.
    expect(mockStaffCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: '9876543210', retailer_id: RETAILER_ID }),
      }),
    );
    await app.close();
  });

  it('rejects an invalid phone number (422)', async () => {
    const app = await buildApp();
    // 10 digits but doesn't start 6–9 → passes zod .min(10) and reaches the
    // isValidIndianPhone refine, which is the rejection the mobile app shows.
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      payload: { name: 'Ramesh', phone: '1234567890', role: 'salesperson' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('valid 10-digit Indian mobile');
    expect(mockStaffCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects adding beyond the plan seat limit (402)', async () => {
    mockRetailerFindUniqueOrThrow.mockResolvedValue({ max_staff_seats: 3 });
    mockStaffCount.mockResolvedValue(3); // 3 active members already

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      payload: { name: 'Fourth', phone: '9812345670', role: 'salesperson' },
    });

    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe('PLAN_LIMIT_EXCEEDED');
    expect(res.json().error.message).toContain('staff seats');
    expect(mockStaffCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a phone already on an active staff member (422)', async () => {
    mockRetailerFindUniqueOrThrow.mockResolvedValue({ max_staff_seats: 3 });
    mockStaffCount.mockResolvedValue(1);
    mockStaffFindFirst.mockResolvedValueOnce({
      id: 'staff_existing',
      phone: '9876543210',
      is_active: true,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      payload: { name: 'Ramesh', phone: '9876543210', role: 'salesperson' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('already exists');
    expect(mockStaffCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a phone already registered as a retailer account (422)', async () => {
    mockRetailerFindUniqueOrThrow.mockResolvedValue({ max_staff_seats: 3 });
    mockStaffCount.mockResolvedValue(0);
    mockStaffFindFirst.mockResolvedValueOnce(null); // no staff row with this phone
    mockRetailerFindFirst.mockResolvedValueOnce({ id: 'some_other_retailer' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      payload: { name: 'Ramesh', phone: '9876543210', role: 'salesperson' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('already registered as a retailer');
    expect(mockStaffCreate).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /v1/staff', () => {
  it('lists staff rows for the retailer', async () => {
    mockStaffFindMany.mockResolvedValue([
      { id: 'staff_1', name: 'Ramesh', phone: '9876543210', role: 'salesperson', is_active: true },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/staff' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(mockStaffFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { retailer_id: RETAILER_ID } }),
    );
    await app.close();
  });
});