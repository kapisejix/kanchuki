import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// F-044 R2 T6 - try-on top-up packs read the admin ResourcePack table; the five
// legacy resource types keep reading ADDON_PRICING. Money path: every refusal
// must happen before Razorpay is called and before a purchase row exists.

const m = vi.hoisted(() => ({
  retailerFindUnique: vi.fn(),
  packFindFirst: vi.fn(),
  packFindMany: vi.fn(),
  purchaseCreate: vi.fn(),
  purchaseFindFirst: vi.fn(),
  purchaseUpdate: vi.fn(),
  purchaseUpdateMany: vi.fn(),
  overrideFindUnique: vi.fn(),
  planLimitFindUnique: vi.fn(),
  usageUpsert: vi.fn(),
  auditCreate: vi.fn(),
  razorpay: vi.fn(),
  hasFeature: vi.fn(),
}));

const txClient = () => ({
  quotaAddonPurchase: { updateMany: m.purchaseUpdateMany },
  usageCounter: { upsert: m.usageUpsert },
});

vi.mock('@kanchuki/db', () => ({
  getSecret: async () => 'rzp_test_key_secret',
  prisma: {
    retailer: { findUnique: m.retailerFindUnique, findUniqueOrThrow: m.retailerFindUnique },
    resourcePack: { findFirst: m.packFindFirst, findMany: m.packFindMany },
    quotaAddonPurchase: {
      create: m.purchaseCreate,
      findFirst: m.purchaseFindFirst,
      update: m.purchaseUpdate,
      updateMany: m.purchaseUpdateMany,
    },
    retailerLimitOverride: { findUnique: m.overrideFindUnique },
    planLimit: { findUnique: m.planLimitFindUnique },
    usageCounter: { upsert: m.usageUpsert },
    auditLog: { create: m.auditCreate },
    $transaction: (ops: unknown) =>
      typeof ops === 'function' ? ops(txClient()) : Promise.all(ops as unknown[]),
  },
}));

vi.mock('./billing-helpers.js', async () => {
  const actual =
    await vi.importActual<typeof import('./billing-helpers.js')>('./billing-helpers.js');
  return { ...actual, razorpay: m.razorpay };
});

vi.mock('../../lib/features.js', () => ({ hasFeatureForPlan: m.hasFeature }));

import { errorHandler } from '../../plugins/error-handler.js';
import { billingAddonRoutes } from './billing-addons.js';

const RETAILER_ID = 'retailer_1';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(billingAddonRoutes, { prefix: '/v1/billing' });
  await app.ready();
  return app;
}

const PACK = {
  id: 'pack_1',
  label: '25 try-ons',
  unit_label: 'try-ons',
  pack_size: 25,
  price_paise: 23600,
  plans: [] as string[],
  is_active: true,
  sort_order: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
  m.retailerFindUnique.mockResolvedValue({
    phone: '+919999999999',
    shop_name: 'Test Shop',
    plan: 'GROWTH',
  });
  m.hasFeature.mockResolvedValue(true);
  m.overrideFindUnique.mockResolvedValue(null);
  m.planLimitFindUnique.mockResolvedValue({ limit_per_period: 50, period: 'MONTH' });
  m.razorpay.mockResolvedValue({ id: 'plink_1', short_url: 'https://rzp.io/x', status: 'created' });
  m.purchaseCreate.mockResolvedValue({ id: 'purchase_1' });
  m.auditCreate.mockResolvedValue({});
  m.packFindFirst.mockResolvedValue(PACK);
  m.packFindMany.mockResolvedValue([PACK]);
});

function checkout(app: Awaited<ReturnType<typeof buildApp>>, body: unknown) {
  return app.inject({ method: 'POST', url: '/v1/billing/addon-checkout', payload: body as object });
}

