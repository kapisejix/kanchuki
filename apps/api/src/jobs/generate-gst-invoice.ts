// ─── GST Invoice PDF Generation Job ────────────────────────────────
// Runs on the maintenance queue after a subscription.charged webhook
// records the payment. Generates the PDF, uploads to R2, and updates
// the SubscriptionPayment row with the URL.

import { prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import { uploadBuffer, publicUrl } from '@kanchuki/ai';
import { buildGstInvoicePdf, type InvoicePdfInput } from '../lib/gst-invoice-pdf.js';

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUES } from '@kanchuki/shared';

export interface GenerateGstInvoiceJobData {
  payment_id: string;
}

let invoiceRedis: Redis | null = null;
let invoiceQueue: Queue | null = null;

function getInvoiceQueue(): Queue {
  if (!invoiceQueue) {
    invoiceRedis ??= new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    invoiceQueue = new Queue(QUEUES.MAINTENANCE, { connection: invoiceRedis });
  }
  return invoiceQueue;
}

/** Enqueue a GST invoice PDF generation job. */
export async function addGenerateGstInvoiceJob(data: GenerateGstInvoiceJobData): Promise<void> {
  await getInvoiceQueue().add('generate-gst-invoice', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 50 },
  });
}

/**
 * Generate a GST invoice PDF for a SubscriptionPayment and upload to R2.
 * Idempotent: if invoice_pdf_url is already set, this is a no-op.
 */
export async function handleGenerateGstInvoice(data: GenerateGstInvoiceJobData): Promise<void> {
  const payment = await prisma.subscriptionPayment.findUnique({
    where: { id: data.payment_id },
    include: {
      subscription: { select: { plan: true } },
    },
  });

  if (!payment) {
    console.error(`[gst-invoice] Payment ${data.payment_id} not found`);
    return;
  }

  // Idempotent — already generated
  if (payment.invoice_pdf_url) return;

  // Need GST columns to be populated
  if (!payment.gst_invoice_number || !payment.amount_excluding_gst) {
    console.error(`[gst-invoice] Payment ${data.payment_id} missing GST columns`);
    return;
  }

  // Load retailer + platform GST profile
  const [retailer, gstProfile] = await Promise.all([
    prisma.retailer.findUnique({
      where: { id: payment.retailer_id },
      select: { shop_name: true, gstin: true, address_line1: true, address_line2: true, city: true, state: true },
    }),
    prisma.platformGstProfile.findUnique({ where: { id: 'singleton' } }),
  ]);

  if (!gstProfile) {
    console.error('[gst-invoice] Platform GST profile not configured — skipping PDF generation');
    return;
  }

  const planName = `Kanchuki ${payment.subscription.plan} Plan`;

  const input: InvoicePdfInput = {
    seller: {
      name: gstProfile.company_name,
      gstin: gstProfile.gstin,
      address: gstProfile.address_line1 + (gstProfile.address_line2 ? `, ${gstProfile.address_line2}` : ''),
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
    invoiceNumber: payment.gst_invoice_number,
    invoiceDate: payment.paid_at
      ? payment.paid_at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    planName,
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

  // Upload to R2
  const r2Key = R2_PATHS.gstInvoice(payment.retailer_id, payment.gst_invoice_number);
  await uploadBuffer(r2Key, pdfBuffer, 'application/pdf');

  const pdfUrl = publicUrl(r2Key);

  // Update the payment row
  await prisma.subscriptionPayment.update({
    where: { id: payment.id },
    data: {
      invoice_pdf_url: pdfUrl,
      invoice_generated_at: new Date(),
    },
  });

  console.log(`[gst-invoice] Generated PDF for ${payment.gst_invoice_number}: ${pdfUrl}`);
}
