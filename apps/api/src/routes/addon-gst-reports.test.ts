import Fastify, { type FastifyPluginAsync } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Add-on pack invoices live on quota_addon_purchases, not subscription_payments. The GST
// reports and invoice list/download must include them, scoped to the same retailer.

const m = vi.hoisted(() => ({
  subAggregate: vi.fn(),
  subCount: vi.fn(),
  subGroupBy: vi.fn(),
  subFindMany: vi.fn(),
  subFindFirst: vi.fn(),
  addAggregate: vi.fn(),
  addCount: vi.fn(),
  addGroupBy: vi.fn(),
  addFindMany: vi.fn(),
  addFindFirst: vi.fn(),
  retailerFindMany: vi.fn(),
  presign: vi.fn(),
  arcAggregate: vi.fn(),
  arcCount: vi.fn(),
  arcGroupBy: vi.fn(),
  arcFindMany: vi.fn(),
  arcFindFirst: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    subscriptionPayment: {
      aggregate: m.subAggregate,
      count: m.subCount,
      groupBy: m.subGroupBy,
      findMany: m.subFindMany,
      findFirst: m.subFindFirst,
    },
    quotaAddonPurchase: {
      aggregate: m.addAggregate,
      count: m.addCount,
      groupBy: m.addGroupBy,
      findMany: m.addFindMany,
      findFirst: m.addFindFirst,
    },
    retailer: { findMany: m.retailerFindMany },
    gstInvoiceArchive: {
      aggregate: m.arcAggregate,
      count: m.arcCount,
      groupBy: m.arcGroupBy,
      findMany: m.arcFindMany,
      findFirst: m.arcFindFirst,
    },
  },
}));
vi.mock('@kanchuki/ai', () => ({ getDownloadPresignedUrl: m.presign }));
vi.mock('./admin-auth.js', () => ({ adminAuthPreHandler: async () => {} }));

import { errorHandler } from '../plugins/error-handler.js';
import { adminGstRoutes } from './admin/admin-gst.js';
import { adminInvoicesRoutes } from './admin/admin-invoices.js';
import { growthGstRoutes } from './growth/growth-gst.js';
import { retailersInvoicesRoutes } from './retailers/retailers-invoices.js';

const RID = 'r_1';

async function app(plugin: FastifyPluginAsync, prefix: string) {
  const a = Fastify();
  a.setErrorHandler(errorHandler);
  a.decorateRequest('retailerId', '');
  a.addHook('preHandler', async (req) => {
    req.retailerId = RID;
  });
  await a.register(plugin, { prefix });
  await a.ready();
  return a;
}

const SUB_SUM = {
  _sum: {
    amount_excluding_gst: 100000,
    gst_amount: 18000,
    amount_inr: 118000,
    cgst_amount: 0,
    sgst_amount: 0,
    igst_amount: 18000,
  },
  _count: 1,
};
const ADD_SUM = {
  _sum: {
    amount_excluding_gst: 20000,
    gst_amount: 3600,
    amount_inr: 23600,
    cgst_amount: 0,
    sgst_amount: 0,
    igst_amount: 3600,
  },
  _count: 1,
};

beforeEach(() => {
  vi.resetAllMocks();
  m.subAggregate.mockResolvedValue(SUB_SUM);
  m.addAggregate.mockResolvedValue(ADD_SUM);
  m.subCount.mockResolvedValue(1);
  m.addCount.mockResolvedValue(1);
  m.subGroupBy.mockResolvedValue([]);
  m.addGroupBy.mockResolvedValue([]);
  m.subFindMany.mockResolvedValue([]);
  m.addFindMany.mockResolvedValue([]);
  m.retailerFindMany.mockResolvedValue([]);
  m.presign.mockResolvedValue('https://r2.example/signed');
  m.arcAggregate.mockResolvedValue({ _sum: null, _count: 0 });
  m.arcCount.mockResolvedValue(0);
  m.arcGroupBy.mockResolvedValue([]);
  m.arcFindMany.mockResolvedValue([]);
  m.arcFindFirst.mockResolvedValue(null);
});

