// Public staff-invite routes (docs/tasks/staff-invite-tokens.md §5.3/5.4).
//
// The join screen (app/join.tsx, web /join) calls these UNAUTHENTICATED —
// a staff member who hasn't logged in yet has no session. Two surfaces:
//
//   GET  /v1/public/staff-invite/:token  — masked join summary for the
//        invite link. Never returns the raw token or the unmasked phone.
//   POST /v1/public/staff-invite/:token/otp — server sends the OTP to the
//        invite's BOUND phone (the number never crosses the wire to the
//        client, D3).
//
// Security posture (spec §8):
//   - token_hash = sha256(raw) lookup; unknown and expired both 404 (don't
//     leak whether a token ever existed).
//   - Both routes rate-limited per-IP (token-guessing surface).
//   - Derived status: revoked (staff inactive / retailer deleted), expired
//     (pending + past expires_at), else the stored status.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { sendOtpViaMsg91 } from '../../lib/msg91-otp.js';
import { hashStaffInviteToken, maskPhone } from '../../lib/staff-invite.js';
import { AppError, notFound } from '../../plugins/error-handler.js';

type InviteStatus = 'pending' | 'used' | 'expired' | 'revoked';

interface InviteRow {
  id: string;
  status: string;
  expires_at: Date;
  staff: {
    id: string;
    name: string;
    phone: string;
    role: string;
    is_active: boolean;
    retailer: { deleted_at: Date | null; shop_name: string | null; city: string | null };
  };
}

/** Resolve a raw token to its invite row + bound staff, or null. */
async function findInviteByToken(token: string): Promise<InviteRow | null> {
  return prisma.staffInvite.findUnique({
    where: { token_hash: hashStaffInviteToken(token) },
    include: {
      staff: {
        include: {
          retailer: { select: { deleted_at: true, shop_name: true, city: true } },
        },
      },
    },
  });
}

/** Derived status per spec §5.3 — revoked beats expired beats stored. */
function derivedStatus(invite: InviteRow): InviteStatus {
  if (!invite.staff.is_active || invite.staff.retailer.deleted_at) return 'revoked';
  if (invite.status === 'pending' && invite.expires_at.getTime() < Date.now()) return 'expired';
  // Stored status is authoritative once it leaves 'pending' (used/expired/revoked).
  return invite.status as InviteStatus;
}

export const publicStaffInviteRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /v1/public/staff-invite/:token ─────────────────────────
  server.get(
    '/staff-invite/:token',
    {
      config: { rateLimit: { max: 20, timeWindow: 60 * 1000 } },
    },
    async (request, reply) => {
      const { token } = request.params as { token: string };
      if (!token || token.length < 20) throw notFound('Invite');

      const invite = await findInviteByToken(token);
      // Unknown + expired + revoked all read as 404 — don't leak existence.
      if (!invite) throw notFound('Invite');
      const status = derivedStatus(invite);
      if (status === 'used') {
        // Spec §5.3: a USED invite is not a dead end — the member already
        // joined, so the join screen shows "already joined — just log in"
        // instead of the misleading "ask the owner for a new invite" copy.
        // No existence leak beyond what the token holder already knows (they
        // hold the consumed token); expired/revoked/unknown still 404.
        return reply.status(200).send({
          data: {
            shop_name: invite.staff.retailer.shop_name,
            member_name: invite.staff.name,
            role: invite.staff.role,
            phone_masked: maskPhone(invite.staff.phone),
            status: 'used',
          },
        });
      }
      if (status !== 'pending') throw notFound('Invite');

      return reply.status(200).send({
        data: {
          shop_name: invite.staff.retailer.shop_name,
          member_name: invite.staff.name,
          role: invite.staff.role,
          phone_masked: maskPhone(invite.staff.phone),
          status: 'pending',
        },
      });
    },
  );

  // ─── POST /v1/public/staff-invite/:token/otp ────────────────────
  // Server sends the OTP to the invite's bound phone. The client never learns
  // the number — it only gets a masked confirmation (D3).
  server.post(
    '/staff-invite/:token/otp',
    {
      config: { rateLimit: { max: 3, timeWindow: 60 * 1000 } },
    },
    async (request, reply) => {
      const { token } = request.params as { token: string };
      if (!token || token.length < 20) throw notFound('Invite');

      const invite = await findInviteByToken(token);
      // Same code + message as the verify branch in auth.ts — the OTP-send
      // surface and the verify surface speak one language.
      const inviteInvalid = () =>
        new AppError('INVITE_INVALID', 'This invite link is no longer valid.', 400);
      if (!invite) throw inviteInvalid();
      const status = derivedStatus(invite);
      if (status !== 'pending') {
        throw inviteInvalid();
      }

      // sendOtpViaMsg91 throws AppError on Redis/rate-limit/send failure —
      // the caller never reports a send that didn't happen. MSG91's per-phone
      // 60s cooldown guards double-fire.
      const masked = await sendOtpViaMsg91(invite.staff.phone, 'login');
      return reply.status(200).send({ data: { sent_to: masked } });
    },
  );
};
