// Passport activity — recordInteraction helper (Task 11).
//
// Every behavioral event (view, favorite, search, etc.) goes through this
// helper. When a passport session is present, the interaction is linked to
// the customer_account_id for cross-store profiling. Fire-and-forget safe —
// never throws into the request path.

import { prisma } from '@kanchuki/db';

// Signal weights for Fashion DNA aggregation (§15.3)
export const SIGNAL_WEIGHTS: Record<string, number> = {
  purchase: 10,
  favorite: 5,
  enquiry: 4,
  try_on: 3,
  collection_open: 2,
  view: 1,
  search: 1,
  store_visit: 1,
  quiz_answer: 1,
  unfavorite: -5,
  not_interested: -5,
};

// Valid interaction types (§15.2)
export type InteractionType =
  | 'view'
  | 'favorite'
  | 'unfavorite'
  | 'enquiry'
  | 'purchase'
  | 'try_on'
  | 'search'
  | 'collection_open'
  | 'not_interested'
  | 'store_visit'
  | 'quiz_answer';

interface RecordInteractionArgs {
  /** Passport account ID — null when the shopper is not authenticated */
  accountId?: string | null;
  /** Retailer-scoped customer ID — for retailer CRM logging */
  customerId?: string;
  retailerId: string;
  productId?: string;
  collectionId?: string;
  type: InteractionType;
  metadata?: Record<string, unknown>;
}

/**
 * Record a behavioral interaction. Writes to CustomerInteraction.
 * When accountId is present, links the interaction to the passport identity.
 *
 * Fire-and-forget: errors are swallowed to never block the caller.
 */
export async function recordInteraction(args: RecordInteractionArgs): Promise<void> {
  const { accountId, customerId, retailerId, productId, collectionId, type, metadata } = args;

  // Validate type
  if (!(type in SIGNAL_WEIGHTS)) {
    console.warn(`[passport-activity] Unknown interaction type: ${type}`);
    return;
  }

  try {
    // If profiling is disabled for this account, skip behavioral writes.
    // Inside the try: this is fire-and-forget — a failed lookup here must be
    // swallowed like a failed write, never thrown into the caller.
    if (accountId) {
      const account = await prisma.customerAccount.findUnique({
        where: { id: accountId },
        select: { profiling_enabled: true },
      });
      if (account && !account.profiling_enabled) return;
    }

    // Use the retailer-scoped customer ID if available, otherwise use a
    // placeholder for the passport-only path (retailer_id is always present)
    const customerRecordId = customerId || '_passport_only_';

    await prisma.customerInteraction.create({
      data: {
        customer_id: customerRecordId,
        retailer_id: retailerId,
        product_id: productId || null,
        collection_id: collectionId || null,
        type,
        metadata: (metadata as any) || undefined,
        customer_account_id: accountId || null,
      },
    });

    // TODO (Task 16): trigger debounced preference_vector recompute
  } catch (err) {
    // Never throw — this is fire-and-forget
    console.error('[passport-activity] Failed to record interaction:', err);
  }
}