describe('admin reports include archived invoices of deleted retailers', () => {
  const archived = {
    source_id: 's_gone',
    source_table: 'subscription_payments',
    source_status: 'success',
    invoice_number: 'KAN/26-27/000009',
    invoice_date: new Date('2026-11-20T00:00:00Z'),
    amount_inr: 118000,
    amount_excluding_gst: 100000,
    gst_amount: 18000,
    buyer_name: 'Closed Shop',
    buyer_gstin: '27ABCDE1234F1Z5',
  };

  it('summary adds archived once, and only paid archived rows', async () => {
    m.arcAggregate.mockResolvedValue(SUB_SUM);
    const a = await app(adminGstRoutes, '/v1/admin');
    const res = await a.inject({ method: 'GET', url: '/v1/admin/gst/summary' });
    expect(res.json().data).toMatchObject({
      total_orders: 3,
      invoiced_orders: 3,
      total_gst: 39600,
    });
    expect(m.arcAggregate.mock.calls[0]?.[0].where.source_status).toEqual({
      in: ['success', 'COMPLETED'],
    });
  });

  it('a one-retailer filter leaves the archive out', async () => {
    const a = await app(adminGstRoutes, '/v1/admin');
    await a.inject({ method: 'GET', url: '/v1/admin/gst/summary?retailer_id=r_1' });
    expect(m.arcAggregate).not.toHaveBeenCalled();
  });

  it('transactions name the archived buyer, never "Unknown"', async () => {
    m.arcFindMany.mockResolvedValue([archived]);
    m.arcCount.mockResolvedValue(1);
    m.subCount.mockResolvedValue(0);
    m.addCount.mockResolvedValue(0);
    const a = await app(adminGstRoutes, '/v1/admin');
    const res = await a.inject({ method: 'GET', url: '/v1/admin/gst/transactions' });
    expect(res.json().data.transactions[0]).toMatchObject({
      id: 's_gone',
      retailer: 'Closed Shop',
      gstin: '27ABCDE1234F1Z5',
      has_invoice: true,
    });
    expect(res.json().data.pagination.total).toBe(1);
  });

  it('by-retailer shows the archived buyer name', async () => {
    m.arcGroupBy.mockResolvedValue([
      { buyer_gstin: '27ABCDE1234F1Z5', buyer_name: 'Closed Shop', ...SUB_SUM },
    ]);
    const a = await app(adminGstRoutes, '/v1/admin');
    const res = await a.inject({ method: 'GET', url: '/v1/admin/gst/by-retailer' });
    expect(res.json().data[0]).toMatchObject({ shop_name: 'Closed Shop', gst: 18000 });
  });

  it('admin pdf falls back to the archive once the source row is gone', async () => {
    m.subFindFirst.mockResolvedValue(null);
    m.addFindFirst.mockResolvedValue(null);
    m.arcFindFirst.mockResolvedValue({ invoice_r2_key: 'k/archived.pdf' });
    const a = await app(adminInvoicesRoutes, '/v1/admin');
    const res = await a.inject({ method: 'GET', url: '/v1/admin/invoices/archived/s_gone/pdf' });
    expect(res.json().url).toBe('https://r2.example/signed');
    expect(m.presign).toHaveBeenCalledWith('k/archived.pdf', 300);
  });
});

