import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { billingRoutes } from './billing.js';

// ─── Mock Prisma ─────────────────────────────────────────────────

const {
  mockRetailerFindUnique,
  mockQuotaAddonPurchaseCreate,
  mockQuotaAddonPurchaseFindFirst,
  mockQuotaAddonPurchaseUpdate,
  mockRetailerLimitOverrideFindUnique,
  mockPlanLimitFindUnique,
  mockUsageCounterUpsert,
  mockSubscriptionFindUnique,
  mockSubscriptionUpdate,
  mockRetailerUpdate,
  mockPlatformGstProfileFindUnique,
  mockSubscriptionPaymentFindUnique,
  mockSubscriptionPaymentCreate,
  mockQueryRaw,
  prismaMock,
} = vi.hoisted(() => {
  const p: Record<string, unknown> = {};
  const m = {
    mockRetailerFindUnique: vi.fn(),
    mockQuotaAddonPurchaseCreate: vi.fn(),
    mockQuotaAddonPurchaseFindFirst: vi.fn(),
    mockQuotaAddonPurchaseUpdate: vi.fn(),
    mockRetailerLimitOverrideFindUnique: vi.fn(),
    mockPlanLimitFindUnique: vi.fn(),
    mockUsageCounterUpsert: vi.fn(),
    mockSubscriptionFindUnique: vi.fn(),
    mockSubscriptionUpdate: vi.fn(),
    mockRetailerUpdate: vi.fn(),
    mockPlatformGstProfileFindUnique: vi.fn(),
    mockSubscriptionPaymentFindUnique: vi.fn(),
    mockSubscriptionPaymentCreate: vi.fn(),
    mockQueryRaw: vi.fn(),
    prismaMock: p,
  };
  Object.assign(p, {
    retailer: {
      findUnique: m.mockRetailerFindUnique,
      findUniqueOrThrow: m.mockRetailerFindUnique,
      update: m.mockRetailerUpdate,
    },
    quotaAddonPurchase: {
      create: m.mockQuotaAddonPurchaseCreate,
      findFirst: m.mockQuotaAddonPurchaseFindFirst,
      update: m.mockQuotaAddonPurchaseUpdate,
    },
    retailerLimitOverride: { findUnique: m.mockRetailerLimitOverrideFindUnique },
    planLimit: { findUnique: m.mockPlanLimitFindUnique },
    usageCounter: { upsert: m.mockUsageCounterUpsert },
    subscription: { findUnique: m.mockSubscriptionFindUnique, update: m.mockSubscriptionUpdate },
    platformGstProfile: { findUnique: m.mockPlatformGstProfileFindUnique },
    subscriptionPayment: {
      findUnique: m.mockSubscriptionPaymentFindUnique,
      create: m.mockSubscriptionPaymentCreate,
    },
    auditLog: { create: vi.fn() },
    $queryRaw: m.mockQueryRaw,
    // Array form runs the ops; callback form gets the same mock as `tx`.
    $transaction: vi.fn((ops: unknown) =>
      Array.isArray(ops)
        ? Promise.all(ops)
        : (ops as (tx: unknown) => unknown)(p),
    ),
  });
  return m;
});

// ─── Mock @kanchuki/db ───────────────────────────────────────────

vi.mock('@kanchuki/db', () => ({
  vaultDelete: vi.fn(),
  getSecret: vi.fn().mockResolvedValue('rzp_test_key_secret'),
  prisma: prismaMock,
  Prisma: {},
}));

// GST invoice job is fire-and-forget from the webhook — stub it so the test
// doesn't spin up a real BullMQ queue / Redis connection.
vi.mock('../jobs/generate-gst-invoice.js', () => ({
  addGenerateGstInvoiceJob: vi.fn().mockResolvedValue(undefined),
}));

// ─── Test Helpers ─────────────────────────────────────────────────

