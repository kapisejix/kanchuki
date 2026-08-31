// Recommendation triggers — proactive WhatsApp notifications (Task 24).
//
// When a product is created, restocked, or has a price drop, find
// customers who have consented and notify them via WhatsApp.
// All sends gated by canMessage() — respects consent, mute, frequency cap.

import { prisma } from '@kanchuki/db';
import { normalizeIndianPhone } from '@kanchuki/shared';
import { canMessage, recordMessageSent } from './messaging-guard.js';

// ─── Shared types ──────────────────────────────────────────────────

interface NotificationResult {
  sent: number;
  skipped: number;
  errors: number;
}

// ─── New Arrival ───────────────────────────────────────────────────

/**
 * Notify customers who visited this store about a new product.
 * Triggered after product create + AI tagging completes.
 * Targets: customers with whatsapp_consent who visited in the last 90 days.
 */
export async function notifyNewArrival(
  retailerId: string,
  productId: string,
  productName: string,
): Promise<NotificationResult> {
  const result: NotificationResult = { sent: 0, skipped: 0, errors: 0 };

  // Find customers who visited this store recently and consented
  const visits = await prisma.customerStoreVisit.findMany({
    where: {
      retailer_id: retailerId,
      whatsapp_consent: true,
      is_muted: false,
      last_visited_at: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
    select: { customer_account_id: true },
  });

  if (visits.length === 0) return result;

  // Get retailer info for message
  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId },
    select: {
      id: true,
      shop_name: true,
      public_slug: true,
      whatsapp_api_phone_number_id: true,
      whatsapp_api_access_token: true,
      whatsapp_api_template_name: true,
      whatsapp_api_template_lang: true,
    },
  });
  if (!retailer) return result;

  const catalogUrl = `https://kanchuki.com/${retailer.public_slug || retailer.id}`;

  for (const visit of visits) {
    try {
      const allowed = await canMessage(visit.customer_account_id, retailerId);
      if (!allowed) {
        result.skipped++;
        continue;
      }

      // Get customer phone
      const account = await prisma.customerAccount.findUnique({
        where: { id: visit.customer_account_id },
        select: { phone: true },
      });
      if (!account) {
        result.errors++;
        continue;
      }

      const sent = await sendWhatsAppTemplate(
        retailer,
        `91${normalizeIndianPhone(account.phone)}`,
        retailer.whatsapp_api_template_name,
        retailer.whatsapp_api_template_lang || 'en_US',
        [retailer.shop_name, productName, catalogUrl],
      );

      if (sent) {
        await recordMessageSent(visit.customer_account_id, retailerId);
        result.sent++;
      } else {
        result.errors++;
      }
    } catch {
      result.errors++;
    }
  }

  return result;
}

// ─── Restock ───────────────────────────────────────────────────────

/**
 * Notify customers who favorited or enquired about a product that it's back.
 * Triggered when a product's status changes from OUT_OF_STOCK/SOLD to AVAILABLE.
 */
export async function notifyRestock(
  retailerId: string,
  productId: string,
  productName: string,
): Promise<NotificationResult> {
  const result: NotificationResult = { sent: 0, skipped: 0, errors: 0 };

  // Find customers who favorited this product (CustomerWishlistItem)
  const wishlistItems = await prisma.customerWishlistItem.findMany({
    where: {
      product_id: productId,
      retailer_id: retailerId,
    },
    select: { customer_account_id: true },
  });

  if (wishlistItems.length === 0) return result;

  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId },
    select: {
      id: true,
      shop_name: true,
      public_slug: true,
      whatsapp_api_phone_number_id: true,
      whatsapp_api_access_token: true,
      whatsapp_api_template_name: true,
      whatsapp_api_template_lang: true,
    },
  });
  if (!retailer) return result;

  const catalogUrl = `https://kanchuki.com/${retailer.public_slug || retailer.id}`;

  for (const item of wishlistItems) {
    try {
      const allowed = await canMessage(item.customer_account_id, retailerId);
      if (!allowed) {
        result.skipped++;
        continue;
      }

      const account = await prisma.customerAccount.findUnique({
        where: { id: item.customer_account_id },
        select: { phone: true },
      });
      if (!account) {
        result.errors++;
        continue;
      }

      const sent = await sendWhatsAppTemplate(
        retailer,
        `91${normalizeIndianPhone(account.phone)}`,
        retailer.whatsapp_api_template_name,
        retailer.whatsapp_api_template_lang || 'en_US',
        [retailer.shop_name, productName, catalogUrl],
      );

      if (sent) {
        await recordMessageSent(item.customer_account_id, retailerId);
        result.sent++;
      } else {
        result.errors++;
      }
    } catch {
      result.errors++;
    }
  }

  return result;
}

// ─── Price Drop ────────────────────────────────────────────────────

/**
 * Notify customers who favorited or enquired about a product of a price drop.
 * Triggered when price_paise decreases.
 */
export async function notifyPriceDrop(
  retailerId: string,
  productId: string,
  productName: string,
  oldPrice: number,
  newPrice: number,
): Promise<NotificationResult> {
  const result: NotificationResult = { sent: 0, skipped: 0, errors: 0 };

  // Find customers who favorited this product
  const wishlistItems = await prisma.customerWishlistItem.findMany({
    where: {
      product_id: productId,
      retailer_id: retailerId,
    },
    select: { customer_account_id: true },
  });

  if (wishlistItems.length === 0) return result;

  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId },
    select: {
      id: true,
      shop_name: true,
      public_slug: true,
      whatsapp_api_phone_number_id: true,
      whatsapp_api_access_token: true,
      whatsapp_api_template_name: true,
      whatsapp_api_template_lang: true,
    },
  });
  if (!retailer) return result;

  const catalogUrl = `https://kanchuki.com/${retailer.public_slug || retailer.id}`;
  const discount = Math.round(((oldPrice - newPrice) / oldPrice) * 100);

  for (const item of wishlistItems) {
    try {
      const allowed = await canMessage(item.customer_account_id, retailerId);
      if (!allowed) {
        result.skipped++;
        continue;
      }

      const account = await prisma.customerAccount.findUnique({
        where: { id: item.customer_account_id },
        select: { phone: true },
      });
      if (!account) {
        result.errors++;
        continue;
      }

      const sent = await sendWhatsAppTemplate(
        retailer,
        `91${normalizeIndianPhone(account.phone)}`,
        retailer.whatsapp_api_template_name,
        retailer.whatsapp_api_template_lang || 'en_US',
        [retailer.shop_name, productName, `${discount}% off`, catalogUrl],
      );

      if (sent) {
        await recordMessageSent(item.customer_account_id, retailerId);
        result.sent++;
      } else {
        result.errors++;
      }
    } catch {
      result.errors++;
    }
  }

  return result;
}

// ─── WhatsApp send helper ──────────────────────────────────────────

async function sendWhatsAppTemplate(
  retailer: {
    whatsapp_api_phone_number_id: string | null;
    whatsapp_api_access_token: string | null;
    whatsapp_api_template_name: string | null;
  },
  phone: string,
  templateName: string | null,
  templateLang: string,
  params: string[],
): Promise<boolean> {
  if (!retailer.whatsapp_api_phone_number_id || !retailer.whatsapp_api_access_token || !templateName) {
    return false;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${retailer.whatsapp_api_phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${retailer.whatsapp_api_access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLang },
            components: [
              {
                type: 'body',
                parameters: params.map((p) => ({ type: 'text', text: p })),
              },
            ],
          },
        }),
      },
    );

    return res.ok;
  } catch {
    return false;
  }
}
