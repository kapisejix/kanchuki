// Retailer payout account — T7 of
// docs/tasks/referral-program-retailer-affiliate.md.
//
// Owner decision 2026-09-23: retailers add their OWN Bank/UPI details so
// payouts (T7's job) have somewhere real to go. The entry UI lands in T8
// (mobile, blocked on Play review) / T9 (admin fallback); these endpoints ship
// first so nothing downstream is blocked on UI. ZERO apps/mobile files — the
// Play-review hard constraint holds.
//
// SECURITY MODEL (SECURITY.md — photo-adjacent sensitive data rules applied to
// financial data): raw bank/UPI details are accepted on PUT, used to create
// the RazorpayX Contact + Fund Account, and stored ONLY so a deactivated fund
// account can be recreated (RazorpayX has no update API — deactivate +
// recreate is the documented path). GET returns masked_display only — an
// account number or VPA never travels back to any client, not even the
// owner's. The unique retailer_id makes "replace account" an upsert; the
// previous RazorpayX fund account is deactivated so it can never receive.
//
// Registration note (RC-025): wired in BOTH the barrel (routes/retailers/
// index.ts) and the aggregator (routes/retailers.ts) — the 404 class this repo
// shipped before was a route registered in one and not the other.
import { Prisma, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createBankFundAccount,
  createContact,
  createVpaFundAccount,
  deactivateFundAccount,
} from '../../lib/razorpayx.js';

const putSchema = z.discriminatedUnion('account_type', [
  z.object({
    account_type: z.literal('BANK_ACCOUNT'),
    account_name: z.string().min(1).max(100),
    ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC must look like HDFC0001234'),
    account_number: z.string().min(6).max(35).regex(/^\d+$/, 'Account number must be digits'),
    holder_phone: z
      .string()
      .regex(/^\d{10}$/, 'Phone must be 10 digits')
      .optional(),
  }),
  z.object({
    account_type: z.literal('VPA'),
    vpa_address: z
      .string()
      .min(3)
      .max(50)
      .regex(/^[\w.\-]{2,}@[a-zA-Z]{2,}$/, 'VPA must look like name@bank'),
    holder_phone: z
      .string()
      .regex(/^\d{10}$/, 'Phone must be 10 digits')
      .optional(),
  }),
]);

type PutPayload = z.infer<typeof putSchema>;

/** Mask what UIs render — raw numbers/VPAs never return to any client. */
function maskFor(payload: PutPayload): string {
  if (payload.account_type === 'VPA') return maskVpa(payload.vpa_address);
  const num = payload.account_number;
  return `••••${num.slice(-4)} · ${payload.ifsc}`;
}

function maskVpa(vpa: string): string {
  const [user, handle] = vpa.split('@');
  if (!user || !handle) return '•••';
  return `${user.slice(0, 2)}•••@${handle}`;
}

export const retailersPayoutAccountRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /retailers/me/payout-account ────────────────────────────
  // Masked shape only. 404-shaped { data: null } when none saved — the T8 UI
  // renders an "add account" empty state off this.
  server.get('/me/payout-account', async (request) => {
    const retailerId = request.retailerId;
    const row = await prisma.referralPayoutAccount.findUnique({
      where: { retailer_id: retailerId },
      select: {
        account_type: true,
        masked_display: true,
        is_active: true,
        updated_at: true,
      },
    });
    return { data: row };
  });

  // ─── PUT /retailers/me/payout-account ────────────────────────────
  // Creates the RazorpayX Contact (once) + Fund Account, upserts the row.
  server.put('/me/payout-account', async (request, reply) => {
    const retailerId = request.retailerId;
    const parsed = putSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', status: 422, message: parsed.error.issues[0]?.message },
      });
    }
    const body = parsed.data;

    const retailer = await prisma.retailer.findUnique({
      where: { id: retailerId },
      select: { shop_name: true, phone: true },
    });
    if (!retailer) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', status: 404 } });
    }

    const existing = await prisma.referralPayoutAccount.findUnique({
      where: { retailer_id: retailerId },
    });

    // Contact is created once and reused; RazorpayX has no contact dedupe, so
    // the row is the dedupe (lib/razorpayx.ts contract).
    let contactId = existing?.razorpayx_contact_id ?? null;
    if (!contactId) {
      const contact = await createContact(
        retailer.shop_name || 'Kanchuki retailer',
        body.holder_phone ?? retailer.phone ?? null,
        retailerId,
      );
      contactId = contact.id;
    }

    // Replace = deactivate the old fund account FIRST so it can never receive
    // again, then create the new one. A crash between the two leaves the old
    // account deactivated with no replacement — the retailer simply PUTs
    // again (idempotent from their point of view).
    if (existing?.razorpayx_fund_account_id && existing.is_active) {
      try {
        await deactivateFundAccount(existing.razorpayx_fund_account_id);
      } catch (error) {
        // Non-fatal: an already-deactivated account may 400. Log and continue.
        request.log.warn({ err: error }, 'fund-account deactivate failed during replace');
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

    const row = await prisma.referralPayoutAccount.upsert({
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

    return { data: row };
  });
};
