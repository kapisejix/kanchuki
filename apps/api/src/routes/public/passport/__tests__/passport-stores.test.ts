// F-036 Phase A (Task 1): GET /v1/public/passport/stores
//
// The page that consumes this endpoint ("/my-stores") is nothing but a list of
// the *signed-in* shopper's own visits, so the one thing that must never break
// is the scoping: a shopper must never see another shopper's store list. That
// guarantee lives here, server-side, and these tests pin it by running the
// route against a fake in-memory table holding BOTH accounts' rows — if the
// route ever loses its `customer_account_id` filter, the other account's store
// shows up in the response and the test fails.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../../plugins/error-handler.js';
import { passportStoresRoutes } from '../passport-stores.js';

// ─── Mocks ────────────────────────────────────────────────────────

const mockPassportSessionFindUnique = vi.hoisted(() => vi.fn());
const mockPassportSessionUpdate = vi.hoisted(() => vi.fn());
const mockCustomerStoreVisitFindMany = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    passportSession: {
      findUnique: mockPassportSessionFindUnique,
      update: mockPassportSessionUpdate,
    },
    customerStoreVisit: {
      findMany: mockCustomerStoreVisitFindMany,
    },
  },
  Prisma: {},
}));

// ─── Fake DB ──────────────────────────────────────────────────────

const ACCOUNT_A = 'acct_a'; // the signed-in shopper
const ACCOUNT_B = 'acct_b'; // some other shopper — must never be visible
const SESSION_A = 'sess_a';
const COOKIE_A = `kanchuki_passport=${SESSION_A}`;

const VISIT_A1 = {
  id: 'v_a1',
  customer_account_id: ACCOUNT_A,
  retailer_id: 'ret_1',
  source: 'QR_SCAN',
  first_visited_at: new Date('2026-08-01T10:00:00.000Z'),
  last_visited_at: new Date('2026-09-10T10:00:00.000Z'),
  visit_count: 3,
  contact_shared: true,
  whatsapp_consent: true,
  whatsapp_consent_at: new Date('2026-08-01T10:05:00.000Z'),
  is_muted: false,
  retailer: {
    id: 'ret_1',
    shop_name: 'Meena Bazaar',
    city: 'Jaipur',
    logo_url: 'https://r2.example.com/meena.png',
    public_slug: 'meena-bazaar',
  },
};

const VISIT_A2 = {
  id: 'v_a2',
  customer_account_id: ACCOUNT_A,
  retailer_id: 'ret_2',
  source: 'QR_SCAN',
  first_visited_at: new Date('2026-09-01T10:00:00.000Z'),
  last_visited_at: new Date('2026-09-15T10:00:00.000Z'),
  visit_count: 1,
  contact_shared: false,
  whatsapp_consent: false,
  whatsapp_consent_at: null,
  is_muted: false,
  retailer: {
    id: 'ret_2',
    shop_name: 'Shree Sarees',
    city: 'Surat',
    logo_url: null,
    public_slug: 'shree-sarees',
  },
};

// A row belonging to a different shopper. Present in the "table" on purpose.
const VISIT_B1 = {
  id: 'v_b1',
  customer_account_id: ACCOUNT_B,
  retailer_id: 'ret_9',
  source: 'QR_SCAN',
  first_visited_at: new Date('2026-09-12T10:00:00.000Z'),
  last_visited_at: new Date('2026-09-12T10:00:00.000Z'),
  visit_count: 1,
  contact_shared: true,
  whatsapp_consent: true,
  whatsapp_consent_at: new Date('2026-09-12T10:05:00.000Z'),
  is_muted: false,
  retailer: {
    id: 'ret_9',
    shop_name: 'Not Yours Boutique',
    city: 'Delhi',
    logo_url: null,
    public_slug: 'not-yours',
  },
};

const ALL_VISITS = [VISIT_A1, VISIT_A2, VISIT_B1];

/**
 * Wire the prisma doubles to behave like a tiny real table: `findMany` honours
 * the `where` it is given and the `orderBy` it is given. A route that forgets
 * to scope its query therefore leaks — the assertion, not the mock, catches it.
 */
