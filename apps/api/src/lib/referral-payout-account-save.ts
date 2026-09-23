// Shared payout-account save logic — T7 retailer self-serve + T9 admin entry
// must not drift. Extracted from retailers/retailers-payout-account.ts when T9
// needed the SAME upsert semantics (contact reuse, deactivate-then-create
// replacement, masked display) on the admin surface.
//
// THE INVARIANT BOTH SURFACES SHARE: the database stores ONLY RazorpayX
// identifiers + a masked display. Raw bank/UPI details persist solely in
// `bank_details`/`vpa_address` for fund-account recreation (RazorpayX has no
// update API — deactivate + recreate is the documented path), and are never
// returned to any client.

import { Prisma, prisma } from '@kanchuki/db';
import {
  createBankFundAccount,
  createContact,
  createVpaFundAccount,
  deactivateFundAccount,
} from './razorpayx.js';

/** Raw account payload, already validated by the caller's zod schema. */
export type PayoutAccountPayload =
  | {
      account_type: 'BANK_ACCOUNT';
      account_name: string;
      ifsc: string;
      account_number: string;
      holder_phone?: string | null;
    }
  | {
      account_type: 'VPA';
      vpa_address: string;
      holder_phone?: string | null;
    };

export function maskVpa(vpa: string): string {
  const [user, handle] = vpa.split('@');
  if (!user || !handle) return '•••';
  return `${user.slice(0, 2)}•••@${handle}`;
}

/** Mask what UIs render — raw numbers/VPAs never return to any client. */
export function maskFor(payload: PayoutAccountPayload): string {
  if (payload.account_type === 'VPA') return maskVpa(payload.vpa_address);
  return `••••${payload.account_number.slice(-4)} · ${payload.ifsc}`;
}

export type SavePayoutAccountResult = {
  id: string;
  account_type: 'BANK_ACCOUNT' | 'VPA';
  masked_display: string;
  is_active: boolean;
};

/**
 * Create-or-replace the retailer's payout account.
 *
 * Contact is created once and reused (RazorpayX has no contact dedupe — the
 * row is the dedupe). Replacement deactivates the old fund account FIRST so it
 * can never receive again, then creates the new one; a crash between the two
 * leaves the old account deactivated with no replacement, and another PUT
 * fixes it (idempotent from the operator's point of view).
 *
 * `logWarn` receives the deactivate failure (an already-deactivated account
 * may 400) — non-fatal by contract, but never silently swallowed.
 */
export async function savePayoutAccount(params: {
  retailerId: string;
  body: PayoutAccountPayload;
  logWarn: (obj: object, msg: string) => void;
}): Promise<SavePayoutAccountResult> {
  const { retailerId, body } = params;

  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId },
    select: { shop_name: true, phone: true },
  });
  if (!retailer) {
    throw new PayoutAccountNotFoundError(retailerId);
  }

  const existing = await prisma.referralPayoutAccount.findUnique({
    where: { retailer_id: retailerId },
  });

  let contactId = existing?.razorpayx_contact_id ?? null;
  if (!contactId) {
    const contact = await createContact(
      retailer.shop_name || 'Kanchuki retailer',
      body.holder_phone ?? retailer.phone ?? null,
      retailerId,
    );
    contactId = contact.id;
  }

  if (existing?.razorpayx_fund_account_id && existing.is_active) {
    try {
      await deactivateFundAccount(existing.razorpayx_fund_account_id);
    } catch (error) {
      params.logWarn({ err: error }, 'fund-account deactivate failed during replace');
    }
  }

  const fundAccount =
    body.account_type === 'VPA'
      ? await createVpaFundAccount(contactId, body.vpa_address)
      : await createBankFundAccount(contactId, {
          name: body.account_name,
          ifsc: body.ifsc,
          account_number: body.account_number,
        });

  return prisma.referralPayoutAccount.upsert({
    where: { retailer_id: retailerId },
    create: {
      retailer_id: retailerId,
      razorpayx_contact_id: contactId,
      razorpayx_fund_account_id: fundAccount.id,
      account_type: body.account_type,
      masked_display: maskFor(body),
      bank_details:
        body.account_type === 'BANK_ACCOUNT'
          ? {
              name: body.account_name,
              ifsc: body.ifsc,
              account_number: body.account_number,
            }
          : undefined,
      vpa_address: body.account_type === 'VPA' ? body.vpa_address : undefined,
      contact_name: retailer.shop_name || '',
      contact_phone: body.holder_phone ?? retailer.phone ?? null,
      is_active: true,
    },
    update: {
      razorpayx_contact_id: contactId,
      razorpayx_fund_account_id: fundAccount.id,
      account_type: body.account_type,
      masked_display: maskFor(body),
      bank_details:
        body.account_type === 'BANK_ACCOUNT'
          ? {
              name: body.account_name,
              ifsc: body.ifsc,
              account_number: body.account_number,
            }
          : Prisma.DbNull,
      vpa_address: body.account_type === 'VPA' ? body.vpa_address : null,
      contact_phone: body.holder_phone ?? retailer.phone ?? null,
      is_active: true,
    },
    select: { id: true, account_type: true, masked_display: true, is_active: true },
  });
}

/** The retailer id has no Retailer row — caller maps this to a 404. */
export class PayoutAccountNotFoundError extends Error {
  constructor(retailerId: string) {
    super(`payout-account save: retailer ${retailerId} not found`);
    this.name = 'PayoutAccountNotFoundError';
  }
}