const RETAILER_ID = 'retailer_1';
const RETAILER_PHONE = '+919999999999';
const RETAILER_SHOP = 'Test Shop';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(billingRoutes, { prefix: '/v1/billing' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET /v1/billing/addon-pricing ───────────────────────────────

describe('GET /v1/billing/addon-pricing', () => {
  it('returns addon pricing for all resource types', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/billing/addon-pricing' });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toHaveProperty('PRODUCT_UPLOAD');
    expect(data).toHaveProperty('AI_TAGGING_CALL');
    expect(data).toHaveProperty('IMAGE_CROP');
    expect(data).toHaveProperty('BG_REMOVAL');
    expect(data).toHaveProperty('API_REQUEST');
    // Each resource has at least one pack
    for (const key of Object.keys(data)) {
      expect(data[key].length).toBeGreaterThanOrEqual(1);
      expect(data[key][0]).toHaveProperty('label');
      expect(data[key][0]).toHaveProperty('pack_size');
      expect(data[key][0]).toHaveProperty('price_paise');
    }
    await app.close();
  });
});

// ─── POST /v1/billing/addon-checkout ─────────────────────────────

describe('POST /v1/billing/addon-checkout', () => {
  it('creates a payment link and pending purchase for a valid pack', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      phone: RETAILER_PHONE,
      shop_name: RETAILER_SHOP,
    });
    mockQuotaAddonPurchaseCreate.mockResolvedValue({
      id: 'purchase_1',
      retailer_id: RETAILER_ID,
      resource_type: 'AI_TAGGING_CALL',
      quantity: 100,
      amount_inr: 14900,
      status: 'PENDING',
    });

    const app = await buildApp();

    // Mock global fetch for Razorpay Payment Link API
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'plink_test123',
          short_url: 'https://rzp.io/i/test123',
          status: 'created',
        }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/addon-checkout',
      payload: { resource_type: 'AI_TAGGING_CALL', pack_index: 0 },
    });

    globalThis.fetch = originalFetch;

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.checkout_url).toBe('https://rzp.io/i/test123');
    expect(body.resource_type).toBe('AI_TAGGING_CALL');
    expect(body.quantity).toBe(100);
    expect(body.label).toBe('Extra 100 AI tags');
    expect(body.amount_paise).toBe(14900);

    expect(mockRetailerFindUnique).toHaveBeenCalledWith({
      where: { id: RETAILER_ID },
      select: { phone: true, shop_name: true },
    });
    expect(mockQuotaAddonPurchaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          retailer_id: RETAILER_ID,
          resource_type: 'AI_TAGGING_CALL',
          quantity: 100,
          amount_inr: 14900,
          status: 'PENDING',
        }),
      }),
    );
    await app.close();
  });

  it('creates a payment link for a second-tier pack', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      phone: RETAILER_PHONE,
      shop_name: RETAILER_SHOP,
    });
    mockQuotaAddonPurchaseCreate.mockResolvedValue({ id: 'purchase_2' });

    const app = await buildApp();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'plink_test456',
          short_url: 'https://rzp.io/i/test456',
          status: 'created',
        }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/addon-checkout',
      payload: { resource_type: 'AI_TAGGING_CALL', pack_index: 1 }, // 500 tags
    });

    globalThis.fetch = originalFetch;

    expect(res.statusCode).toBe(200);
    const checkoutBody = res.json() as { data: { quantity: number; amount_paise: number } };
    expect(checkoutBody.data.quantity).toBe(500);
    expect(checkoutBody.data.amount_paise).toBe(59900);
    await app.close();
  });

  it('rejects an invalid resource_type', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/addon-checkout',
      payload: { resource_type: 'INVALID_TYPE', pack_index: 0 },
    });

    expect(res.statusCode).toBe(422);
    expect(mockQuotaAddonPurchaseCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an out-of-range pack_index', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/addon-checkout',
      payload: { resource_type: 'PRODUCT_UPLOAD', pack_index: 99 },
    });

    expect(res.statusCode).toBe(422);
    expect(mockQuotaAddonPurchaseCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a negative pack_index', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/addon-checkout',
      payload: { resource_type: 'PRODUCT_UPLOAD', pack_index: -1 },
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('returns 404 when retailer does not exist', async () => {
    mockRetailerFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/addon-checkout',
      payload: { resource_type: 'PRODUCT_UPLOAD', pack_index: 0 },
    });

    expect(res.statusCode).toBe(404);
    expect(mockQuotaAddonPurchaseCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('handles Razorpay API failure gracefully', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      phone: RETAILER_PHONE,
      shop_name: RETAILER_SHOP,
    });

    const app = await buildApp();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Bad Request - invalid amount'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/addon-checkout',
      payload: { resource_type: 'PRODUCT_UPLOAD', pack_index: 0 },
    });

    globalThis.fetch = originalFetch;

    expect(res.statusCode).toBe(500);
    expect(mockQuotaAddonPurchaseCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('sends the correct payload to Razorpay Payment Links API', async () => {
    mockRetailerFindUnique.mockResolvedValue({
      phone: RETAILER_PHONE,
      shop_name: RETAILER_SHOP,
    });
    mockQuotaAddonPurchaseCreate.mockResolvedValue({ id: 'purchase_3' });

    const app = await buildApp();
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'plink_test',
          short_url: 'https://rzp.io/i/test',
          status: 'created',
        }),
    });
    globalThis.fetch = mockFetch;

    await app.inject({
      method: 'POST',
      url: '/v1/billing/addon-checkout',
      payload: { resource_type: 'BG_REMOVAL', pack_index: 0 },
    });

    globalThis.fetch = originalFetch;

    // Check Razorpay API was called with correct body
    const callArg = JSON.parse((mockFetch.mock.calls[0]?.[1] as { body: string }).body);
    expect(callArg.amount).toBe(9900);
    expect(callArg.currency).toBe('INR');
    expect(callArg.description).toBe('Extra 100 bg removals');
    expect(callArg.customer.name).toBe('Test Shop');
    expect(callArg.customer.contact).toBe('+919999999999');
    expect(callArg.notes.retailer_id).toBe(RETAILER_ID);
    expect(callArg.notes.resource_type).toBe('BG_REMOVAL');
    expect(callArg.notes.quantity).toBe(100);
    expect(callArg.callback_method).toBe('get');
    expect(callArg.callback_url).toContain('/v1/billing/addon-callback');
    await app.close();
  });
});

