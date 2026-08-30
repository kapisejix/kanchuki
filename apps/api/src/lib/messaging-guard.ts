// Messaging guard — WhatsApp send-time consent enforcement (Task 9).
//
// Every outbound shopper message must pass through canMessage() before
// dispatch. Checks: whatsapp_consent, !is_muted, within frequency cap
// (2 / week / store).

import { prisma } from '@kanchuki/db';

const FREQUENCY_CAP = 2;
const FREQUENCY_WINDOW_DAYS = 7;

/**
 * Check whether a message can be sent to a shopper from a specific store.
 * Returns false if: no consent, store is muted, or frequency cap exceeded.
 */
export async function canMessage(
  accountId: string,
  retailerId: string,
): Promise<boolean> {
  // 1. Check consent + mute status
  const visit = await prisma.customerStoreVisit.findUnique({
    where: {
      customer_account_id_retailer_id: {
        customer_account_id: accountId,
        retailer_id: retailerId,
      },
    },
    select: {
      whatsapp_consent: true,
      is_muted: true,
    },
  });

  if (!visit) return false;
  if (!visit.whatsapp_consent) return false;
  if (visit.is_muted) return false;

  // 2. Frequency cap: count messages sent in the last 7 days
  const windowStart = new Date(Date.now() - FREQUENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recentMessages = await prisma.consentEvent.count({
    where: {
      customer_account_id: accountId,
      retailer_id: retailerId,
      kind: 'MESSAGE_SENT',
      created_at: { gte: windowStart },
    },
  });

  if (recentMessages >= FREQUENCY_CAP) return false;

  return true;
}

/**
 * Record that a message was sent (for frequency cap tracking).
 * Call this AFTER a successful send.
 */
export async function recordMessageSent(
  accountId: string,
  retailerId: string,
): Promise<void> {
  await prisma.consentEvent.create({
    data: {
      customer_account_id: accountId,
      retailer_id: retailerId,
      kind: 'MESSAGE_SENT',
      notice_version: '1.0',
    },
  });
}
