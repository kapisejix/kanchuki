// ─── GST Invoice PDF Generation Job ────────────────────────────────
// Runs on the maintenance queue after a subscription.charged webhook (SubscriptionPayment)
// or an add-on pack purchase callback (QuotaAddonPurchase) records the payment. Generates
// the PDF, uploads to R2, and marks the row generated.

import { randomUUID } from 'node:crypto';
import { uploadBuffer } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import { type InvoicePdfInput, buildGstInvoicePdf } from '../lib/gst-invoice-pdf.js';
import { getMaintenanceQueue } from './queue.js';

/** Exactly one of the two ids: a subscription payment, or an add-on pack purchase. */
export interface GenerateGstInvoiceJobData {
  payment_id?: string;
  addon_purchase_id?: string;
}

/** Enqueue a GST invoice PDF generation job on the shared maintenance queue. */
export async function addGenerateGstInvoiceJob(data: GenerateGstInvoiceJobData): Promise<void> {
  await getMaintenanceQueue().add('generate-gst-invoice', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 50 },
  });
}

/** Seller + buyer blocks shared by both invoice kinds. */
async function loadParties(retailerId: string): Promise<Pick<InvoicePdfInput, 'seller' | 'buyer'>> {
  const [retailer, gstProfile] = await Promise.all([
    prisma.retailer.findUnique({
      where: { id: retailerId },
      select: {
        shop_name: true,
        gstin: true,
        address_line1: true,
        address_line2: true,
        city: true,
        state: true,
      },
    }),
    prisma.platformGstProfile.findUnique({ where: { id: 'singleton' } }),
  ]);

  if (!gstProfile) {
    throw new Error(
      '[gst-invoice] Platform GST profile not configured (PUT /admin/gst-profile) — will retry',
    );
  }

  return {
    seller: {
      name: gstProfile.company_name,
      gstin: gstProfile.gstin,
      address:
        gstProfile.address_line1 +
        (gstProfile.address_line2 ? `, ${gstProfile.address_line2}` : ''),
      city: gstProfile.city,
      state: gstProfile.state,
      stateCode: gstProfile.state_code,
    },
    buyer: {
      name: retailer?.shop_name ?? 'Unknown Retailer',
      gstin: retailer?.gstin ?? null,
      address: retailer?.address_line1 ?? null,
      city: retailer?.city ?? null,
      state: retailer?.state ?? null,
    },
  };
}

