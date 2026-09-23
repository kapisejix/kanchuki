// Retailer self-serve payout account — T7 of
// docs/tasks/referral-program-retailer-affiliate.md.
//
// GET returns the masked shape only; PUT saves via the SHARED lib
// (lib/referral-payout-account-save.ts) that T9's admin entry also uses — one
// save path, two surfaces, so contact reuse / deactivate-then-create / masking
// semantics cannot drift between them. The route adds only auth (retailer JWT
// from index.ts) + validation + status mapping.
//
// Raw bank/UPI details are accepted in the request body but never returned:
// the DB stores them only inside bank_details/vpa_address for recreation, and
// GET selects masked_display alone.
//
// Registered in BOTH the barrel (routes/retailers/index.ts) and the aggregator
// (routes/retailers.ts) — the 404 class this repo shipped before was a route
// registered in one and not the other.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  PayoutAccountNotFoundError,
  savePayoutAccount,
} from '../../lib/referral-payout-account-save.js';

export const putSchema = z.discriminatedUnion('account_type', [
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
  server.put('/me/payout-account', async (request, reply) => {
    const retailerId = request.retailerId;
    const parsed = putSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', status: 422, message: parsed.error.issues[0]?.message },
      });
    }

    try {
      const row = await savePayoutAccount({
        retailerId,
        body: parsed.data,
        logWarn: (obj, msg) => request.log.warn(obj, msg),
      });
      return { data: row };
    } catch (error) {
      if (error instanceof PayoutAccountNotFoundError) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', status: 404 } });
      }
      throw error;
    }
  });
};
