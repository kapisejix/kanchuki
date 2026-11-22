// A deleted retailer must never keep being charged, and a failed cancel must block the
// delete. The self-delete route is pinned here too: prep first, no phone in the audit log.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  razorpay: vi.fn(),
  generate: vi.fn(),
  hardDelete: vi.fn(),
  retailerFindUnique: vi.fn(),
  subFindMany: vi.fn(),
  paymentFindMany: vi.fn(),
  addonFindMany: vi.fn(),
  auditCreate: vi.fn(),
  vaultDelete: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUnique: m.retailerFindUnique },
    subscription: { findMany: m.subFindMany },
    subscriptionPayment: { findMany: m.paymentFindMany },
    quotaAddonPurchase: { findMany: m.addonFindMany },
    auditLog: { create: m.auditCreate },
  },
  vaultDelete: m.vaultDelete,
}));
vi.mock('../routes/billing/billing-helpers.js', () => ({ razorpay: m.razorpay }));
vi.mock('../jobs/generate-gst-invoice.js', () => ({ handleGenerateGstInvoice: m.generate }));
vi.mock('../jobs/purge-retailer-now.js', () => ({ hardDeleteRetailer: m.hardDelete }));

import { errorHandler } from '../plugins/error-handler.js';
import { retailersSettingsRoutes } from '../routes/retailers/retailers-settings.js';
import { prepareRetailerDeletion } from './retailer-delete-prep.js';

const SUB = 'sub_live';
const cancelCalls = () => m.razorpay.mock.calls.filter((c) => String(c[0]).endsWith('/cancel'));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  m.retailerFindUnique.mockResolvedValue({
    id: 'r_1',
    phone: '9000000000',
    razorpay_subscription_id: SUB,
  });
  m.subFindMany.mockResolvedValue([{ razorpay_subscription_id: SUB }]);
  m.paymentFindMany.mockResolvedValue([]);
  m.addonFindMany.mockResolvedValue([]);
  m.razorpay.mockResolvedValue({ status: 'active' });
});

describe('prepareRetailerDeletion', () => {
  it('cancels a live subscription once, immediately', async () => {
    await prepareRetailerDeletion('r_1');
    expect(cancelCalls()).toHaveLength(1);
    expect(cancelCalls()[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ cancel_at_cycle_end: 0 }),
    });
  });

  it.each(['cancelled', 'completed', 'expired'])('treats %s as success', async (status) => {
    m.razorpay.mockResolvedValue({ status });
    await expect(prepareRetailerDeletion('r_1')).resolves.toBeUndefined();
    expect(cancelCalls()).toHaveLength(0);
  });

  it('checks a row marked CANCELLED locally, which may still be live at Razorpay', async () => {
    m.retailerFindUnique.mockResolvedValue({ razorpay_subscription_id: null });
    await prepareRetailerDeletion('r_1');
    expect(cancelCalls()).toHaveLength(1);
  });

  it('a failed cancel throws a clear 409 the app can show', async () => {
    m.razorpay.mockResolvedValueOnce({ status: 'active' }).mockRejectedValueOnce(new Error('down'));
    await expect(prepareRetailerDeletion('r_1')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_CANCEL_FAILED',
      status: 409,
    });
  });

  it('generates a numbered invoice PDF that is still missing', async () => {
    m.paymentFindMany.mockResolvedValue([{ id: 'p_1' }]);
    m.addonFindMany.mockResolvedValue([{ id: 'a_1' }]);
    await prepareRetailerDeletion('r_1');
    expect(m.generate).toHaveBeenCalledWith({ payment_id: 'p_1' });
    expect(m.generate).toHaveBeenCalledWith({ addon_purchase_id: 'a_1' });
  });

  it('a PDF that cannot be generated blocks the delete', async () => {
    m.paymentFindMany.mockResolvedValue([{ id: 'p_1' }]);
    m.generate.mockRejectedValue(new Error('GST profile missing'));
    await expect(prepareRetailerDeletion('r_1')).rejects.toMatchObject({
      code: 'INVOICE_PDF_PENDING',
      status: 409,
    });
  });
});

describe('DELETE /retailers/me', () => {
  async function del() {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.decorateRequest('retailerId', '');
    app.addHook('preHandler', async (req) => {
      req.retailerId = 'r_1';
    });
    await app.register(retailersSettingsRoutes, { prefix: '/v1/retailers' });
    return app.inject({ method: 'DELETE', url: '/v1/retailers/me' });
  }

  it('a failed cancel leaves the account, vault and audit log untouched', async () => {
    m.razorpay.mockRejectedValue(new Error('down'));
    const res = await del();
    expect(res.statusCode).toBe(409);
    expect(res.body).toContain('not deleted');
    expect(m.hardDelete).not.toHaveBeenCalled();
    expect(m.vaultDelete).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it('a successful delete writes no phone to the audit log', async () => {
    const res = await del();
    expect(res.statusCode).toBe(204);
    expect(m.hardDelete).toHaveBeenCalledWith('r_1');
    expect(JSON.stringify(m.auditCreate.mock.calls[0]?.[0])).not.toContain('9000000000');
    expect(m.auditCreate.mock.calls[0]?.[0].data.metadata).toEqual({ hard_delete: true });
  });
});