describe('admin GET /gst/summary includes add-on packs', () => {
  it('sums subscriptions + add-on purchases', async () => {
    const a = await app(adminGstRoutes, '/v1/admin');
    const res = await a.inject({ method: 'GET', url: '/v1/admin/gst/summary' });
    expect(res.json().data).toMatchObject({
      total_orders: 2,
      invoiced_orders: 2,
      pending_invoices: 0,
      total_taxable: 120000,
      total_gst: 21600,
      total_sales: 141600,
      igst: 21600,
    });
  });

  it('only COMPLETED add-ons count, by completed_at for a month filter', async () => {
    const a = await app(adminGstRoutes, '/v1/admin');
    await a.inject({ method: 'GET', url: '/v1/admin/gst/summary?month=11&year=2026' });
    const where = m.addAggregate.mock.calls[0]?.[0].where;
    expect(where.status).toBe('COMPLETED');
    // RC-201: IST month bounds as explicit instants (not server-local dates).
    expect(where.completed_at).toEqual({
      gte: new Date('2026-10-31T18:30:00Z'),
      lt: new Date('2026-11-30T18:30:00Z'),
    });
    expect(where.created_at).toBeUndefined();
  });

  it('a COMPLETED add-on with no invoice number is pending, not invoiced', async () => {
    m.addCount.mockResolvedValue(0); // the not-null-number count
    const a = await app(adminGstRoutes, '/v1/admin');
    const res = await a.inject({ method: 'GET', url: '/v1/admin/gst/summary' });
    expect(res.json().data.invoiced_orders).toBe(1);
    expect(res.json().data.pending_invoices).toBe(1);
  });
});

// RC-201 — GST periods follow IST on a UTC server (Railway sets no TZ).
describe('GST report periods follow IST, not server time', () => {
  const prevTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'UTC';
  });
  afterAll(() => {
    process.env.TZ = prevTz;
  });
  const APRIL = { gte: new Date('2026-03-31T18:30:00Z'), lt: new Date('2026-04-30T18:30:00Z') };
  const at0200IstApr1 = new Date('2026-03-31T20:30:00Z');

  it.each([
    ['admin', adminGstRoutes, '/v1/admin'],
    ['retailer', growthGstRoutes, '/v1/growth'],
  ] as const)('%s summary month=4 uses IST month bounds', async (_n, plugin, prefix) => {
    const a = await app(plugin, prefix);
    await a.inject({ method: 'GET', url: `${prefix}/gst/summary?month=4&year=2026` });
    expect(m.subAggregate.mock.calls[0]?.[0].where.created_at).toEqual(APRIL);
  });

  it.each([
    ['admin', adminGstRoutes, '/v1/admin'],
    ['retailer', growthGstRoutes, '/v1/growth'],
  ] as const)('%s monthly puts 02:00 IST 1 Apr in April', async (_n, plugin, prefix) => {
    m.subGroupBy.mockResolvedValue([{ created_at: at0200IstApr1, ...SUB_SUM }]);
    const a = await app(plugin, prefix);
    const res = await a.inject({ method: 'GET', url: `${prefix}/gst/monthly?year=2026` });
    const rows = res.json().data.months as { month: number; taxable: number }[];
    expect(rows.find((r) => r.month === 4)?.taxable).toBe(100000);
    expect(rows.find((r) => r.month === 3)?.taxable).toBe(0);
    expect(m.subGroupBy.mock.calls[0]?.[0].where.created_at).toEqual({
      gte: new Date('2025-12-31T18:30:00Z'),
      lt: new Date('2026-12-31T18:30:00Z'),
    });
  });
});

describe('retailer GET /growth/gst/summary includes add-on packs, scoped to the retailer', () => {
  it('adds add-ons and scopes both queries to request.retailerId', async () => {
    const a = await app(growthGstRoutes, '/v1/growth');
    const res = await a.inject({ method: 'GET', url: '/v1/growth/gst/summary' });
    expect(res.json().data.total_gst).toBe(21600);
    expect(m.addAggregate.mock.calls[0]?.[0].where.retailer_id).toBe(RID);
    expect(m.addCount.mock.calls[0]?.[0].where.retailer_id).toBe(RID);
  });
});

describe('admin GET /gst/by-retailer merges the same retailer across both sources', () => {
  it('one row per retailer with summed amounts and payment count', async () => {
    m.subGroupBy.mockResolvedValue([{ retailer_id: 'r_1', ...SUB_SUM }]);
    m.addGroupBy.mockResolvedValue([
      { retailer_id: 'r_1', ...ADD_SUM },
      { retailer_id: 'r_2', ...ADD_SUM },
    ]);
    m.retailerFindMany.mockResolvedValue([
      { id: 'r_1', shop_name: 'One', city: 'A', gstin: null },
      { id: 'r_2', shop_name: 'Two', city: 'B', gstin: null },
    ]);
    const a = await app(adminGstRoutes, '/v1/admin');
    const res = await a.inject({ method: 'GET', url: '/v1/admin/gst/by-retailer' });
    const rows = res.json().data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ retailer_id: 'r_1', payments: 2, gst: 21600, sales: 141600 });
    expect(rows[1]).toMatchObject({ retailer_id: 'r_2', payments: 1, gst: 3600 });
  });
});