describe('POST /addon-checkout - TRY_ON_GENERATION packs', () => {
  it('active pack: charges pack.price_paise and records pack_size', async () => {
    const app = await buildApp();
    const res = await checkout(app, { resource_type: 'TRY_ON_GENERATION', pack_id: 'pack_1' });
    expect(res.statusCode).toBe(200);

    const rzpBody = JSON.parse(m.razorpay.mock.calls[0]?.[1].body as string);
    expect(rzpBody.amount).toBe(23600);
    expect(rzpBody.notes.quantity).toBe(25);
    expect(rzpBody.notes.resource_type).toBe('TRY_ON_GENERATION');

    const created = m.purchaseCreate.mock.calls[0]?.[0].data;
    expect(created.amount_inr).toBe(23600);
    expect(created.quantity).toBe(25);
    expect(created.resource_type).toBe('TRY_ON_GENERATION');

    expect(m.auditCreate.mock.calls[0]?.[0].data.metadata.pack_id).toBe('pack_1');
    expect(res.json().data.amount_paise).toBe(23600);
  });

  it('looks the pack up with the active + plan filter', async () => {
    const app = await buildApp();
    await checkout(app, { resource_type: 'TRY_ON_GENERATION', pack_id: 'pack_1' });
    expect(m.packFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'pack_1',
        resource_type: 'TRY_ON_GENERATION',
        is_active: true,
        OR: [{ plans: { isEmpty: true } }, { plans: { has: 'GROWTH' } }],
      },
    });
  });

  it.each([
    ['inactive / other-plan / missing pack', () => m.packFindFirst.mockResolvedValue(null)],
    ['plan lacks VIRTUAL_TRY_ON_V2', () => m.hasFeature.mockResolvedValue(false)],
    ['price_paise is 0', () => m.packFindFirst.mockResolvedValue({ ...PACK, price_paise: 0 })],
    [
      'override is unlimited (-1)',
      () => m.overrideFindUnique.mockResolvedValue({ limit_per_period: -1, period: 'MONTH' }),
    ],
    [
      'plan limit is unlimited (-1)',
      () => m.planLimitFindUnique.mockResolvedValue({ limit_per_period: -1, period: 'MONTH' }),
    ],
    ['no limit row at all', () => m.planLimitFindUnique.mockResolvedValue(null)],
    ['pack_size is 0', () => m.packFindFirst.mockResolvedValue({ ...PACK, pack_size: 0 })],
  ])('%s -> 404, no Razorpay call, no purchase row', async (_n, arrange) => {
    arrange();
    const app = await buildApp();
    const res = await checkout(app, { resource_type: 'TRY_ON_GENERATION', pack_id: 'pack_1' });
    expect(res.statusCode).toBe(404);
    expect(m.razorpay).not.toHaveBeenCalled();
    expect(m.purchaseCreate).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it('missing pack_id -> 422, nothing created', async () => {
    const app = await buildApp();
    const res = await checkout(app, { resource_type: 'TRY_ON_GENERATION' });
    expect(res.statusCode).toBe(422);
    expect(m.razorpay).not.toHaveBeenCalled();
    expect(m.purchaseCreate).not.toHaveBeenCalled();
  });
});

describe('POST /addon-checkout - legacy resource types unchanged', () => {
  it('still prices from ADDON_PRICING and never touches ResourcePack', async () => {
    const app = await buildApp();
    const res = await checkout(app, { resource_type: 'AI_TAGGING_CALL', pack_index: 0 });
    expect(res.statusCode).toBe(200);
    expect(m.packFindFirst).not.toHaveBeenCalled();
    expect(m.razorpay).toHaveBeenCalledOnce();
  });

  it('legacy type ignores a stray pack_id in the audit metadata', async () => {
    const app = await buildApp();
    await checkout(app, { resource_type: 'AI_TAGGING_CALL', pack_index: 0, pack_id: 'x' });
    expect(m.auditCreate.mock.calls[0]?.[0].data.metadata).not.toHaveProperty('pack_id');
  });

  it('legacy type without pack_index -> 422', async () => {
    const app = await buildApp();
    const res = await checkout(app, { resource_type: 'AI_TAGGING_CALL' });
    expect(res.statusCode).toBe(422);
    expect(m.razorpay).not.toHaveBeenCalled();
  });
});

