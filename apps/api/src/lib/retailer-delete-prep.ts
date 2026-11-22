// Runs before any retailer is hard-deleted. Both steps can fail, and either failure
// must leave the account intact, so callers run this before the vault snapshot.

import { prisma } from '@kanchuki/db';
import { handleGenerateGstInvoice } from '../jobs/generate-gst-invoice.js';
import { AppError } from '../plugins/error-handler.js';
import { razorpay } from '../routes/billing/billing-helpers.js';

const ENDED_AT_RAZORPAY = new Set(['cancelled', 'completed', 'expired']);

/**
 * Cancels every subscription of this retailer still live at Razorpay. Checks all
 * stored ids, not only "active" rows: POST /billing/cancel marks a row CANCELLED
 * even when the Razorpay call failed, so local status cannot be trusted here.
 */
async function cancelLiveSubscriptions(retailerId: string): Promise<void> {
  const [retailer, rows] = await Promise.all([
    prisma.retailer.findUnique({
      where: { id: retailerId },
      select: { razorpay_subscription_id: true },
    }),
    prisma.subscription.findMany({
      where: { retailer_id: retailerId, razorpay_subscription_id: { not: null } },
      select: { razorpay_subscription_id: true },
    }),
  ]);
  const ids = new Set(
    [retailer, ...rows].map((r) => r?.razorpay_subscription_id).filter((id): id is string => !!id),
  );

  for (const id of ids) {
    try {
      // Read first: Razorpay answers 400 when cancelling an already-ended subscription.
      const { status } = await razorpay<{ status: string }>(`/subscriptions/${id}`);
      if (ENDED_AT_RAZORPAY.has(status)) continue;
      await razorpay(`/subscriptions/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ cancel_at_cycle_end: 0 }),
      });
    } catch (err) {
      console.error(`[retailer-delete] could not cancel subscription ${id}`, err);
      throw new AppError(
        'SUBSCRIPTION_CANCEL_FAILED',
        'We could not cancel the active subscription, so the account was not deleted. Please try again or contact support.',
        409,
      );
    }
  }
}

/** The archive stores the PDF key, so a numbered invoice needs its PDF before deletion. */
async function ensureInvoicePdfs(retailerId: string): Promise<void> {
  const where = {
    retailer_id: retailerId,
    gst_invoice_number: { not: null },
    invoice_r2_key: null,
  };
  const [payments, addons] = await Promise.all([
    prisma.subscriptionPayment.findMany({ where, select: { id: true } }),
    prisma.quotaAddonPurchase.findMany({ where, select: { id: true } }),
  ]);
  try {
    for (const p of payments) await handleGenerateGstInvoice({ payment_id: p.id });
    for (const a of addons) await handleGenerateGstInvoice({ addon_purchase_id: a.id });
  } catch (err) {
    console.error(`[retailer-delete] invoice PDF failed for retailer ${retailerId}`, err);
    throw new AppError(
      'INVOICE_PDF_PENDING',
      'An invoice is still being prepared, so the account was not deleted. Please try again shortly.',
      409,
    );
  }
}

export async function prepareRetailerDeletion(retailerId: string): Promise<void> {
  // Cancel first, so no new charge can create an invoice after the PDF pass.
  await cancelLiveSubscriptions(retailerId);
  await ensureInvoicePdfs(retailerId);
}