describe('transactions lists carry add-on rows, newest first, with a kind', () => {
  const sub = {
    id: 's_1',
    amount_excluding_gst: 100000,
    gst_amount: 18000,
    amount_inr: 118000,
    gst_invoice_number: 'KAN/26-27/000001',
    created_at: new Date('2026-11-01T00:00:00Z'),
  };
  const add = {
    id: 'a_1',
    amount_excluding_gst: 20000,
    gst_amount: 3600,
    amount_inr: 23600,
    gst_invoice_number: 'KAN/26-27/000002',
    completed_at: new Date('2026-11-10T00:00:00Z'),
  };

  it('retailer: merged, sorted, total = both counts', async () => {
    m.subFindMany.mockResolvedValue([sub]);
    m.addFindMany.mockResolvedValue([add]);
    m.subCount.mockResolvedValue(1);
    m.addCount.mockResolvedValue(1);
    const a = await app(growthGstRoutes, '/v1/growth');
    const res = await a.inject({ method: 'GET', url: '/v1/growth/gst/transactions' });
    const d = res.json().data;
    expect(d.transactions.map((t: { id: string }) => t.id)).toEqual(['a_1', 's_1']);
    expect(d.transactions[0]).toMatchObject({ kind: 'addon', total: 23600, has_invoice: true });
    expect(d.transactions[1]).toMatchObject({ kind: 'subscription' });
    expect(d.pagination.total).toBe(2);
    expect(m.addFindMany.mock.calls[0]?.[0].where.retailer_id).toBe(RID);
  });

  it('admin: add-on row names the retailer', async () => {
    m.addFindMany.mockResolvedValue([
      { ...add, retailer: { id: 'r_1', shop_name: 'One', gstin: '27ABCDE1234F1Z5' } },
    ]);
    m.addCount.mockResolvedValue(1);
    m.subCount.mockResolvedValue(0);
    const a = await app(adminGstRoutes, '/v1/admin');
    const res = await a.inject({ method: 'GET', url: '/v1/admin/gst/transactions' });
    expect(res.json().data.transactions[0]).toMatchObject({
      kind: 'addon',
      retailer: 'One',
      gstin: '27ABCDE1234F1Z5',
    });
  });

  it('pagination: page 2 skips the newest, taking enough from each source to merge', async () => {
    const a = await app(growthGstRoutes, '/v1/growth');
    await a.inject({ method: 'GET', url: '/v1/growth/gst/transactions?page=2&limit=10' });
    expect(m.subFindMany.mock.calls[0]?.[0].take).toBe(20);
    expect(m.addFindMany.mock.calls[0]?.[0].take).toBe(20);
  });
});

