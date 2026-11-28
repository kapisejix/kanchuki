import { beforeEach, describe, expect, it, vi } from 'vitest';

// Add-on packs are invoiced from quota_addon_purchases (not subscription_payments), so
// the referral/commission readers of SubscriptionPayment never see a pack sale.

const m = vi.hoisted(() => ({
  addonFind: vi.fn(),
  addonFindMany: vi.fn(),
  addonUpdate: vi.fn(),
  payFind: vi.fn(),
  payFindMany: vi.fn(),
  payUpdate: vi.fn(),
  retailerFind: vi.fn(),
  gstProfile: vi.fn(),
  upload: vi.fn(),
  pdf: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    quotaAddonPurchase: {
      findUnique: m.addonFind,
      findMany: m.addonFindMany,
      update: m.addonUpdate,
    },
    subscriptionPayment: { findUnique: m.payFind, findMany: m.payFindMany, update: m.payUpdate },
    retailer: { findUnique: m.retailerFind },
    platformGstProfile: { findUnique: m.gstProfile },
  },
}));
vi.mock('@kanchuki/ai', () => ({ uploadBuffer: m.upload }));
vi.mock('../lib/gst-invoice-pdf.js', () => ({ buildGstInvoicePdf: m.pdf }));
vi.mock('./queue.js', () => ({ getMaintenanceQueue: () => ({ add: vi.fn() }) }));

import { handleBackfillGstInvoices, handleGenerateGstInvoice } from './generate-gst-invoice.js';

const PURCHASE = {
  id: 'ap_1',
  retailer_id: 'r_1',
  resource_type: 'TRY_ON_GENERATION',
  quantity: 25,
  amount_inr: 23600,
  gst_invoice_number: 'KAN/26-27/000001',
  amount_excluding_gst: 20000,
  gst_amount: 3600,
  gst_rate: 0.18,
  cgst_amount: null,
  sgst_amount: null,
  igst_amount: 3600,
  sac_code: '998314',
  place_of_supply: null,
  invoice_generated_at: null,
  completed_at: new Date('2026-11-16T10:00:00Z'),
};

beforeEach(() => {
  vi.resetAllMocks();
  m.addonFind.mockResolvedValue(PURCHASE);
  m.addonUpdate.mockResolvedValue({});
  m.retailerFind.mockResolvedValue({ shop_name: 'Test Shop', gstin: null, state: 'Punjab' });
  m.gstProfile.mockResolvedValue({
    company_name: 'Kanchuki',
    gstin: '27ABCDE1234F1Z5',
    address_line1: 'addr',
    address_line2: null,
    city: 'Mumbai',
    state: 'Maharashtra',
    state_code: '27',
  });
  m.pdf.mockResolvedValue(Buffer.from('pdf'));
  m.upload.mockResolvedValue(undefined);
  m.addonFindMany.mockResolvedValue([]);
  m.payFindMany.mockResolvedValue([]);
});

describe('handleGenerateGstInvoice - add-on purchase', () => {
  it('builds the PDF from the purchase GST columns, uploads, and marks it generated', async () => {
    await handleGenerateGstInvoice({ addon_purchase_id: 'ap_1' });
    const input = m.pdf.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      invoiceNumber: 'KAN/26-27/000001',
      basePaise: 20000,
      igstPaise: 3600,
      grossPaise: 23600,
    });
    expect(input.description).toContain('25 x TRY_ON_GENERATION');
    expect(m.upload).toHaveBeenCalledOnce();
    const data = m.addonUpdate.mock.calls[0]?.[0].data;
    expect(typeof data.invoice_r2_key).toBe('string');
    expect(data.invoice_generated_at).toBeInstanceOf(Date);
    expect(m.payFind).not.toHaveBeenCalled(); // never touches subscription payments
  });

  it('RC-201: invoice date is the IST date on a UTC server', async () => {
    const prevTz = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      m.addonFind.mockResolvedValue({
        ...PURCHASE,
        completed_at: new Date('2026-03-31T20:30:00Z'), // 02:00 IST 1 Apr
      });
      await handleGenerateGstInvoice({ addon_purchase_id: 'ap_1' });
      expect(m.pdf.mock.calls[0]?.[0].invoiceDate).toBe('1 Apr 2026');
    } finally {
      process.env.TZ = prevTz;
    }
  });

  it('already generated: no-op (idempotent)', async () => {
    m.addonFind.mockResolvedValue({ ...PURCHASE, invoice_generated_at: new Date() });
    await handleGenerateGstInvoice({ addon_purchase_id: 'ap_1' });
    expect(m.pdf).not.toHaveBeenCalled();
    expect(m.upload).not.toHaveBeenCalled();
  });

  it('missing GST columns throws so BullMQ retries', async () => {
    m.addonFind.mockResolvedValue({ ...PURCHASE, gst_invoice_number: null });
    await expect(handleGenerateGstInvoice({ addon_purchase_id: 'ap_1' })).rejects.toThrow(
      /missing GST columns/,
    );
  });

  it('no platform GST profile throws (retried once the profile exists)', async () => {
    m.gstProfile.mockResolvedValue(null);
    await expect(handleGenerateGstInvoice({ addon_purchase_id: 'ap_1' })).rejects.toThrow(
      /GST profile not configured/,
    );
    expect(m.upload).not.toHaveBeenCalled();
  });

  it('a job with neither id throws', async () => {
    await expect(handleGenerateGstInvoice({})).rejects.toThrow(/neither/);
  });
});

describe('handleBackfillGstInvoices', () => {
  it('re-queues COMPLETED add-on purchases that have a number but no PDF', async () => {
    m.payFindMany.mockResolvedValue([{ id: 'p_1' }]);
    m.addonFindMany.mockResolvedValue([{ id: 'ap_9' }]);
    const enqueue = vi.fn().mockResolvedValue(undefined);
    await handleBackfillGstInvoices(enqueue);
    expect(enqueue).toHaveBeenCalledWith({ payment_id: 'p_1' });
    expect(enqueue).toHaveBeenCalledWith({ addon_purchase_id: 'ap_9' });
    expect(m.addonFindMany.mock.calls[0]?.[0].where).toMatchObject({
      status: 'COMPLETED',
      invoice_generated_at: null,
      gst_invoice_number: { not: null },
    });
  });
});