describe('GET /try-on-packs', () => {
  it('returns active packs for the retailer plan', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/billing/try-on-packs' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: [{ id: 'pack_1', label: '25 try-ons', pack_size: 25, price_paise: 23600 }],
    });
    expect(m.packFindMany).toHaveBeenCalledWith({
      where: {
        resource_type: 'TRY_ON_GENERATION',
        is_active: true,
        price_paise: { gt: 0 },
        pack_size: { gt: 0 },
        OR: [{ plans: { isEmpty: true } }, { plans: { has: 'GROWTH' } }],
      },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
  });

  it.each([
    [
      'override -1',
      () => m.overrideFindUnique.mockResolvedValue({ limit_per_period: -1, period: 'MONTH' }),
    ],
    [
      'plan -1',
      () => m.planLimitFindUnique.mockResolvedValue({ limit_per_period: -1, period: 'MONTH' }),
    ],
    ['no limit row', () => m.planLimitFindUnique.mockResolvedValue(null)],
  ])('returns [] when a pack would credit nothing (%s)', async (_n, arrange) => {
    arrange();
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/billing/try-on-packs' });
    expect(res.json()).toEqual({ data: [] });
  });

  it('returns [] when nothing matches', async () => {
    m.packFindMany.mockResolvedValue([]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/billing/try-on-packs' });
    expect(res.json()).toEqual({ data: [] });
  });

  it('returns [] without querying packs when the plan lacks VIRTUAL_TRY_ON_V2', async () => {
    m.hasFeature.mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/billing/try-on-packs' });
    expect(res.json()).toEqual({ data: [] });
    expect(m.packFindMany).not.toHaveBeenCalled();
  });
});

describe('GET /addon-callback - try-on credit (regression pin)', () => {
  it('decrements the CURRENT-MONTH UsageCounter by quantity (month-end expiry, no carry-over)', async () => {
    const link = 'plink_1';
    const pay = 'pay_1';
    const sig = createHmac('sha256', 'rzp_test_key_secret').update(`${link}|${pay}`).digest('hex');
    m.purchaseFindFirst.mockResolvedValue({
      id: 'purchase_1',
      retailer_id: RETAILER_ID,
      resource_type: 'TRY_ON_GENERATION',
      quantity: 25,
      amount_inr: 23600,
    });
    m.overrideFindUnique.mockResolvedValue(null);
    m.planLimitFindUnique.mockResolvedValue({ limit_per_period: 50, period: 'MONTH' });
    m.usageUpsert.mockResolvedValue({});
    m.purchaseUpdate.mockResolvedValue({});
    m.purchaseUpdateMany.mockResolvedValue({ count: 1 });
    m.razorpay.mockResolvedValue({ amount: 23600, status: 'captured' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/v1/billing/addon-callback?razorpay_payment_id=${pay}&razorpay_payment_link_id=${link}&razorpay_signature=${sig}`,
    });
    expect(res.statusCode).toBe(302);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const call = m.usageUpsert.mock.calls[0]?.[0];
    expect(call.where.retailer_id_resource_type_period_start.period_start).toEqual(monthStart);
    expect(call.update).toEqual({ count: { decrement: 25 } });
    expect(call.create.count).toBe(-25);
  });
});

describe('GET /addon-callback - credits exactly once', () => {
  const link = 'plink_1';
  const pay = 'pay_1';
  const sig = createHmac('sha256', 'rzp_test_key_secret').update(`${link}|${pay}`).digest('hex');
  const url = `/v1/billing/addon-callback?razorpay_payment_id=${pay}&razorpay_payment_link_id=${link}&razorpay_signature=${sig}`;
  const purchase = {
    id: 'purchase_1',
    retailer_id: RETAILER_ID,
    resource_type: 'TRY_ON_GENERATION',
    quantity: 25,
    amount_inr: 23600,
  };

  beforeEach(() => {
    m.purchaseFindFirst.mockResolvedValue(purchase);
    m.razorpay.mockResolvedValue({ amount: 23600, status: 'captured' });
  });

  it('two concurrent callbacks for one link credit once (claim count 1 then 0)', async () => {
    m.purchaseUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const app = await buildApp();
    const [a, b] = await Promise.all([
      app.inject({ method: 'GET', url }),
      app.inject({ method: 'GET', url }),
    ]);
    expect(a.statusCode).toBe(302);
    expect(b.statusCode).toBe(302);
    expect(m.usageUpsert).toHaveBeenCalledOnce();
    expect(m.purchaseUpdateMany.mock.calls[0]?.[0].where).toEqual({
      id: 'purchase_1',
      status: 'PENDING',
    });
  });

  it('a failed credit rolls the claim back (stays PENDING) and is logged, not success', async () => {
    m.purchaseUpdateMany.mockResolvedValue({ count: 1 });
    m.usageUpsert.mockRejectedValue(new Error('db down'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('status=error');
    // the claim lives in the same transaction as the credit, so nothing is
    // marked COMPLETED outside it
    expect(m.purchaseUpdate).not.toHaveBeenCalled();
  });
});