describe('retailer invoices: list and download include add-on packs', () => {
  it('list merges add-on rows (kind, paid_at = completed_at) newest first', async () => {
    m.subFindMany.mockResolvedValue([
      { id: 's_1', amount_inr: 118000, paid_at: new Date('2026-11-01T00:00:00Z') },
    ]);
    m.addFindMany.mockResolvedValue([
      {
        id: 'a_1',
        amount_inr: 23600,
        amount_excluding_gst: 20000,
        gst_amount: 3600,
        gst_invoice_number: 'KAN/26-27/000002',
        invoice_generated_at: null,
        completed_at: new Date('2026-11-10T00:00:00Z'),
      },
    ]);
    const a = await app(retailersInvoicesRoutes, '/v1/retailers');
    const res = await a.inject({ method: 'GET', url: '/v1/retailers/me/invoices' });
    const rows = res.json().data;
    expect(rows.map((r: { id: string }) => r.id)).toEqual(['a_1', 's_1']);
    expect(rows[0]).toMatchObject({
      kind: 'addon',
      status: 'success',
      paid_at: expect.any(String),
    });
    expect(rows[1].kind).toBe('subscription');
    expect(m.addFindMany.mock.calls[0]?.[0].where).toMatchObject({
      retailer_id: RID,
      status: 'COMPLETED',
      gst_invoice_number: { not: null },
    });
  });

  it('pdf: falls back to the add-on purchase, scoped to the caller', async () => {
    m.subFindFirst.mockResolvedValue(null);
    m.addFindFirst.mockResolvedValue({ invoice_r2_key: 'k/add.pdf' });
    const a = await app(retailersInvoicesRoutes, '/v1/retailers');
    const res = await a.inject({ method: 'GET', url: '/v1/retailers/me/invoices/a_1/pdf' });
    expect(res.json().data.url).toBe('https://r2.example/signed');
    expect(m.presign).toHaveBeenCalledWith('k/add.pdf', 300);
    expect(m.addFindFirst.mock.calls[0]?.[0].where).toMatchObject({ id: 'a_1', retailer_id: RID });
  });

  it('pdf: not in either table (or another retailer) -> 404, nothing signed', async () => {
    m.subFindFirst.mockResolvedValue(null);
    m.addFindFirst.mockResolvedValue(null);
    const a = await app(retailersInvoicesRoutes, '/v1/retailers');
    const res = await a.inject({ method: 'GET', url: '/v1/retailers/me/invoices/zzz/pdf' });
    expect(res.statusCode).toBe(404);
    expect(m.presign).not.toHaveBeenCalled();
  });

  it('pdf: add-on whose PDF is not generated yet -> 404', async () => {
    m.subFindFirst.mockResolvedValue(null);
    m.addFindFirst.mockResolvedValue({ invoice_r2_key: null });
    const a = await app(retailersInvoicesRoutes, '/v1/retailers');
    const res = await a.inject({ method: 'GET', url: '/v1/retailers/me/invoices/a_1/pdf' });
    expect(res.statusCode).toBe(404);
  });
});

describe('admin invoices: list and download include add-on packs', () => {
  it('per-retailer list includes add-on rows', async () => {
    m.addFindMany.mockResolvedValue([
      { id: 'a_1', amount_inr: 23600, completed_at: new Date('2026-11-10T00:00:00Z') },
    ]);
    const a = await app(adminInvoicesRoutes, '/v1/admin');
    const res = await a.inject({ method: 'GET', url: '/v1/admin/invoices/r_1' });
    expect(res.json()[0]).toMatchObject({ id: 'a_1', kind: 'addon' });
    expect(m.addFindMany.mock.calls[0]?.[0].where.retailer_id).toBe('r_1');
  });

  it('all-retailers list: merged, total = both counts', async () => {
    m.subFindMany.mockResolvedValue([{ id: 's_1', paid_at: new Date('2026-11-01T00:00:00Z') }]);
    m.addFindMany.mockResolvedValue([
      { id: 'a_1', completed_at: new Date('2026-11-10T00:00:00Z') },
    ]);
    m.subCount.mockResolvedValue(1);
    m.addCount.mockResolvedValue(1);
    const a = await app(adminInvoicesRoutes, '/v1/admin');
    const res = await a.inject({ method: 'GET', url: '/v1/admin/invoices' });
    expect(res.json().total).toBe(2);
    expect(res.json().payments.map((p: { id: string }) => p.id)).toEqual(['a_1', 's_1']);
  });

  it('pdf: add-on fallback is constrained to the retailer in the URL', async () => {
    m.subFindFirst.mockResolvedValue(null);
    m.addFindFirst.mockResolvedValue({ invoice_r2_key: 'k/add.pdf' });
    const a = await app(adminInvoicesRoutes, '/v1/admin');
    const res = await a.inject({ method: 'GET', url: '/v1/admin/invoices/r_1/a_1/pdf' });
    expect(res.json().url).toBe('https://r2.example/signed');
    expect(m.addFindFirst.mock.calls[0]?.[0].where).toMatchObject({
      id: 'a_1',
      retailer_id: 'r_1',
    });
  });
});