function formatInvoiceDate(d: Date | null): string {
  return (d ?? new Date()).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Generate a GST invoice PDF for a SubscriptionPayment (`payment_id`) or an add-on pack
 * purchase (`addon_purchase_id`) and upload to R2.
 * Idempotent: if invoice_generated_at is already set, this is a no-op.
 *
 * Throws (rather than returning) on any missing precondition so BullMQ's
 * retry policy engages — a payment charged before the platform GST profile
 * was configured is then picked up on a later retry / the backfill sweep.
 */
export async function handleGenerateGstInvoice(data: GenerateGstInvoiceJobData): Promise<void> {
  if (data.addon_purchase_id) return generateAddonInvoice(data.addon_purchase_id);
  if (!data.payment_id) {
    throw new Error('[gst-invoice] job has neither payment_id nor addon_purchase_id');
  }

  const payment = await prisma.subscriptionPayment.findUnique({
    where: { id: data.payment_id },
    include: {
      subscription: { select: { plan: true } },
    },
  });

  if (!payment) {
    throw new Error(`[gst-invoice] Payment ${data.payment_id} not found`);
  }

  // Idempotent — already generated
  if (payment.invoice_generated_at) return;

  // Need GST columns to be populated
  if (!payment.gst_invoice_number || !payment.amount_excluding_gst) {
    throw new Error(`[gst-invoice] Payment ${data.payment_id} missing GST columns`);
  }

  const parties = await loadParties(payment.retailer_id);

  const input: InvoicePdfInput = {
    ...parties,
    invoiceNumber: payment.gst_invoice_number,
    invoiceDate: formatInvoiceDate(payment.paid_at),
    planName: `Kanchuki ${payment.subscription.plan} Plan`,
    sacCode: payment.sac_code ?? '998314',
    description: 'Monthly SaaS subscription',
    basePaise: payment.amount_excluding_gst,
    cgstPaise: payment.cgst_amount ?? 0,
    sgstPaise: payment.sgst_amount ?? 0,
    igstPaise: payment.igst_amount ?? 0,
    gstTotalPaise: payment.gst_amount ?? 0,
    grossPaise: payment.amount_inr,
    gstRate: payment.gst_rate ? Number(payment.gst_rate) : 0.18,
    placeOfSupply: payment.place_of_supply,
  };

  // Generate PDF
  const pdfBuffer = await buildGstInvoicePdf(input);

  // Upload to R2 under a random-UUID key (not the sequential invoice number),
  // so the object can't be enumerated. Served only via a short-lived
  // presigned URL from the invoice download routes.
  const r2Key = R2_PATHS.gstInvoice(payment.retailer_id, randomUUID());
  await uploadBuffer(r2Key, pdfBuffer, 'application/pdf');

  // Update the payment row. invoice_generated_at is the "ready" flag.
  await prisma.subscriptionPayment.update({
    where: { id: payment.id },
    data: {
      invoice_r2_key: r2Key,
      invoice_generated_at: new Date(),
    },
  });
}

async function generateAddonInvoice(purchaseId: string): Promise<void> {
  const purchase = await prisma.quotaAddonPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) throw new Error(`[gst-invoice] Add-on purchase ${purchaseId} not found`);
  if (purchase.invoice_generated_at) return;
  if (!purchase.gst_invoice_number || !purchase.amount_excluding_gst) {
    throw new Error(`[gst-invoice] Add-on purchase ${purchaseId} missing GST columns`);
  }

  const parties = await loadParties(purchase.retailer_id);
  const input: InvoicePdfInput = {
    ...parties,
    invoiceNumber: purchase.gst_invoice_number,
    invoiceDate: formatInvoiceDate(purchase.completed_at),
    planName: 'Kanchuki add-on pack',
    sacCode: purchase.sac_code ?? '998314',
    description: `Add-on: ${purchase.quantity} x ${purchase.resource_type}`,
    basePaise: purchase.amount_excluding_gst,
    cgstPaise: purchase.cgst_amount ?? 0,
    sgstPaise: purchase.sgst_amount ?? 0,
    igstPaise: purchase.igst_amount ?? 0,
    gstTotalPaise: purchase.gst_amount ?? 0,
    grossPaise: purchase.amount_inr,
    gstRate: purchase.gst_rate ? Number(purchase.gst_rate) : 0.18,
    placeOfSupply: purchase.place_of_supply,
  };

  const pdfBuffer = await buildGstInvoicePdf(input);
  const r2Key = R2_PATHS.gstInvoice(purchase.retailer_id, randomUUID());
  await uploadBuffer(r2Key, pdfBuffer, 'application/pdf');
  await prisma.quotaAddonPurchase.update({
    where: { id: purchase.id },
    data: { invoice_r2_key: r2Key, invoice_generated_at: new Date() },
  });
}

/**
 * Reconciliation sweep — re-enqueue invoice generation for any successful
 * payment that still has no PDF (e.g. charged before the platform GST profile
 * was filled in, or exhausted its retries). Safe to run repeatedly:
 * handleGenerateGstInvoice is idempotent on invoice_generated_at.
 */
export async function handleBackfillGstInvoices(
  enqueue: (data: GenerateGstInvoiceJobData) => Promise<void>,
): Promise<void> {
  const pending = await prisma.subscriptionPayment.findMany({
    where: {
      status: 'success',
      invoice_generated_at: null,
      gst_invoice_number: { not: null },
    },
    select: { id: true },
    take: 500,
  });
  for (const p of pending) {
    await enqueue({ payment_id: p.id });
  }
  const pendingAddons = await prisma.quotaAddonPurchase.findMany({
    where: {
      status: 'COMPLETED',
      invoice_generated_at: null,
      gst_invoice_number: { not: null },
    },
    select: { id: true },
    take: 500,
  });
  for (const p of pendingAddons) {
    await enqueue({ addon_purchase_id: p.id });
  }
}