// ─── GET /v1/billing/addon-callback ──────────────────────────────

describe('GET /v1/billing/addon-callback', () => {
  const VALID_PAYMENT_ID = 'pay_test123';
  const VALID_LINK_ID = 'plink_test123';

  function createValidSignature(linkId: string, paymentId: string): string {
    return createHmac('sha256', 'rzp_test_key_secret')
      .update(`${linkId}|${paymentId}`)
      .digest('hex');
  }

  it('verifies signature and credits usage counter for a limited resource', async () => {
    const signature = createValidSignature(VALID_LINK_ID, VALID_PAYMENT_ID);
    mockQuotaAddonPurchaseFindFirst.mockResolvedValue({
      id: 'purchase_1',
      retailer_id: RETAILER_ID,
      resource_type: 'AI_TAGGING_CALL',
      quantity: 100,
      amount_inr: 14900,
    });
    // No override, so falls back to plan limit
    mockRetailerLimitOverrideFindUnique.mockResolvedValue(null);
    mockRetailerFindUnique.mockResolvedValue({ plan: 'STARTER' });
    mockPlanLimitFindUnique.mockResolvedValue({
      limit_per_period: 575,
      period: 'LIFETIME',
    });
    mockUsageCounterUpsert.mockResolvedValue({ count: -100 });

    const app = await buildApp();
    // Mock fetch for Razorpay payment details call inside the handler
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ amount: 14900, status: 'captured' }),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/billing/addon-callback?razorpay_payment_id=${VALID_PAYMENT_ID}&razorpay_payment_link_id=${VALID_LINK_ID}&razorpay_signature=${signature}`,
    });

    globalThis.fetch = originalFetch;

    // Expect redirect to WEB_URL success page
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('billing/addon-success?status=success');

    expect(mockQuotaAddonPurchaseFindFirst).toHaveBeenCalledWith({
      where: { razorpay_order_id: VALID_LINK_ID, status: 'PENDING' },
    });
    expect(mockUsageCounterUpsert).toHaveBeenCalledOnce();
    const upsertCall = mockUsageCounterUpsert.mock.calls[0]?.[0] as {
      where: {
        retailer_id_resource_type_period_start: { retailer_id: string; resource_type: string };
      };
      create: { count: number };
      update: { count: { decrement: number } };
    };
    expect(upsertCall.where.retailer_id_resource_type_period_start.retailer_id).toBe(RETAILER_ID);
    expect(upsertCall.where.retailer_id_resource_type_period_start.resource_type).toBe(
      'AI_TAGGING_CALL',
    );
    expect(upsertCall.create.count).toBe(-100);
    expect(upsertCall.update.count.decrement).toBe(100);
    expect(mockQuotaAddonPurchaseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'purchase_1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          razorpay_payment_id: VALID_PAYMENT_ID,
        }),
      }),
    );
    await app.close();
  });

  it('marks purchase completed without crediting for unlimited resources', async () => {
    const signature = createValidSignature('plink_unlimited', VALID_PAYMENT_ID);
    mockQuotaAddonPurchaseFindFirst.mockResolvedValue({
      id: 'purchase_2',
      retailer_id: RETAILER_ID,
      resource_type: 'PRODUCT_UPLOAD',
      quantity: 500,
      amount_inr: 39900,
    });
    // No override and no plan limit row = unlimited
    mockRetailerLimitOverrideFindUnique.mockResolvedValue(null);
    mockRetailerFindUnique.mockResolvedValue({ plan: 'PRO' });
    mockPlanLimitFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ amount: 39900, status: 'captured' }),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/billing/addon-callback?razorpay_payment_id=${VALID_PAYMENT_ID}&razorpay_payment_link_id=plink_unlimited&razorpay_signature=${signature}`,
    });

    globalThis.fetch = originalFetch;

    expect(res.statusCode).toBe(302);
    expect(mockUsageCounterUpsert).not.toHaveBeenCalled();
    expect(mockQuotaAddonPurchaseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'purchase_2' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
    await app.close();
  });

  it('returns 400 when payment parameters are missing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/billing/addon-callback',
    });

    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe('INVALID_CALLBACK');
    await app.close();
  });

  it('returns 400 when signature is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/v1/billing/addon-callback?razorpay_payment_id=${VALID_PAYMENT_ID}&razorpay_payment_link_id=${VALID_LINK_ID}`,
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 401 when signature does not match', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/v1/billing/addon-callback?razorpay_payment_id=${VALID_PAYMENT_ID}&razorpay_payment_link_id=${VALID_LINK_ID}&razorpay_signature=invalid_signature`,
    });

    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe('INVALID_SIGNATURE');
    expect(mockQuotaAddonPurchaseFindFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it('redirects with status=unknown when no pending purchase exists', async () => {
    const signature = createValidSignature('plink_orphan', VALID_PAYMENT_ID);
    mockQuotaAddonPurchaseFindFirst.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/v1/billing/addon-callback?razorpay_payment_id=${VALID_PAYMENT_ID}&razorpay_payment_link_id=plink_orphan&razorpay_signature=${signature}`,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('billing/addon-success?status=unknown');
    expect(mockQuotaAddonPurchaseUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('credits via override limit when one exists', async () => {
    const signature = createValidSignature('plink_override', VALID_PAYMENT_ID);
    mockQuotaAddonPurchaseFindFirst.mockResolvedValue({
      id: 'purchase_3',
      retailer_id: RETAILER_ID,
      resource_type: 'TRY_ON',
      quantity: 10,
      amount_inr: 9900,
    });
    // Override exists — should be used instead of plan limit
    mockRetailerLimitOverrideFindUnique.mockResolvedValue({
      limit_per_period: 200,
      period: 'MONTH',
    });
    mockUsageCounterUpsert.mockResolvedValue({ count: -10 });

    const app = await buildApp();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ amount: 9900, status: 'captured' }),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/billing/addon-callback?razorpay_payment_id=${VALID_PAYMENT_ID}&razorpay_payment_link_id=plink_override&razorpay_signature=${signature}`,
    });

    globalThis.fetch = originalFetch;

    expect(res.statusCode).toBe(302);
    expect(mockUsageCounterUpsert).toHaveBeenCalled();
    // Verify we checked override (not plan limit)
    expect(mockRetailerLimitOverrideFindUnique).toHaveBeenCalled();
    await app.close();
  });
});