function wireFakeDb() {
  mockPassportSessionFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (where.id !== SESSION_A) return null;
    return {
      id: SESSION_A,
      customer_account_id: ACCOUNT_A,
      revoked_at: null,
      expires_at: new Date(Date.now() + 86_400_000),
      customer_account: { id: ACCOUNT_A, phone: '+919876543210' },
    };
  });
  mockPassportSessionUpdate.mockResolvedValue({});

  mockCustomerStoreVisitFindMany.mockImplementation(
    async ({
      where,
      orderBy,
    }: {
      where: { customer_account_id: string };
      orderBy?: { last_visited_at: 'asc' | 'desc' };
    }) => {
      const rows = ALL_VISITS.filter((v) => v.customer_account_id === where.customer_account_id);
      if (orderBy?.last_visited_at === 'desc') {
        return [...rows].sort((a, b) => b.last_visited_at.getTime() - a.last_visited_at.getTime());
      }
      return rows;
    },
  );
}

function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.register(passportStoresRoutes, { prefix: '/v1/public/passport' });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  wireFakeDb();
});

// ─── Tests ────────────────────────────────────────────────────────

describe('GET /v1/public/passport/stores', () => {
  it('rejects an unauthenticated request without touching the visits table', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/v1/public/passport/stores' });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('NO_SESSION');
    expect(mockCustomerStoreVisitFindMany).not.toHaveBeenCalled();
  });

  it("returns only the signed-in passport's own visits — no cross-customer leakage", async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/stores',
      headers: { cookie: COOKIE_A },
    });

    expect(res.statusCode).toBe(200);

    // The query itself must be scoped to the session's account.
    expect(mockCustomerStoreVisitFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customer_account_id: ACCOUNT_A },
      }),
    );

    const stores = res.json().stores as Array<{ retailer: { id: string; shop_name: string } }>;
    expect(stores).toHaveLength(2);
    expect(stores.map((s) => s.retailer.id).sort()).toEqual(['ret_1', 'ret_2']);
    expect(stores.map((s) => s.retailer.shop_name)).not.toContain('Not Yours Boutique');
  });

  it('orders the list by most recent visit first', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/stores',
      headers: { cookie: COOKIE_A },
    });

    expect(res.statusCode).toBe(200);
    expect(mockCustomerStoreVisitFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { last_visited_at: 'desc' } }),
    );

    const stores = res.json().stores as Array<{ retailer: { id: string } }>;
    expect(stores.map((s) => s.retailer.id)).toEqual(['ret_2', 'ret_1']);
  });

  it('exposes the storefront slug so each row can tap through to its catalog', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/stores',
      headers: { cookie: COOKIE_A },
    });

    expect(res.statusCode).toBe(200);

    // The retailer rows must carry the field the public catalog route keys on
    // (apps/web `/[store]` resolves by public_slug) — without it the list is
    // dead text with nothing to link to.
    expect(mockCustomerStoreVisitFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          retailer: { select: expect.objectContaining({ public_slug: true }) },
        },
      }),
    );

    const stores = res.json().stores as Array<{ retailer: { public_slug: string | null } }>;
    for (const store of stores) {
      expect(store.retailer).toHaveProperty('public_slug');
      expect(typeof store.retailer.public_slug).toBe('string');
    }
  });

  it('carries the visit metadata the list renders (last visit + name + logo)', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/public/passport/stores',
      headers: { cookie: COOKIE_A },
    });

    const stores = res.json().stores as Array<Record<string, unknown>>;
    const first = stores[0] as {
      last_visited_at: string;
      visit_count: number;
      retailer: { shop_name: string; logo_url: string | null; city: string | null };
    };

    expect(first.retailer.shop_name).toBe('Shree Sarees');
    expect(first.retailer.logo_url).toBeNull();
    expect(first.retailer.city).toBe('Surat');
    expect(first.last_visited_at).toBe('2026-09-15T10:00:00.000Z');
    expect(first.visit_count).toBe(1);
  });
});
