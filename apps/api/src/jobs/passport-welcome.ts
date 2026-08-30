// Passport welcome dispatch (Task 10).
//
// On STORE_CONSENT_GRANTED, sends the retailer's catalog link to the
// shopper via WhatsApp. Cloud-API-configured retailers send via the
// Meta WhatsApp Cloud API; others get a wa.me deep link surfaced in the
// retailer app (no auto-send).
//
// Gated by canMessage() — respects consent, mute, and frequency cap.

import { prisma } from '@kanchuki/db';
import { normalizeIndianPhone } from '@kanchuki/shared';
import { canMessage, recordMessageSent } from '../lib/messaging-guard.js';

interface WelcomePayload {
  account_id: string;
  retailer_id: string;
}

/**
 * Send a welcome + catalog link to a shopper who just consented.
 * Called from the leads endpoint on STORE_CONSENT_GRANTED.
 * For Cloud-API retailers: sends via Meta WhatsApp Cloud API.
 * For others: no-ops (retailer sees the lead in their CRM).
 */
export async function dispatchWelcome(payload: WelcomePayload): Promise<void> {
  const { account_id, retailer_id } = payload;

  // Gate: consent + mute + frequency cap
  const allowed = await canMessage(account_id, retailer_id);
  if (!allowed) return;

  // Fetch retailer's WhatsApp config
  const retailer = await prisma.retailer.findUnique({
    where: { id: retailer_id },
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
  if (!retailer) return;

  // Fetch the shopper's phone
  const account = await prisma.customerAccount.findUnique({
    where: { id: account_id },
    select: { phone: true, name: true },
  });
  if (!account) return;

  const phone = `91${normalizeIndianPhone(account.phone)}`;
  const catalogUrl = `https://kanchuki.com/${retailer.public_slug || retailer.id}`;
  const shopName = retailer.shop_name;

  // Cloud-API path: send via Meta WhatsApp Cloud API
  if (
    retailer.whatsapp_api_phone_number_id &&
    retailer.whatsapp_api_access_token &&
    retailer.whatsapp_api_template_name
  ) {
    try {
      const templateLang = retailer.whatsapp_api_template_lang || 'en_US';
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
              name: retailer.whatsapp_api_template_name,
              language: { code: templateLang },
              components: [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: account.name || 'there' },
                    { type: 'text', text: shopName },
                    { type: 'text', text: catalogUrl },
                  ],
                },
              ],
            },
          }),
        },
      );

      if (res.ok) {
        await recordMessageSent(account_id, retailer_id);
      }
    } catch {
      // WhatsApp send failed — don't block the consent flow
    }
  }
  // Non-Cloud-API retailers: no auto-send. The lead appears in their
  // CRM and they can follow up manually.
}
