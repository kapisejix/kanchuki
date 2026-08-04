/**
 * Limited-time free catalog-upload offer (F-019 Task 2, 2026-08-04).
 *
 * The quoting route (PATCH /team/tickets/:id) reads the admin-configured
 * promo (admin-settings key-value store) and FORCES quoted_price_inr to ₹0
 * when the offer is live and the request is within the free item limit —
 * replacing the old "whoever quotes must remember the cutoff" manual
 * discipline. Above the limit, expired, or unconfigured → manual price.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { signTeamToken } from '../plugins/team-auth.js';
import { teamRoutes } from './team.js';

const mockTeamMemberFindUnique = vi.hoisted(() => vi.fn());
const mockSupportTicketFindUnique = vi.hoisted(() => vi.fn());
const mockSupportTicketUpdate = vi.hoisted(() => vi.fn());
const mockAuditLogFindFirst = vi.hoisted(() => vi.fn());
const mockAuditLogCreate = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    teamMember: {
      findUnique: mockTeamMemberFindUnique,
    },
    supportTicket: {
      findUnique: mockSupportTicketFindUnique,
      update: mockSupportTicketUpdate,
    },
    auditLog: {
      findFirst: mockAuditLogFindFirst,
      create: mockAuditLogCreate,
    },
  },
  Prisma: {},
}));

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(teamRoutes, { prefix: '/v1/team' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TEAM_JWT_SECRET = 'test-team-secret';
  process.env.ADMIN_API_KEY = 'test-admin-key';
  // Auth preHandler loads the token's member from DB to build territoryIds
  mockTeamMemberFindUnique.mockResolvedValue({ id: 'admin_1', role: 'SUPER_ADMIN', is_active: true });
});

const SUPER_ADMIN = { id: 'admin_1', role: 'SUPER_ADMIN', is_active: true };

async function superAdminHeaders() {
  const token = await signTeamToken({ sub: SUPER_ADMIN.id, role: SUPER_ADMIN.role });
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

/** A CATALOG_UPLOAD ticket the route's `existing` select will receive. */
function mockCatalogTicket(itemCount: number) {
  mockSupportTicketFindUnique.mockResolvedValue({
    id: 'ticket_1',
    status: 'OPEN',
    assigned_to_id: null,
    region_scope_id: null,
    ticket_type: 'CATALOG_UPLOAD',
    item_count_requested: itemCount,
    retailer: { territory_id: null },
  });
}

/** Promo store read. metadata = null → no promo configured. */
function mockPromo(metadata: Record<string, unknown> | null) {
  mockAuditLogFindFirst.mockResolvedValue(metadata ? { metadata } : null);
}

function mockUpdateReturnsTicket() {
  mockSupportTicketUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    id: 'ticket_1',
    retailer_id: 'retailer_a',
    requires_visit: true,
    assigned_to_id: null,
    status: 'OPEN',
    note: null,
    ticket_type: 'CATALOG_UPLOAD',
    item_count_requested: data.item_count_requested ?? null,
    quoted_price_inr: data.quoted_price_inr ?? null,
    proposed_slots: null,
    confirmed_slot: null,
    paid_at: null,
    created_at: new Date('2026-08-04T00:00:00Z'),
    resolved_at: null,
  }));
}

const quoteBody = (price: number) => ({ quoted_price_inr: price });

describe('PATCH /team/tickets/:id — limited-time free offer enforcement', () => {
  it('forces ₹0 when the promo is live and the request is within the free limit', async () => {
    mockCatalogTicket(300);
    mockPromo({ free_item_limit: 500, expires_at: null }); // live, no expiry
    mockUpdateReturnsTicket();

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/team/tickets/ticket_1',
      headers: await superAdminHeaders(),
      payload: quoteBody(4999), // admin typed a price — system overrides it
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.quoted_price_inr).toBe(0);
    expect(body.data.promo_applied).toBe(true);
    expect(mockSupportTicketUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quoted_price_inr: 0 }),
      }),
    );
    await app.close();
  });

  it('honors the manual price when the request exceeds the free limit', async () => {
    mockCatalogTicket(800);
    mockPromo({ free_item_limit: 500, expires_at: null }); // live
    mockUpdateReturnsTicket();

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/team/tickets/ticket_1',
      headers: await superAdminHeaders(),
      payload: quoteBody(9999),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.quoted_price_inr).toBe(9999);
    expect(body.data.promo_applied).toBe(false);
    await app.close();
  });

  it('does NOT apply an expired promo — manual price stands', async () => {
    mockCatalogTicket(100);
    mockPromo({
      free_item_limit: 500,
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // yesterday
    });
    mockUpdateReturnsTicket();

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/team/tickets/ticket_1',
      headers: await superAdminHeaders(),
      payload: quoteBody(2500),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.quoted_price_inr).toBe(2500);
    expect(body.data.promo_applied).toBe(false);
    await app.close();
  });

  it('does not apply the promo when it is not configured at all', async () => {
    mockCatalogTicket(100);
    mockPromo(null); // no settings row → getCatalogUploadPromo returns inactive
    mockUpdateReturnsTicket();

    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/team/tickets/ticket_1',
      headers: await superAdminHeaders(),
      payload: quoteBody(1500),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.quoted_price_inr).toBe(1500);
    expect(body.data.promo_applied).toBe(false);
    await app.close();
  });
});