// ─── POST /v1/billing/webhook (subscription.charged / .activated) ─

describe('POST /v1/billing/webhook', () => {
  const RZP_SUB_ID = 'sub_rzp_1';

  function signedRequest(body: object) {
    const raw = JSON.stringify(body);
    const signature = createHmac('sha256', 'rzp_test_key_secret').update(raw).digest('hex');
    return { raw, signature };
  }

  function chargedEvent(paymentId = 'pay_1') {
    return {
      event: 'subscription.charged',
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        subscription: { entity: { id: RZP_SUB_ID, current_start: 0, current_end: 0 } },
        payment: {
          entity: { id: paymentId, order_id: 'order_1', amount: 117882, status: 'captured' },
        },
      },
    };
  }

  function primeHappyPath() {
    mockSubscriptionFindUnique.mockResolvedValue({
      id: 'db_sub_1',
      retailer_id: RETAILER_ID,
      plan: 'STARTER',
      amount_inr: 99900,
    });
    mockRetailerFindUnique.mockResolvedValue({ state: 'Maharashtra' });
    mockPlatformGstProfileFindUnique.mockResolvedValue({ state_code: '27', invoice_prefix: 'KAN' });
    mockSubscriptionUpdate.mockResolvedValue({});
    mockRetailerUpdate.mockResolvedValue({});
    mockQueryRaw.mockResolvedValue([{ last_number: 1 }]);
    mockSubscriptionPaymentCreate.mockResolvedValue({ id: 'pay_row_1' });
  }

  it('subscription.charged: allocates exactly one invoice number and writes the coded place of supply', async () => {
    primeHappyPath();
    mockSubscriptionPaymentFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const { raw, signature } = signedRequest(chargedEvent());
    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      headers: { 'x-razorpay-signature': signature, 'content-type': 'application/json' },
      payload: raw,
    });

    expect(res.statusCode).toBe(200);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1); // one invoice-number allocation
    expect(mockSubscriptionPaymentCreate).toHaveBeenCalledTimes(1);
    const createArg = mockSubscriptionPaymentCreate.mock.calls[0]?.[0] as {
      data: { place_of_supply: string; gst_invoice_number: string; razorpay_payment_id: string };
    };
    expect(createArg.data.place_of_supply).toBe('27-Maharashtra');
    expect(createArg.data.gst_invoice_number).toBe('KAN/26-27/000001');
    await app.close();
  });

  it('duplicate subscription.charged (same payment id): no second row, no burned invoice number', async () => {
    primeHappyPath();
    mockSubscriptionPaymentFindUnique.mockResolvedValue({ id: 'pay_row_1' }); // already recorded

    const app = await buildApp();
    const { raw, signature } = signedRequest(chargedEvent('pay_1'));
    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      headers: { 'x-razorpay-signature': signature, 'content-type': 'application/json' },
      payload: raw,
    });

    expect(res.statusCode).toBe(200);
    expect(mockQueryRaw).not.toHaveBeenCalled(); // no allocation on replay
    expect(mockSubscriptionPaymentCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('subscription.activated: flips status but never allocates an invoice number', async () => {
    primeHappyPath();
    mockSubscriptionPaymentFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const activated = {
      event: 'subscription.activated',
      created_at: Math.floor(Date.now() / 1000),
      payload: { subscription: { entity: { id: RZP_SUB_ID, current_start: 0, current_end: 0 } } },
    };
    const { raw, signature } = signedRequest(activated);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      headers: { 'x-razorpay-signature': signature, 'content-type': 'application/json' },
      payload: raw,
    });

    expect(res.statusCode).toBe(200);
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockSubscriptionPaymentCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionUpdate).toHaveBeenCalled();
    await app.close();
  });

  it('rejects a bad signature', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      headers: { 'x-razorpay-signature': 'deadbeef', 'content-type': 'application/json' },
      payload: JSON.stringify(chargedEvent()),
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
