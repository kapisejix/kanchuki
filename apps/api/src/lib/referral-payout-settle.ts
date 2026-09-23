// Shared payout settlement — T7. Extracted from jobs/referral-payout.ts so
// the webhook route and the reconciliation pass apply THE SAME transitions:
// two private copies of "money moved" logic would drift the first time one of
// them was edited (the RC-034 lesson — three hand-written copies of one rule).
import { prisma } from '@kanchuki/db';

/**
 * Apply a terminal provider state to a payout row + its claimed conversions.
 *
 * PAID: row → PAID (+webhook_confirmed only when the WEBHOOK told us —
 *       reconciliation keeps it false, so the flag stays truthful evidence),
 *       claimed conversions → status PAID + paid_at. This is THE only paid_at
 *       writer in the codebase, and it writes only on provider confirmation.
 * FAILED/REVERSED: row → FAILED/REVERSED + sanitized reason, claimed
 *       conversions' payout_id released (their accrued amount returns to the
 *       unsettled pool — money is never lost, never paid twice).
 */
export async function settlePayout(
  payoutRowId: string,
  outcome: 'PAID' | 'FAILED' | 'REVERSED',
  reason: string | null,
  webhookConfirmed = false,
): Promise<'PAID' | 'FAILED' | 'REVERSED'> {
  if (outcome === 'PAID') {
    await prisma.$transaction([
      prisma.referralPayout.update({
        where: { id: payoutRowId },
        data: {
          status: 'PAID',
          webhook_confirmed: webhookConfirmed,
          webhook_confirmed_at: webhookConfirmed ? new Date() : null,
          failure_reason: null,
        },
      }),
      // CAS: only conversions still attached to THIS batch move. A conversion
      // released by a prior reversal must not be re-stamped.
      prisma.referralConversion.updateMany({
        where: { payout_id: payoutRowId, status: { in: ['QUALIFIED', 'PAID'] } },
        data: { status: 'PAID', paid_at: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          actor_type: 'system',
          action: 'REFERRAL_PAYOUT_CONFIRMED',
          resource_type: 'ReferralPayout',
          resource_id: payoutRowId,
          metadata: { outcome, webhook_confirmed: webhookConfirmed },
        },
      }),
    ]);
    return 'PAID';
  }

  await prisma.$transaction([
    prisma.referralPayout.update({
      where: { id: payoutRowId },
      data: { status: outcome, failure_reason: reason ?? 'payout did not settle' },
    }),
    prisma.referralConversion.updateMany({
      where: { payout_id: payoutRowId },
      data: { payout_id: null },
    }),
    prisma.auditLog.create({
      data: {
        actor_type: 'system',
        action: 'REFERRAL_PAYOUT_RELEASED',
        resource_type: 'ReferralPayout',
        resource_id: payoutRowId,
        metadata: { outcome, reason },
      },
    }),
  ]);
  return outcome;
}
